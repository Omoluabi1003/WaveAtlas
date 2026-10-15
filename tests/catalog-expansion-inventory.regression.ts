import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { allRuntimeStations, type DiscoveryMetadata } from '../lib/radio-discovery';
import { fallbackStations } from '../lib/stations';
import { startupStations } from '../lib/startupStations';
import { middleEastStations } from '../lib/stations/middleEastStations';
import { discoveredRadioStations } from '../lib/stations/discoveredRadioStations';
import { completedExpansionIsReusable, directoryGeographyConflict, endpointIdentity, stationAliasKeys, temporaryStreamUrl } from '../lib/agents/catalog-expansion';
async function main() {
 let report;
 try {report=JSON.parse(await readFile('reports/catalog-expansion/result.json','utf8'));}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){console.log('Acquisition inventory: no measured batch present; admission tests remain separate');return;}throw error;}
 const records=new Map(discoveredRadioStations.map(station=>[station.station_uuid,station]));
 const provenance:DiscoveryMetadata[]=JSON.parse(await readFile('lib/stations/discoveredRadioMetadata.json','utf8'));
 const metadata=new Map(provenance.map(row=>[row.stationUuid,row]));
 assert.equal(report.evidence.length,report.added);
 assert.equal(report.inventoryPreserved,true);
 const ids=new Set<string>(),sourceIds=new Set<string>(),counts:Record<string,number>={};
 const before=[...allRuntimeStations(),...fallbackStations,...startupStations,...middleEastStations].filter(station=>!report.evidence.some((row:{stationId:string})=>row.stationId===station.station_uuid));
 const endpoints=new Set(before.map(station=>endpointIdentity(station.url_resolved||station.url)));
 const aliases=new Set(before.flatMap(station=>stationAliasKeys(station.country_code,station.name).record));
 for(const proof of report.evidence) {
  const station=records.get(proof.stationId);assert(station,proof.stationId);
  assert(!ids.has(proof.stationId));ids.add(proof.stationId);
  assert(!sourceIds.has(proof.sourceStationUuid));sourceIds.add(proof.sourceStationUuid);
  assert.equal(metadata.get(proof.stationId)?.sourceStationUuid,proof.sourceStationUuid);
  assert.equal(metadata.get(proof.stationId)?.resolvedUrl,proof.resolvedUrl);
  assert.equal(station.url,proof.resolvedUrl);assert.equal(station.url_resolved,proof.resolvedUrl);
  assert.equal(temporaryStreamUrl(station.url),false,'never persist a short-lived redirect token');
  assert.equal(proof.browserDecoder.ok,true);assert(proof.browserDecoder.seconds>=0.15);assert(proof.bytesSampled>0);
  assert.equal(directoryGeographyConflict(station.country_code,station.name,station.homepage),false);
  const identity=endpointIdentity(station.url);assert(!endpoints.has(identity),`duplicate endpoint: ${station.name}`);endpoints.add(identity);
  const keySet=stationAliasKeys(station.country_code,station.name);
  assert(!keySet.match.some(key=>aliases.has(key)),`duplicate broadcast identity: ${station.name}`);
  for(const key of keySet.record)aliases.add(key);
  counts[station.country_code]=(counts[station.country_code]??0)+1;
 }
 assert.deepEqual(counts,report.countries);
 assert.equal(counts.NG,report.nigeria.added);
 if(report.targetMet)assert.equal(completedExpansionIsReusable(report,discoveredRadioStations),true);
 console.log(`Acquisition inventory: ${report.added} measured records match canonical inventory/provenance, stable endpoints, decoder evidence and country totals without baseline duplicates`);
}
main().catch(error=>{console.error(error);process.exit(1);});
