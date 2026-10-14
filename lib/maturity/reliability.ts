import type { Station } from '../stations';
import snapshot from '../stations/stationHealthSnapshot.json';
import { HEALTH_EVIDENCE_TTL_MS, type HealthSnapshot } from '../agents/station-health-policy';
export type Reliability = 'Excellent' | 'Stable' | 'Intermittent' | 'Recovering' | 'Unknown';
export function streamReliability(station: Station, playback = '', now = Date.now(), evidence = snapshot as HealthSnapshot): { label: Reliability; detail: string } {
  if (playback === 'failing_over') return { label: 'Recovering', detail: 'Trying a verified alternate stream for this station.' };
  if (/failed|unavailable/.test(playback)) return { label: 'Intermittent', detail: 'Playback could not be established. Stream availability can change.' };
  if (playback === 'playing') return { label: 'Stable', detail: 'Live playback is working in this browser.' };
  const record = evidence.records[station.url_resolved || station.url];
  const checked = record?.checkedAt || station.last_checked_at;
  const age = now - Date.parse(checked);
  if (!Number.isFinite(age) || age < 0 || age > HEALTH_EVIDENCE_TTL_MS) return { label: 'Unknown', detail: 'No recent stream verification is available.' };
  if (record) return { label: record.status === 'healthy' ? 'Excellent' : 'Intermittent', detail: `Stream checked ${record.checkedAt}. ${record.reason}` };
  if (station.last_check_ok !== true || station.validation_status === 'failed' || !station.is_active) return { label: 'Unknown', detail: 'The catalog has no confirmed recent playback evidence.' };
  return { label: station.health_score >= 90 ? 'Excellent' : station.health_score >= 65 ? 'Stable' : 'Intermittent', detail: `Last verified ${checked}. ${station.codec || 'Unknown format'}${station.bitrate ? ` · ${station.bitrate} kbps` : ''}.` };
}
