import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { allRuntimeStations, candidateToStation, existingStationKeys, isDuplicateCandidate, normalizeUrl, qualityScore, rejectReason, type RadioBrowserCandidate, type DiscoveryMetadata } from '../lib/radio-discovery';
import { middleEastStations } from '../lib/stations/middleEastStations';
import { fallbackStations } from '../lib/stations';
import { startupStations } from '../lib/startupStations';
import { discoveredRadioStations } from '../lib/stations/discoveredRadioStations';
import { probeStream } from '../lib/agents/stream-probe';
import { browserAudioProof } from '../lib/agents/browser-audio-proof';
import { EXPANSION_TARGET, completedExpansionIsReusable, stableStreamEndpoint, temporaryStreamUrl, endpointIdentity, stationAliasKeys, directoryGeographyConflict, candidateNameKey, countryOrder, expansionAdmission, roundRobinCandidates } from '../lib/agents/catalog-expansion';
import { coordinateMatchesStationCountry } from '../lib/geotruth-resolver';
import { countryMetadata } from '../lib/country-metadata';

const target = Number(process.env.CATALOG_EXPANSION_TARGET ?? EXPANSION_TARGET);
const maxProbes = Number(process.env.CATALOG_EXPANSION_MAX_PROBES ?? 3000);
const dryRun = process.env.CATALOG_EXPANSION_DRY_RUN !== 'false';
const api = 'https://de1.api.radio-browser.info/json';
const delay = (ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const safeWebsite = (value?:string) => {try {const u=new URL(value||'');return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}};
async function directory(path:string) {
  for(let retry=0;retry<3;retry++) {
    try {
      const response=await fetch(`${api}${path}`,{headers:{'User-Agent':'WaveAtlasCatalogExpansion/1.0 (https://github.com/Omoluabi1003/WaveAtlas)'},signal:AbortSignal.timeout(15000)});
      if(response.ok)return await response.json();
      if(response.status!==429&&response.status<500)throw new Error(`Directory HTTP ${response.status}`);
    }catch(error){if(retry===2)throw error;}
    await delay(1000*2**retry);
  }
  throw new Error('Directory unavailable after bounded retries');
}
async function main() {
  if(!Number.isInteger(target)||target<350||target>1000||!Number.isInteger(maxProbes)||maxProbes<target||maxProbes>5000)throw new Error('Invalid bounded expansion configuration');
  const generatedAt=new Date().toISOString(),before=[...allRuntimeStations(),...fallbackStations,...middleEastStations,...startupStations];
  // A repeated workflow validates the recorded batch instead of silently adding another 350.
  try {
    const previous=JSON.parse(await readFile('reports/catalog-expansion/result.json','utf8'));
    if(previous.targetMet===true) {
      if(target!==EXPANSION_TARGET||!completedExpansionIsReusable(previous,before))throw new Error('Recorded expansion requires explicit review/revalidation; refusing an accidental second acquisition.');
      console.log(JSON.stringify({phase:'already-complete',added:previous.added,nigeria:previous.nigeria,targetMet:true}));
      return;
    }
    if(previous.added>0)throw new Error('Partial expansion requires explicit resumption review; refusing to reset the acquisition baseline.');
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const accepted=[...discoveredRadioStations];
  const metadata:DiscoveryMetadata[]=JSON.parse(await readFile('lib/stations/discoveredRadioMetadata.json','utf8'));
  const baselineCount=accepted.length,keys=existingStationKeys(before);
  const identities=new Set(before.map(s=>s.station_uuid));
  for(const item of metadata)keys.sourceUuids.add(item.sourceStationUuid);
  const aliases=new Set(before.flatMap(s=>stationAliasKeys(s.country_code,s.name).record));
  const endpoints=new Set(before.map(s=>endpointIdentity(s.url_resolved||s.url)));
  const names=new Set(before.map(s=>`${s.country_code}:${candidateNameKey(s.name)}`));
  const coverage=new Map<string,number>();
  for(const station of before)coverage.set(station.country_code,(coverage.get(station.country_code)??0)+1);
  const inventory:unknown=await directory('/countries');
  if(!Array.isArray(inventory))throw new Error('Invalid country inventory');
  const codes=countryOrder(inventory.map(row=>String(row.iso_3166_1||'').toUpperCase()).filter(code=>!!countryMetadata({countryCode:code})),coverage).slice(0,100);
  const rejected:Record<string,number>={},fetchFailures:string[]=[];
  const reject=(reason:string)=>{rejected[reason]=(rejected[reason]??0)+1;};
  const groups:RadioBrowserCandidate[][]=[];
  let fetched=0;
  for(const code of codes) {
    const candidates:RadioBrowserCandidate[]=[];
    for(let page=0;page<(code==='NG'?3:1);page++) {
      try {
        const query=new URLSearchParams({countrycode:code,hidebroken:'true',is_https:'true',order:'votes',reverse:'true',limit:'250',offset:String(page*250)});
        const rows:unknown=await directory(`/stations/search?${query}`);
        if(!Array.isArray(rows))throw new Error('Invalid station array');
        fetched+=rows.length;
        for(const row of rows) {
          if(!row||typeof row!=='object')continue;
          const candidate={...row,homepage:safeWebsite(row.homepage),favicon:safeWebsite(row.favicon),geo_lat:typeof row.geo_lat==='number'?row.geo_lat:undefined,geo_long:typeof row.geo_long==='number'?row.geo_long:undefined} as RadioBrowserCandidate;
          if(candidate.countrycode?.toUpperCase()!==code){reject('country_response_mismatch');continue;}
          if(typeof candidate.name!=='string'||candidate.name.length>200||/[\x00-\x1f]/.test(candidate.name)){reject('invalid_name');continue;}
          const source=[candidate.url,candidate.url_resolved].find(value=>typeof value==='string'&&value.startsWith('https://')&&!temporaryStreamUrl(value));
          if(!source){reject('no_stable_https_source');continue;}
          candidate.url=source;candidate.url_resolved=source;
          if(directoryGeographyConflict(code,candidate.name!,candidate.homepage)){reject('geography_requires_official_review');continue;}
          if(candidate.geo_lat!==undefined&&candidate.geo_long!==undefined&&!coordinateMatchesStationCountry(candidate.geo_lat,candidate.geo_long,code)){reject('geotruth_coordinate_conflict');continue;}
          const reason=rejectReason(candidate,0,false);
          if(reason){reject(reason);continue;}
          const admission=expansionAdmission({country:code,target,added:0,countryAdded:0,endpoint:candidate.url_resolved||candidate.url||'',sourceUuid:candidate.stationuuid||'',hasHomepage:!!candidate.homepage,browserDecoded:true});
          if(admission){reject(admission);continue;}
          if(isDuplicateCandidate(candidate,keys)||names.has(`${code}:${candidateNameKey(candidate.name)}`)||stationAliasKeys(code,candidate.name).match.some(key=>aliases.has(key))||endpoints.has(endpointIdentity(source))){reject('duplicate_existing');continue;}
          candidates.push(candidate);
        }
        if(rows.length<250)break;
      }catch{fetchFailures.push(code);break;}
      await delay(350);
    }
    groups.push(candidates.sort((a,b)=>qualityScore(b)-qualityScore(a)));
    await delay(350);
  }
  const nigeria=groups[codes.indexOf('NG')]??[];
  const queue=[...nigeria,...roundRobinCandidates(groups.filter((_group,index)=>codes[index]!=='NG'))];
  console.log(JSON.stringify({phase:'candidates',fetched,eligible:queue.length,nigeriaCandidates:nigeria.length,countries:codes.length}));
  const evidence:Array<{stationId:string;name:string;country:string;state?:string;language?:string;sourceStationUuid:string;originalUrl:string;resolvedUrl:string;checkedAt:string;reason:string;bytesSampled:number;browserDecoder:{ok:boolean;reason:string;seconds:number}}>=[];
  const additionsByCountry=new Map<string,number>(),attempted=new Set<string>(),pending=new Set<string>(),pendingNames=new Set<string>();
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  let cursor=0,probes=0;
  try {
    await Promise.all(Array.from({length:6},async()=>{
      const page=await browser.newPage();
      await page.route('**/*',route=>route.abort()); // Samples are blobs; browser never fetches untrusted URLs.
      try {
        while(cursor<queue.length&&probes<maxProbes&&evidence.length<target) {
          const c=queue[cursor++],code=c.countrycode!.toUpperCase(),url=c.url_resolved||c.url!;
          const nameKey=`${code}:${candidateNameKey(c.name!)}`;
          if((additionsByCountry.get(code)??0)>=(code==='NG'?120:20)){reject('country_cap');continue;}
          if(attempted.has(endpointIdentity(url))||pendingNames.has(nameKey)||names.has(nameKey)||stationAliasKeys(code,c.name!).match.some(key=>aliases.has(key))||endpoints.has(endpointIdentity(url))||isDuplicateCandidate(c,keys)){reject('duplicate_candidate');continue;}
          attempted.add(endpointIdentity(url));pendingNames.add(nameKey);probes++;
          try {
            const signal=await probeStream(url);
            if(!signal.ok){reject(`probe_${signal.reason}`);continue;}
            const sampledEndpoint=signal.resolvedUrl||'';
            const endpoint=stableStreamEndpoint(url,sampledEndpoint);
            if(!endpoint){reject('no_stable_canonical_endpoint');continue;}
            const resolvedKey=endpointIdentity(sampledEndpoint);
            if(endpoints.has(resolvedKey)||pending.has(resolvedKey)){reject('duplicate_resolved');continue;}
            pending.add(resolvedKey);
            try {
              const decoder=await browserAudioProof(page,sampledEndpoint,signal.reason);
              const reason=expansionAdmission({country:code,target,added:evidence.length,countryAdded:additionsByCountry.get(code)??0,endpoint,sourceUuid:c.stationuuid!,hasHomepage:!!c.homepage,browserDecoded:decoder.ok});
              if(reason){reject(reason==='browser_decoder_unverified'?decoder.reason:reason);continue;}
              if(stationAliasKeys(code,c.name!).match.some(key=>aliases.has(key))){reject('duplicate_broadcast_alias');continue;}
              const checkedAt=new Date().toISOString();
              const station=candidateToStation({...c,url:endpoint,url_resolved:endpoint},checkedAt);
              if(identities.has(station.station_uuid)){reject('canonical_identity_collision');continue;}
              const languages=(station.language||'').split(',').map(value=>value.trim()).filter(value=>value&&!/^(africa|global|world|unknown)$/i.test(value));
              station.language=languages.length>0&&languages.length<=4&&languages.every(value=>/^[\p{L}\p{M} -]{2,40}$/u.test(value))?languages.join(', '):'Unknown';
              station.country=countryMetadata({countryCode:code})!.name;
              station.normalized_name=candidateNameKey(station.name);
              station.source_confidence=Math.min(0.75,station.source_confidence??0.5);
              station.validation_reason='Radio Browser metadata; live public endpoint audio sampled and Chromium sample decoding confirmed. Geography remains directory-sourced and subject to GeoTruth.';
              accepted.push(station);identities.add(station.station_uuid);endpoints.add(resolvedKey);endpoints.add(endpointIdentity(endpoint));for(const key of stationAliasKeys(code,station.name).record)aliases.add(key);keys.urls.add(resolvedKey);keys.urls.add(normalizeUrl(url));keys.sourceUuids.add(c.stationuuid!);names.add(nameKey);
              metadata.push({stationUuid:station.station_uuid,discoverySource:'radio-browser',sourceStationUuid:c.stationuuid!,verifiedAt:checkedAt,lastSignalCheck:checkedAt,qualityScore:qualityScore(c),resolvedUrl:endpoint});
              additionsByCountry.set(code,(additionsByCountry.get(code)??0)+1);
              evidence.push({stationId:station.station_uuid,name:station.name,country:code,state:station.state,language:station.language,sourceStationUuid:c.stationuuid!,originalUrl:url,resolvedUrl:endpoint,checkedAt,reason:signal.reason,bytesSampled:signal.bytesSampled,browserDecoder:decoder});
              if(evidence.length%25===0)console.log(JSON.stringify({phase:'verified',added:evidence.length,nigeria:additionsByCountry.get('NG')??0,probes}));
            }finally{pending.delete(resolvedKey);}
          }finally{pendingNames.delete(nameKey);}
        }
      }finally{await page.close();}
    }));
  }finally{await browser.close();}
  const refreshable=evidence.filter(row=>/zeno\.fm|zenolive\.com/.test(row.resolvedUrl));
  for(const row of refreshable.slice(0,3)){const refresh=await probeStream(row.resolvedUrl);if(!refresh.ok)throw new Error('Refreshable source failed post-acquisition recheck; refusing publication.');}
  const report={canonicalEndpointPolicy:'Stable HTTPS sources; temporary redirect credentials are never stored as station URLs.',refreshableSourcesRechecked:Math.min(3,refreshable.length),generatedAt,target,added:evidence.length,targetMet:evidence.length>=target,dryRun,baselineDiscovered:baselineCount,inventoryPreserved:true,fetched,eligible:queue.length,probes,countries:Object.fromEntries(additionsByCountry),nigeria:{added:additionsByCountry.get('NG')??0,eligible:nigeria.length,states:[...new Set(evidence.filter(row=>row.country==='NG').map(row=>row.state).filter(Boolean))],languages:[...new Set(evidence.filter(row=>row.country==='NG').map(row=>row.language).filter(Boolean))]},rejected,fetchFailures,evidence,limitations:['Samples prove audio and Chromium decoding at the recorded time; not uninterrupted uptime or every listener region/browser.','Geography/languages are directory metadata, not independently verified broadcaster facts. Unknown city/frequency are never invented.','HLS acquisition awaits full browser transport verification. Existing HLS stations are preserved.']};
  await mkdir('reports/catalog-expansion',{recursive:true});
  await writeFile('reports/catalog-expansion/result.json',JSON.stringify(report,null,2)+'\n');
  const md=`# Verified catalog expansion\n\nTarget: ${target} additional stations. Verified: ${evidence.length}. Target met: ${report.targetMet}. Nigeria: ${report.nigeria.added}. Countries: ${additionsByCountry.size}. Live probes: ${probes}.\n\nEach addition has live audio evidence, HTTPS and a Chromium-decoded sample. Existing stations are preserved. Browser samples do not guarantee uninterrupted playback, regional availability or independently verified geography.\n\n| Country | Additions |\n|---|---:|\n${[...additionsByCountry].map(([code,count])=>`| ${code} | ${count} |`).join('\n')}\n`;
  await writeFile('reports/catalog-expansion/result.md',md);
  // Append only; an unmet target remains explicit in the report instead of adding unverified rows.
  if(!dryRun&&evidence.length) {
    await writeFile('lib/stations/discoveredRadioStations.ts',`import type { Station } from '../stations';\n\n// Generated by verified catalog acquisition; preserve canonical station identities.\nexport const discoveredRadioStations: Station[] = ${JSON.stringify(accepted,null,2)};\n`);
    await writeFile('lib/stations/discoveredRadioMetadata.json',JSON.stringify(metadata,null,2)+'\n');
  }
  console.log(JSON.stringify({...report,evidence:undefined}));
}
main().catch(error=>{console.error(error);process.exit(1);});
