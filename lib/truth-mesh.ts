import { resolveStationGeo } from './geotruth-resolver';
import type { Station } from './stations';
import type { NormalizedStationEvidence } from './source-connectors';

export type ConfidenceLabel = 'verified' | 'high' | 'medium' | 'low' | 'conflict';
export type StationTruthScoreRow = { station_uuid: string; identity_score: number; geo_score: number; metadata_score: number; stream_health_score: number; consensus_score: number; confidence_label: ConfidenceLabel; updated_at: string };
export type TruthMeshResult = { stationUuid: string; canonical: Partial<Station>; scores: StationTruthScoreRow; conflicts: Array<{ field: string; values: string[] }>; auditLog: string[] };

const SOURCE_WEIGHTS: Record<string, number> = { curated: 1, radio_browser: 0.78, future_provider: 0.5 };
const norm = (value?: string) => value?.trim().toLowerCase();
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function vote(evidence: NormalizedStationEvidence[], getter: (item: NormalizedStationEvidence) => string | undefined) {
  const votes = new Map<string, { value: string; score: number }>();
  for (const item of evidence) {
    const value = getter(item);
    if (!value?.trim()) continue;
    const key = norm(value)!;
    const score = (SOURCE_WEIGHTS[item.sourceName] ?? 0.5) * item.evidenceConfidence;
    votes.set(key, { value: value.trim(), score: (votes.get(key)?.score ?? 0) + score });
  }
  return [...votes.values()].sort((a, b) => b.score - a.score)[0];
}

function agreement(evidence: NormalizedStationEvidence[], getter: (item: NormalizedStationEvidence) => string | undefined) {
  const winner = vote(evidence, getter);
  if (!winner) return 0;
  const total = evidence.reduce((sum, item) => sum + (SOURCE_WEIGHTS[item.sourceName] ?? 0.5) * item.evidenceConfidence, 0);
  return total ? winner.score / total : 0;
}

function conflicts(evidence: NormalizedStationEvidence[], field: string, getter: (item: NormalizedStationEvidence) => string | undefined) {
  const values = Array.from(new Set(evidence.map(getter).filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())));
  return values.map(norm).filter((value, index, all) => value && all.indexOf(value) === index).length > 1 ? [{ field, values }] : [];
}

function label(score: number, conflictCount: number): ConfidenceLabel {
  if (conflictCount && score < 75) return 'conflict';
  if (score >= 90) return 'verified';
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

export function resolveStationTruthMesh(evidence: NormalizedStationEvidence[]): TruthMeshResult {
  if (!evidence.length) throw new Error('Truth Mesh requires station source evidence.');
  const stationUuid = evidence.find((item) => item.sourceName === 'curated')?.stationUuid ?? evidence[0].stationUuid;
  const canonical: Partial<Station> = {
    station_uuid: stationUuid,
    name: vote(evidence, (item) => item.rawName)?.value,
    country: vote(evidence, (item) => item.rawCountry)?.value,
    country_code: vote(evidence, (item) => item.rawCountryCode)?.value?.toUpperCase(),
    city: vote(evidence, (item) => item.rawCity)?.value,
    language: vote(evidence, (item) => item.rawLanguage)?.value,
    url: vote(evidence, (item) => item.rawStreamUrl)?.value,
    homepage: vote(evidence, (item) => item.rawHomepage)?.value,
    tags: Array.from(new Set(evidence.flatMap((item) => item.rawGenres ?? []))).slice(0, 12),
  };
  const geoProbe = { id: stationUuid, station_uuid: stationUuid, name: canonical.name ?? 'Unknown station', url: canonical.url ?? '', country: canonical.country ?? 'Global', country_code: canonical.country_code ?? 'UN', city: canonical.city, state: canonical.city, language: canonical.language ?? 'Unknown', tags: canonical.tags ?? [], codec: 'Unknown', bitrate: 0, latitude: vote(evidence, (item) => item.rawLat?.toString())?.value ? Number(vote(evidence, (item) => item.rawLat?.toString())?.value) : undefined, longitude: vote(evidence, (item) => item.rawLng?.toString())?.value ? Number(vote(evidence, (item) => item.rawLng?.toString())?.value) : undefined, votes: 0, click_count: 0, health_score: 0, is_active: true, last_checked_at: new Date().toISOString(), failure_count: 0, response_time_ms: 0 } satisfies Station;
  const geo = resolveStationGeo(geoProbe);
  canonical.latitude = geo.lat ?? undefined;
  canonical.longitude = geo.lng ?? undefined;
  const identity = (agreement(evidence, (item) => item.rawName) + agreement(evidence, (item) => item.rawStreamUrl)) / 2;
  const geoScore = Math.max(agreement(evidence, (item) => item.rawCountryCode), agreement(evidence, (item) => item.rawCountry)) * (geo.confidence / 100 || 0.6);
  const metadata = [agreement(evidence, (item) => item.rawLanguage), agreement(evidence, (item) => item.rawHomepage), agreement(evidence, (item) => item.rawCity)].reduce((a, b) => a + b, 0) / 3;
  const streamHealth = vote(evidence, (item) => item.rawStreamUrl) ? 0.85 : 0.2;
  const conflictList = [...conflicts(evidence, 'name', (i) => i.rawName), ...conflicts(evidence, 'country_code', (i) => i.rawCountryCode), ...conflicts(evidence, 'city', (i) => i.rawCity), ...conflicts(evidence, 'stream_url', (i) => i.rawStreamUrl)];
  const consensus = clamp((identity * 0.3 + geoScore * 0.25 + metadata * 0.2 + streamHealth * 0.25) * 100 - Math.min(15, conflictList.length * 3));
  const updated_at = new Date().toISOString();
  return { stationUuid, canonical, scores: { station_uuid: stationUuid, identity_score: clamp(identity * 100), geo_score: clamp(geoScore * 100), metadata_score: clamp(metadata * 100), stream_health_score: clamp(streamHealth * 100), consensus_score: consensus, confidence_label: label(consensus, conflictList.length), updated_at }, conflicts: conflictList, auditLog: [`Resolved ${stationUuid} from ${evidence.length} evidence record(s).`, geo.warning ? `GeoTruth warning: ${geo.warning}` : `GeoTruth accepted ${geo.source} at ${geo.confidence}.`, conflictList.length ? `Flagged ${conflictList.length} conflict(s) for review.` : 'No source conflicts detected.'] };
}

export function calculateCoverageGaps(evidence: NormalizedStationEvidence[]) {
  const byCountry = new Map<string, { country: string; stations: Set<string>; verified: Set<string> }>();
  for (const item of evidence) {
    const code = item.rawCountryCode?.toUpperCase() || 'UN';
    const row = byCountry.get(code) ?? { country: item.rawCountry || 'Unknown', stations: new Set<string>(), verified: new Set<string>() };
    row.stations.add(item.stationUuid);
    if (item.evidenceConfidence >= 0.9 || item.sourceName === 'curated') row.verified.add(item.stationUuid);
    byCountry.set(code, row);
  }
  return [...byCountry.entries()].map(([country_code, row]) => ({ country_code, country: row.country, continent: 'unknown', active_station_count: row.stations.size, verified_station_count: row.verified.size, coverage_score: clamp((Math.min(row.stations.size, 50) / 50) * 70 + (row.verified.size / Math.max(1, row.stations.size)) * 30), last_checked_at: new Date().toISOString() }));
}
