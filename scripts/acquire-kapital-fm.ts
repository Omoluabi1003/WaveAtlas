import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {allRuntimeStations,type DiscoveryMetadata,type RadioBrowserCandidate} from '../lib/radio-discovery';
import {discoveredRadioStations} from '../lib/stations/discoveredRadioStations';
import {fallbackStations,type Station} from '../lib/stations';
import {middleEastStations} from '../lib/stations/middleEastStations';
import {fetchProbeResource,probeStream} from '../lib/agents/stream-probe';
import {browserAudioProof} from '../lib/agents/browser-audio-proof';
import {endpointIdentity,stableStreamEndpoint,temporaryStreamUrl} from '../lib/agents/catalog-expansion';
import {healthEvidenceFromProbe} from '../lib/agents/station-audit';
import type {HealthSnapshot} from '../lib/agents/station-health-policy';

type Source={url:string;homepage:string;source:string;sourceUuid?:string};
async function publicPage(input:string){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{let url=input;for(let hop=0;hop<4;hop++){const page=await fetchProbeResource(url,controller.signal,{}, {media:true,document:true,maxBytes:1048576});if(page.redirect){url=new URL(page.redirect,url).href;continue;}return{url,status:page.status,text:page.bytes.toString('utf8')};}throw new Error('redirect_limit');}
 finally{clearTimeout(timer);}
}
async function main(){
 const revision=createHash('sha256').update(await readFile('scripts/acquire-kapital-fm.ts','utf8')).digest('hex');
 try{const previous=JSON.parse(await readFile('reports/kapital-fm/result.json','utf8'));if(previous.verifierRevision===revision){console.log(JSON.stringify(previous));return;}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const before=[...allRuntimeStations(),...fallbackStations,...middleEastStations],checkedAt=new Date().toISOString();
 const report:{verifierRevision:string;checkedAt:string;status:string;directory:unknown[];pages:unknown[];attempts:unknown[];stationId?:string;endpoint?:string;browserDecoder?:unknown}={verifierRevision:revision,checkedAt,status:'not_verified',directory:[],pages:[],attempts:[]};
 const existing=before.find(station=>station.country_code==='NG'&&/\bkapital\b/i.test(station.name));
 if(existing){
  try{const previous=JSON.parse(await readFile('reports/kapital-fm/result.json','utf8'));if(previous.stationId===existing.station_uuid&&['added','already_present'].includes(previous.status)){console.log(JSON.stringify(previous));return;}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  report.status='already_present';report.stationId=existing.station_uuid;
 }
 const sources:Source[]=[],homepages=new Set(['https://kapitalfm.gov.ng/']);
 if(!existing)for(const name of ['kapital','capital','kapital-global']){
  try{
   const query=new URLSearchParams({name:name==='kapital-global'?'kapital':name,limit:'100',...(name==='kapital-global'?{}:{countrycode:'NG'})});
   const response=await fetch(`https://de1.api.radio-browser.info/json/stations/search?${query}`,{headers:{'User-Agent':'WaveAtlasStationSteward/1.0'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error(`directory_http_${response.status}`);
   const rows:RadioBrowserCandidate[]=await response.json();
   for(const row of rows){
    if(row.countrycode?.toUpperCase()!=='NG'&&!/abuja|kapitalfm\.gov\.ng/i.test(`${row.name} ${row.state} ${row.homepage}`))continue;
    report.directory.push({name:row.name,state:row.state,homepage:row.homepage,url:row.url,urlResolved:row.url_resolved,lastCheckOk:row.lastcheckok});
    if(!/kapital/i.test(row.name||'')&&!/abuja|fct/i.test(`${row.name} ${row.state}`))continue;
    if(row.homepage&&/^https?:\/\//.test(row.homepage))homepages.add(row.homepage);
    for(const url of [row.url,row.url_resolved])if(url?.startsWith('https://')&&!temporaryStreamUrl(url))sources.push({url,homepage:row.homepage||'https://kapitalfm.gov.ng/',source:'radio-browser',sourceUuid:row.stationuuid});
   }
  }catch(error){report.directory.push({query:name,error:error instanceof Error?error.message:'directory_unavailable'});}
 }
 const pages=[...homepages,'https://liveonlineradio.net/kapital-fm','https://onlineradiobox.com/ng/kapitalfm/','https://onlineradiobox.com/ng/kapital929fm/'].slice(0,8),seenPages=new Set<string>();
 for(let index=0;!existing&&index<pages.length&&index<9;index++){
  const url=pages[index];if(seenPages.has(url))continue;seenPages.add(url);
  try{
   const page=await publicPage(url);report.pages.push({url:page.url,status:page.status,title:page.text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1],bytes:Buffer.byteLength(page.text),playerHints:[...page.text.matchAll(/.{0,60}(?:<iframe|<audio|<source|data-stream|data-qt[^=]*=|stream\.zeno|listen.live|live.stream|icecast|shoutcast|radiocast|radio\.co\b).{0,160}/gi)].map(match=>match[0]).slice(0,25)});
   if(page.status!==200)continue;
   const official=[...homepages].some(home=>{try{return new URL(home).hostname===new URL(url).hostname;}catch{return false;}})&&/kapital/i.test(page.text);
   const identifiedDirectory=/liveonlineradio\.net|onlineradiobox\.com/.test(new URL(url).hostname)&&/kapital/i.test(page.text)&&/abuja/i.test(page.text);
   if(!official&&!identifiedDirectory&&!/zeno\.fm\//.test(url))continue;
   for(const tag of page.text.matchAll(/(?:href|src)=["']([^"']+)["']/gi)){
    try{const link=new URL(tag[1].replace(/&amp;/g,'&'),page.url);if(link.protocol==='https:'&&link.origin===new URL(page.url).origin&&!/\.(?:css|js|map|png|jpg)(?:[?#]|$)/i.test(link.href)&&!/\/wp-content\/|\/wp-includes\//i.test(link.pathname)&&/listen|live|player|stream/i.test(link.pathname)&&pages.length<9)pages.push(link.href);}catch{/* Ignore malformed links. */}
   }
   const html=page.text.replace(/\\\//g,'/').replace(/&amp;/g,'&');
   for(const match of html.matchAll(/(?:<(?:audio|source)\b[^>]*?\bsrc|data-(?:stream|radio-url|audio-url|qtmplayer-file(?:_mobile)?))=["']([^"']+)["']/gi)){
    try{const published=match[1].replace(/&#0?39;|&apos;/gi,"'").replace(/&quot;/gi,'"').trim();
     const normalized=published.replace(/["']+$/g,'').replace(/\/?;\/?$/,'');
     const media=new URL(normalized,page.url);if(media.protocol==='https:'&&!temporaryStreamUrl(media.href))sources.push({url:media.href,homepage:[...homepages][0],source:page.url});}catch{/* Ignore malformed media references. */}
   }
   for(const match of html.matchAll(/https?:\/\/[^\s"'<>\\]+/g)){
    const candidate=match[0];let parsed:URL;try{parsed=new URL(candidate);}catch{continue;}
    if(parsed.protocol!=='https:')continue;
    if((/\.m3u8?(?:[?#]|$)|\.pls(?:[?#]|$)|\.(?:mp3|aac|ogg)(?:[?#]|$)|\/livestream-redirect\//i.test(candidate)&&/live|stream|radio|listen|kapital/i.test(parsed.hostname+parsed.pathname))||/^(stream(?:-\d+)?\.zeno\.fm|stream\.zenolive\.com)$/.test(parsed.hostname)){
     if(!temporaryStreamUrl(candidate))sources.push({url:candidate,homepage:[...homepages][0],source:page.url});
    }else if(/^(?:www\.)?zeno\.fm$/.test(parsed.hostname)&&/kapital|player|radio\//i.test(parsed.pathname)&&pages.length<9)pages.push(candidate);
   }
  }catch{report.pages.push({url,status:'network_inconclusive'});}
 }
 if(!existing)sources.push({url:'https://radionghq.radioca.st/stream',homepage:'https://kapitalfm.gov.ng/',source:'https://github.com/junguler/m3u-radio-music-playlists/blob/5990bd446465a64bb5dc089f71bc1bb9532f157b/world-radio_map/ng-abuja.m3u'});
 if(!existing&&sources.length){
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/google-chrome',args:['--no-sandbox']});
  try{
   const page=await browser.newPage();await page.route('**/*',route=>route.abort());
   const seen=new Set<string>();
   for(const source of sources.slice(0,15)){
    if(seen.has(endpointIdentity(source.url)))continue;seen.add(endpointIdentity(source.url));
    const probe=await probeStream(source.url);const endpoint=probe.resolvedUrl?stableStreamEndpoint(source.url,probe.resolvedUrl):undefined;
    const decoder=probe.ok&&endpoint?await browserAudioProof(page,probe.resolvedUrl!,probe.reason):undefined;
    report.attempts.push({url:source.url,source:source.source,reason:probe.reason,status:probe.status,bytesSampled:probe.bytesSampled,decoder});
    if(!probe.ok||!endpoint||!decoder?.ok)continue;
    const duplicate=before.find(station=>endpointIdentity(station.url_resolved||station.url)===endpointIdentity(endpoint));
    if(duplicate){report.status='endpoint_conflict';report.stationId=duplicate.station_uuid;break;}
    const now=new Date().toISOString(),id='ng-kapital-fm-abuja';
    const station:Station={id,station_uuid:id,name:'Kapital 92.9 FM Abuja',url:endpoint,url_resolved:endpoint,homepage:source.homepage,favicon:'',country:'Nigeria',country_code:'NG',state:'Federal Capital Territory',city:'Abuja',language:'Unknown',tags:['radio'],codec:probe.reason.slice(6).toUpperCase(),bitrate:0,votes:0,click_count:0,health_score:75,is_active:true,last_check_ok:true,last_checked_at:now,failure_count:0,response_time_ms:probe.responseTimeMs,curation_source:source.source,curation_tier:source.source==='radio-browser'?'radio_browser':source.source.startsWith('https://kapitalfm.gov.ng/')?'curated_atlas':'community_signal',source_confidence:0.7,validation_status:'verified',verification_status:'verified',validation_reason:'Kapital FM Abuja targeted lookup; live public HTTPS audio and Chromium sample decoding verified. No precise transmitter coordinates or frequency inferred.'};
    const metadata:DiscoveryMetadata[]=JSON.parse(await readFile('lib/stations/discoveredRadioMetadata.json','utf8'));
    metadata.push({stationUuid:id,discoverySource:source.source,sourceStationUuid:source.sourceUuid||'kapital-fm-abuja-public-reference',verifiedAt:now,lastSignalCheck:now,qualityScore:75,resolvedUrl:endpoint});
    await writeFile('lib/stations/discoveredRadioStations.ts',`import type { Station } from '../stations';\n\n// Generated verified acquisitions; preserve canonical station identities.\nexport const discoveredRadioStations: Station[] = ${JSON.stringify([...discoveredRadioStations,station],null,2)};\n`);
    await writeFile('lib/stations/discoveredRadioMetadata.json',JSON.stringify(metadata,null,2)+'\n');
    const health:HealthSnapshot=JSON.parse(await readFile('lib/stations/stationHealthSnapshot.json','utf8'));
    health.records[endpoint]={...healthEvidenceFromProbe(station,probe,now,health.records[endpoint]),resolvedUrl:endpoint};health.generatedAt=now;
    await writeFile('lib/stations/stationHealthSnapshot.json',JSON.stringify(health,null,2)+'\n');
    report.status='added';report.stationId=id;report.endpoint=endpoint;report.browserDecoder=decoder;break;
   }
  }finally{await browser.close();}
 }
 await mkdir('reports/kapital-fm',{recursive:true});await writeFile('reports/kapital-fm/result.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exit(1);});
