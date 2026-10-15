import type { Station } from '../stations';
import { probeOutcome, type StreamProbe } from './stream-probe';
import type { HealthEvidence } from './station-health-policy';

export type AuditAssessment = { category: 'verified_audio' | 'endpoint_unavailable' | 'access_restricted' | 'network_inconclusive' | 'format_unverified' | 'unsafe_url'; retryable: boolean; action: string };
export function assessStreamProbe(probe: StreamProbe): AuditAssessment {
  if (probe.ok) return { category:'verified_audio',retryable:false,action:'Prioritize this endpoint; verify browser playback before publishing new stations.' };
  if (probeOutcome(probe) === 'unsafe') return { category:'unsafe_url',retryable:false,action:'Review the URL with an authoritative broadcaster source; do not follow unsafe redirects.' };
  if (probe.reason === 'runner-network-restricted' || probe.reason === 'network-or-invalid-url' || probe.reason === 'timeout') return { category:'network_inconclusive',retryable:true,action:'Retest from an appropriately configured runner. A network failure does not establish that the station is offline.' };
  if (/^http-(401|403|429|451)$/.test(probe.reason)) return { category:'access_restricted',retryable:true,action:'Check broadcaster restrictions, location, credentials or throttling; do not bypass access controls.' };
  if (probeOutcome(probe) === 'unavailable') return { category:'endpoint_unavailable',retryable:true,action:'Find the broadcaster’s current official stream and verify it without changing station identity.' };
  return { category:'format_unverified',retryable:true,action:'Inspect the playlist, media format and browser compatibility; retain the station as unknown pending verification.' };
}

export function healthEvidenceFromProbe(station: Station, probe: StreamProbe, checkedAt: string, previous?: HealthEvidence): HealthEvidence {
  const outcome = probeOutcome(probe);
  const recent = previous && Date.parse(checkedAt) >= Date.parse(previous.checkedAt) && Date.parse(checkedAt) - Date.parse(previous.checkedAt) < 48*3600000;
  return { stationId:station.station_uuid,url:station.url_resolved||station.url,checkedAt,status:probe.ok?'healthy':outcome==='unavailable'?'degraded':'unknown',reason:probe.reason,consecutiveFailures:probe.ok?0:outcome==='unavailable'?(recent?previous.consecutiveFailures:0)+1:recent?previous.consecutiveFailures:0,bytesSampled:probe.bytesSampled,responseTimeMs:probe.responseTimeMs,...(probe.ok?{lastSuccessAt:checkedAt}:previous?.lastSuccessAt?{lastSuccessAt:previous.lastSuccessAt}:previous?.status==='healthy'?{lastSuccessAt:previous.checkedAt}:{}),...(probe.resolvedUrl?{resolvedUrl:probe.resolvedUrl}:{}) };
}

export function buildCatalogAudit(stations: Station[], records: Record<string, HealthEvidence>, now = Date.now()) {
  const radio = [...new Map(stations.filter(station => station.sourceType !== 'geoaudio').map(station => [station.station_uuid,station])).values()];
  const entries = radio.map(station => {
    const url=station.url_resolved||station.url,record=records[url];
    const age=record?now-Date.parse(record.checkedAt):Infinity;
    const fresh=age>=0&&age<48*3600000;
    return { stationId:station.station_uuid,name:station.name,country:station.country,countryCode:station.country_code,url,homepage:station.homepage||null,status:fresh?record.status:'unknown',reason:fresh?record.reason:'no-fresh-audio-evidence',checkedAt:record?.checkedAt??null,https:url.startsWith('https://'),hls:/\.m3u8(?:[?#]|$)/i.test(url),browserCheckRequired:true };
  });
  return { generatedAt:new Date(now).toISOString(),canonicalStations:entries.length,uniqueEndpoints:new Set(entries.map(entry=>entry.url)).size,healthy:entries.filter(entry=>entry.status==='healthy').length,degraded:entries.filter(entry=>entry.status==='degraded').length,unknown:entries.filter(entry=>entry.status==='unknown').length,httpEndpoints:entries.filter(entry=>!entry.https).length,missingHomepages:entries.filter(entry=>!entry.homepage).length,entries };
}
