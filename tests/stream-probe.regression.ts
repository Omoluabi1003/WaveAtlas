import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { request } from 'node:http';
import { fetchProbeResource, probeStream, parseStreamPlaylist, hasCmafAudio, hlsAudioSampleKind, type ProbeDependencies } from '../lib/agents/stream-probe';
import { assessStreamProbe, healthEvidenceFromProbe, buildCatalogAudit } from '../lib/agents/station-audit';
import { scheduledHealthBoost } from '../lib/agents/station-health-policy';
import { allRuntimeStations } from '../lib/radio-discovery';
import { fallbackStations } from '../lib/stations';

type Fixture = { body?: Buffer | string; status?: number; location?: string; stall?: boolean };
const aac = Buffer.from([0xff,0xf1,0x50,0x80,...Array(60).fill(0)]);
const origin = 'https://radio.example';
function fixtures(rows: Record<string, Fixture>) {
  const calls: string[] = [];
  const dependencies: ProbeDependencies = {
    resolve: async host => [{ address: host === 'private.example' ? '127.0.0.1' : '8.8.8.8', family: 4 }],
    request: ((target: URL, options: { signal: AbortSignal; lookup: (host:string, opts:object, cb:(err:unknown,ip:string,family:number)=>void)=>void }, callback: (res: unknown)=>void) => {
      calls.push(target.href);
      options.lookup(target.hostname, {}, (_err, ip) => assert.equal(ip, '8.8.8.8', 'connection pins public DNS result'));
      const row = rows[target.pathname] ?? { status: 404 };
      const req = new EventEmitter() as EventEmitter & {end():void};
      req.end = () => {
        const res = new EventEmitter() as EventEmitter & {statusCode:number;headers:object;destroy():void};
        res.statusCode=row.status??200; res.headers=row.location?{location:row.location}:{}; res.destroy=()=>{};
        const abort=()=>req.emit('error', new Error('aborted'));
        options.signal.addEventListener('abort',abort,{once:true});
        callback(res);
        if(!row.stall)queueMicrotask(()=>{res.emit('data',Buffer.from(row.body??''));res.emit('end');options.signal.removeEventListener('abort',abort);});
      };
      return req;
    }) as unknown as typeof request,
  };
  return { dependencies, calls };
}
const box=(type:string,payload:Buffer)=>{const head=Buffer.alloc(8);head.writeUInt32BE(payload.length+8);head.write(type,4);return Buffer.concat([head,payload]);};
const init=(handler:string)=>box('moov',box('trak',box('mdia',box('hdlr',Buffer.concat([Buffer.alloc(8),Buffer.from(handler)])))));
const fragment=Buffer.concat([box('moof',Buffer.alloc(16)),box('mdat',Buffer.alloc(48))]);
async function main() {
  assert.equal(parseStreamPlaylist('not a playlist').kind,'invalid');
  assert.deepEqual(parseStreamPlaylist('[playlist]\nFile1=/audio\nTitle1=Radio').urls,['/audio']);
  assert.equal(hasCmafAudio(init('soun'),fragment),true);
  assert.equal(hasCmafAudio(init('vide'),fragment),false);
  assert.equal(hasCmafAudio(init('soun'),box('mdat',Buffer.alloc(48))),false);
  const ts = (stream:number) => {
    const packet = Buffer.alloc(188); packet[0]=0x47; packet[1]=0x40; packet[3]=0x10;
    Buffer.from([0,0,1,stream,0,0,0x80,0,0]).copy(packet,4); aac.copy(packet,13);
    return Buffer.concat([packet,packet]);
  };
  assert.equal(hlsAudioSampleKind(ts(0xc0)),'aac');
  assert.equal(hlsAudioSampleKind(ts(0xe0)),undefined,'video PES is not audio evidence');
  assert.equal(hlsAudioSampleKind(Buffer.concat([fragment,aac]),init('vide')),undefined,'video CMAF is not audio evidence');
  const documentFixture=fixtures({'/document':{body:'x'.repeat(1200000)}});
  const signal=new AbortController().signal;
  assert.equal((await fetchProbeResource(`${origin}/document`,signal,documentFixture.dependencies,{media:true,maxBytes:1048576})).bytes.length,65536,'media limits remain unchanged');
  assert.equal((await fetchProbeResource(`${origin}/document`,signal,documentFixture.dependencies,{document:true,maxBytes:2000000})).bytes.length,1048576,'explicit document reads remain bounded');
  const f=fixtures({
    '/start':{status:302,location:'/master.m3u8'},
    '/master.m3u8':{body:'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio/live.m3u8"\n#EXT-X-STREAM-INF:CODECS="avc1,mp4a"\n/video.m3u8'},
    '/audio/live.m3u8':{body:'#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nold.aac\n#EXTINF:6,\nnew.aac'},
    '/audio/new.aac':{body:aac},
  });
  const good=await probeStream(`${origin}/start`,200,f.dependencies);
  assert.equal(good.ok,true);assert.equal(good.reason,'audio-hls-aac');
  assert.equal(good.resolvedUrl,`${origin}/master.m3u8`,'keep stable playlist, never finite segment as canonical URL');
  assert.equal(good.sampledUrl,`${origin}/audio/new.aac`);assert.equal(f.calls.length,4);
  const classic=fixtures({'/list.pls':{body:'[playlist]\nFile1=/gone\nFile2=/aac'},'/aac':{body:aac}});
  assert.equal((await probeStream(`${origin}/list.pls`,200,classic.dependencies)).ok,true);
  const cmaf=fixtures({'/live.m3u8':{body:'#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nsegment.m4s'},'/init.mp4':{body:init('soun')},'/segment.m4s':{body:fragment}});
  assert.equal((await probeStream(`${origin}/live.m3u8`,200,cmaf.dependencies)).reason,'audio-hls-cmaf');
  for(const [body,reason] of [
    ['#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\nseg.aac','hls-encrypted-unverified'],
    ['#EXTM3U\n#EXT-X-BYTERANGE:100@0\nseg.aac','hls-byte-range-unverified'],
    ['#EXTM3U\n#EXT-X-TARGETDURATION:6','playlist-empty'],
    ['#EXTM3U\n#EXT-X-TARGETDURATION:6\nmissing.aac','playlist-child-unavailable'],
    ['<html>Radio is available</html>','no-audio-evidence'],
    ['#EXTM3U\n'+'#'.repeat(70000),'playlist-too-large'],
  ]) {
    const data=fixtures({'/live.m3u8':{body}});
    const result=await probeStream(`${origin}/live.m3u8`,200,data.dependencies);
    assert.equal(result.reason,reason);assert.equal(result.outcome,'inconclusive');
  }
  for(const body of ['#EXTM3U\nhttp://private.example/internal','#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI="http://private.example/init"\nseg.m4s','#EXTM3U\n#EXT-X-TARGETDURATION:6\nhttp://private.example/segment']) {
    const data=fixtures({'/root':{body}});
    assert.equal((await probeStream(`${origin}/root`,200,data.dependencies)).reason,'non-public-address');
    assert.equal(data.calls.length,1,'private child never requested');
  }
  const shared=fixtures({'/master':{body:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\n/a\n#EXT-X-STREAM-INF:BANDWIDTH=200\n/b'},'/a':{body:'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nmissing'},'/b':{body:'#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\ngood.m4s'},'/init.mp4':{body:init('soun')},'/good.m4s':{body:fragment}});
  assert.equal((await probeStream(`${origin}/master`,200,shared.dependencies)).ok,true,'alternative rendition can reuse shared init');
  assert.equal(shared.calls.filter(url=>url.endsWith('/init.mp4')).length,1,'shared resources fetched once');
  const loop=fixtures({'/a':{body:'#EXTM3U\n/b'},'/b':{body:'#EXTM3U\n/a'}});
  assert.equal((await probeStream(`${origin}/a`,200,loop.dependencies)).reason,'playlist-loop');assert.equal(loop.calls.length,2);
  const redirects=fixtures(Object.fromEntries(Array.from({length:6},(_,i)=>[`/r${i}`,{status:302,location:`/r${i+1}`}])));
  assert.equal((await probeStream(`${origin}/r0`,200,redirects.dependencies)).reason,'redirect-limit');assert.equal(redirects.calls.length,5);
  const slow=fixtures({'/slow':{stall:true}});
  assert.equal((await probeStream(`${origin}/slow`,15,slow.dependencies)).reason,'timeout');
  const dns=await probeStream(`${origin}/dns`,15,{resolve:()=>new Promise(()=>{})});assert.equal(dns.reason,'timeout');
  const station=allRuntimeStations().find(s=>s.sourceType!=='geoaudio')!;
  const now=new Date().toISOString();
  for(const status of [403,429,451,500,404,410]) {
    const data=fixtures({'/check':{status}}),result=await probeStream(`${origin}/check`,200,data.dependencies);
    const evidence=healthEvidenceFromProbe(station,result,now);
    assert.equal(evidence.status,[404,410].includes(status)?'degraded':'unknown');
    assert.equal(evidence.consecutiveFailures,[404,410].includes(status)?1:0);
    if(status===403)assert.equal(assessStreamProbe(result).category,'access_restricted');
    if(evidence.status==='unknown')assert.equal(scheduledHealthBoost(station,Date.parse(now),{generatedAt:now,cursor:0,records:{[station.url_resolved||station.url]:evidence}}),0);
  }
  const inventory=[...allRuntimeStations(),...fallbackStations],before=JSON.stringify(inventory);
  const audit=buildCatalogAudit([...inventory,...inventory],{});
  assert.equal(audit.canonicalStations,new Set(inventory.filter(s=>s.sourceType!=='geoaudio').map(s=>s.station_uuid)).size);
  assert(audit.entries.some(s=>s.countryCode==='CG'),'Republic Congo inventory included');
  assert.equal(audit.unknown,audit.canonicalStations);assert.equal(JSON.stringify(inventory),before);
  console.log('Stream probe: HLS master/media, CMAF audio, PLS alternatives, stable URLs, SSRF, loops, bounds, deadlines, honest unknown health, canonical catalog coverage passed');
}
main().catch(error=>{console.error(error);process.exit(1);});
