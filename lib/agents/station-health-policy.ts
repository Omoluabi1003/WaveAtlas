import snapshot from '../stations/stationHealthSnapshot.json';
import type { Station } from '../stations';

export type HealthEvidence = { stationId: string; url: string; checkedAt: string; status: 'healthy' | 'degraded' | 'unknown'; lastSuccessAt?: string; resolvedUrl?: string; reason: string; consecutiveFailures: number; bytesSampled: number; responseTimeMs: number };
export type HealthSnapshot = { generatedAt: string | null; cursor: number; records: Record<string, HealthEvidence> };
export type StationSignalTier = 'live' | 'watch' | 'recovering';
export const HEALTH_EVIDENCE_TTL_MS = 48 * 60 * 60 * 1000;
export function healthEvidenceKey(station: Pick<Station, 'url' | 'url_resolved'>) { return (station.url_resolved || station.url || '').trim(); }
function freshEvidence(station: Station, now: number, evidence: HealthSnapshot) {
  const record = evidence.records[healthEvidenceKey(station)];
  if (!record) return undefined;
  const age = now - Date.parse(record.checkedAt);
  if (!Number.isFinite(age) || age < -300_000 || age >= HEALTH_EVIDENCE_TTL_MS) return undefined;
  return record;
}
export function stationSignalTier(station: Station, now = Date.now(), evidence: HealthSnapshot = snapshot as HealthSnapshot): StationSignalTier {
  if (station.sourceType === 'geoaudio') return 'live';
  const record = freshEvidence(station, now, evidence);
  const repeatedProbeFailure = record?.status === 'degraded' && record.consecutiveFailures >= 2;
  const repeatedCatalogFailure = station.last_check_ok === false && station.failure_count >= 2;
  if (!station.is_active || station.health_score < 30 || station.failure_count >= 4 || repeatedProbeFailure || repeatedCatalogFailure) return 'recovering';
  if (station.health_score < 55 || station.failure_count > 0 || station.last_check_ok === false || (record && record.status !== 'healthy')) return 'watch';
  return 'live';
}
export function stationDiscoveryEligible(station: Station, now = Date.now(), evidence: HealthSnapshot = snapshot as HealthSnapshot) {
  return stationSignalTier(station, now, evidence) !== 'recovering';
}
export function scheduledHealthBoost(station: Station, now = Date.now(), evidence: HealthSnapshot = snapshot as HealthSnapshot): number {
  if (station.sourceType === 'geoaudio') return 0;
  const record = freshEvidence(station, now, evidence);
  if (!record) return 0;
  // A single failed probe never penalizes or disables a station.
  if (record.status === 'unknown') return 0;
  const boost = record.status === 'healthy' ? 8 : record.consecutiveFailures >= 2 ? -Math.min(16, record.consecutiveFailures * 4) : 0;
  const age = now - Date.parse(record.checkedAt);
  return boost * Math.max(0, 1 - Math.max(0, age) / HEALTH_EVIDENCE_TTL_MS);
}
export function selectHealthBatch(stations: Station[], cursor: number, limit: number) {
  // Intentionally includes recovering stations. The health agent is what lets a
  // silent signal prove it is alive again and return to normal discovery.
  const queue = stations.filter((station) => station.sourceType !== 'geoaudio' && healthEvidenceKey(station));
  const unique = [...new Map(queue.map((station) => [healthEvidenceKey(station), station])).values()].sort((a, b) => healthEvidenceKey(a).localeCompare(healthEvidenceKey(b)));
  const start = unique.length ? Math.max(0, Math.floor(cursor)) % unique.length : 0;
  const size = Math.min(unique.length, Math.max(0, Math.floor(limit)));
  return { stations: Array.from({ length: size }, (_, i) => unique[(start + i) % unique.length]), cursor: unique.length ? (start + size) % unique.length : 0, catalogSize: unique.length };
}
