import type { Station } from './stations';
import type { StationHealthRecord } from './station-health';
import snapshot from './stations/stationHealthSnapshot.json';
import { HEALTH_EVIDENCE_TTL_MS, type HealthSnapshot } from './agents/station-health-policy';
export type Reliability = 'Excellent' | 'Stable' | 'Intermittent' | 'Recovering' | 'Unknown';
export function normalizeReliability(station: Station, options: { now?: number; memory?: StationHealthRecord; playback?: string; failingOver?: boolean; evidence?: HealthSnapshot } = {}): Reliability {
  const now = options.now ?? Date.now();
  if (options.failingOver) return 'Recovering';
  if (options.playback === 'failed' || options.playback === 'unavailable') return 'Intermittent';
  const memory = options.memory;
  if (memory?.lastSuccessAt && now - memory.lastSuccessAt >= 0 && now - memory.lastSuccessAt < 86400000 && memory.lastSuccessAt > (memory.lastFailureAt ?? 0)) return memory.lastFailureAt ? 'Recovering' : 'Stable';
  if (memory?.lastFailureAt && now - memory.lastFailureAt >= 0 && now - memory.lastFailureAt < 86400000) return 'Intermittent';
  const evidence = (options.evidence ?? snapshot as HealthSnapshot).records[station.url_resolved || station.url];
  if (evidence && now - Date.parse(evidence.checkedAt) >= 0 && now - Date.parse(evidence.checkedAt) < HEALTH_EVIDENCE_TTL_MS) return evidence.status === 'healthy' ? 'Excellent' : evidence.status === 'unknown' ? 'Unknown' : 'Intermittent';
  const age = now - Date.parse(station.last_checked_at);
  // A synthetic score or an active flag is not evidence of successful playback.
  if (station.last_check_ok === undefined || !Number.isFinite(age) || age < 0 || age >= HEALTH_EVIDENCE_TTL_MS) return 'Unknown';
  if (!station.last_check_ok || !station.is_active) return 'Intermittent';
  return station.health_score >= 85 && station.failure_count === 0 ? 'Excellent' : 'Stable';
}
