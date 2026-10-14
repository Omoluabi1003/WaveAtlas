import 'server-only';
import { fetchStationByUuid } from '../stations';
import snapshot from '../stations/stationHealthSnapshot.json';
import { database, databaseConfigured } from './server-data';
import { endpointToken } from './security';
import { rankStreamCandidates, type StreamCandidate } from './stream-failover';
export async function trustedStationStreams(id: string) {
  const station = await fetchStationByUuid(id); if (!station) return null;
  const canonicalId = station.station_uuid || station.id;
  const candidates: StreamCandidate[] = [];
  const sources: { url?: string; source: string; source_tier?: number; source_weight?: number }[] = [{ url: station.url_resolved || station.url, source: station.curation_source || 'canonical', source_tier: 2, source_weight: 1 }, { url: station.url, source: 'canonical', source_tier: 2, source_weight: 1 }];
  let checks: { stream_url: string; status: string; checked_at: string }[] = [];
  if (databaseConfigured()) {
    const results = await Promise.allSettled([database<typeof sources>('station_sources', { select: 'url,source,source_tier,source_weight', station_uuid: `eq.${canonicalId}` }), database<typeof checks>('station_health', { select: 'stream_url,status,checked_at', station_uuid: `eq.${canonicalId}`, order: 'checked_at.desc', limit: '100' })]);
    if (results[0].status === 'fulfilled') sources.push(...results[0].value);
    if (results[1].status === 'fulfilled') checks = results[1].value;
  }
  for (const source of sources) {
    if (!source.url) continue;
    const health = checks.find(row => row.stream_url === source.url);
    const local = (snapshot.records as Record<string, { status: string; checkedAt: string }>)[source.url];
    const primary = source.url === (station.url_resolved || station.url);
    const verifiedAt = health?.status === 'ok' ? health.checked_at : local?.status === 'healthy' ? local.checkedAt : primary && station.last_check_ok === true ? station.last_checked_at : '';
    if (health && health.status !== 'ok') continue;
    candidates.push({ url: source.url, source: source.source, authority: source.source_tier === 2 ? 1 : 0.8, confidence: source.source_weight || 0.8, health: health || local ? 90 : station.health_score, verifiedAt });
  }
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { stationId: canonicalId, candidates: rankStreamCandidates(candidates).map(candidate => ({ ...candidate, token: secret ? endpointToken(canonicalId, candidate.url, secret) : undefined })) };
}
