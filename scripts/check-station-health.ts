import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fallbackStations } from '../lib/stations';
import { allRuntimeStations } from '../lib/radio-discovery';
import { healthEvidenceKey, selectHealthBatch, type HealthSnapshot } from '../lib/agents/station-health-policy';
import { probeStream, type StreamProbe } from '../lib/agents/stream-probe';
import { assessStreamProbe, buildCatalogAudit, healthEvidenceFromProbe } from '../lib/agents/station-audit';

async function restrictedRunner() {
  try {
    const policy=JSON.parse(await readFile('/etc/codex/network-policy.json','utf8'));
    // The pinned native transport requires direct TCP access. Do not mistake a restricted runner for dead stations.
    return policy.http_network_policy?.type==='restricted' && !(policy.tcp_network_access?.domains?.length || policy.tcp_network_access?.ip_ranges?.length);
  } catch { return false; }
}

async function main() {
  const file='lib/stations/stationHealthSnapshot.json';
  const snapshot: HealthSnapshot=JSON.parse(await readFile(file,'utf8'));
  const stations=[...allRuntimeStations(),...fallbackStations];
  const full=process.env.STATION_HEALTH_FULL_AUDIT==='true';
  const staticOnly=process.env.STATION_HEALTH_STATIC_ONLY==='true';
  const configuredLimit=Number(process.env.STATION_HEALTH_LIMIT??120);
  if(!Number.isFinite(configuredLimit)||configuredLimit<1)throw new Error('STATION_HEALTH_LIMIT must be positive.');
  const batch=selectHealthBatch(stations,full?0:snapshot.cursor,full?Math.min(10000,stations.length):Math.min(250,configuredLimit));
  const generatedAt=new Date().toISOString();
  const blocked=staticOnly||await restrictedRunner();
  const results:Array<{stationId:string;name:string;url:string;status:string;reason:string;assessment:ReturnType<typeof assessStreamProbe>;resolvedUrl?:string;bytesSampled:number}>=[];
  let cursor=0;
  if(!blocked)await Promise.all(Array.from({length:Math.min(6,batch.stations.length)},async()=>{
    while(cursor<batch.stations.length){
      const station=batch.stations[cursor++],url=healthEvidenceKey(station);
      const probe=await probeStream(url);
      const record=healthEvidenceFromProbe(station,probe,new Date().toISOString(),snapshot.records[url]);
      snapshot.records[url]=record;
      results.push({stationId:station.station_uuid,name:station.name,url,status:record.status,reason:probe.reason,assessment:assessStreamProbe(probe),resolvedUrl:probe.resolvedUrl,bytesSampled:probe.bytesSampled});
    }
  }));
  if(!blocked){snapshot.generatedAt=generatedAt;snapshot.cursor=batch.cursor;}
  if(!blocked&&process.env.STATION_HEALTH_DRY_RUN!=='true')await writeFile(file,`${JSON.stringify(snapshot,null,2)}\n`);
  const audit=buildCatalogAudit(stations,snapshot.records);
  const networkProbe:StreamProbe={ok:false,reason:'runner-network-restricted',status:0,bytesSampled:0,responseTimeMs:0};
  const report={generatedAt,catalogSize:batch.catalogSize,checked:results.length,healthy:results.filter(row=>row.status==='healthy').length,degraded:results.filter(row=>row.status==='degraded').length,unknown:blocked?audit.unknown:results.filter(row=>row.status==='unknown').length,scope:full?'full-catalog':'rotating-batch',network:blocked?(staticOnly?'static-only':'runner-restricted'):'live-probes',preserved:true,results,...(blocked?{notice:assessStreamProbe(networkProbe).action}:{})};
  await mkdir('reports',{recursive:true});
  await writeFile('reports/station-health-report.json',`${JSON.stringify(report,null,2)}\n`);
  await writeFile('reports/station-health-report.md',`# WaveAtlas Stream Health Agent\n\nChecked: ${report.checked} of ${report.catalogSize}. Verified audio: ${report.healthy}. Unavailable endpoints: ${report.degraded}. Inconclusive: ${report.unknown}.\n\n${blocked?'No live broadcaster probes were performed; health snapshot and cursor were preserved.':'Stream failures and inconclusive probes are reported separately.'}\n\nNo station was deleted, retired, disabled, or relabeled permanently offline.\n`);
  await writeFile('reports/station-catalog-audit.json',`${JSON.stringify(audit,null,2)}\n`);
  await writeFile('reports/station-catalog-audit.md',`# WaveAtlas catalog audit\n\nCanonical radio stations: ${audit.canonicalStations}. Unique endpoints: ${audit.uniqueEndpoints}. Fresh verified audio: ${audit.healthy}. Unknown: ${audit.unknown}. HTTP-only endpoints: ${audit.httpEndpoints}. Missing broadcaster homepages: ${audit.missingHomepages}.\n\nThese inventory counts are not a live playability claim.\n\n| Station | Country | Health evidence | Review priority |\n|---|---|---|---|\n${audit.entries.map(row=>`| ${row.name.replaceAll('|','/')} | ${row.country} | ${row.status} | ${!row.https?'Find official HTTPS endpoint':row.hls?'HLS/browser verification':!row.homepage?'Confirm official broadcaster source':'Recheck current endpoint'} |`).join('\n')}\n`);
  console.log(JSON.stringify({...report,results:undefined}));
}
main().catch(error=>{console.error(error);process.exit(1);});
