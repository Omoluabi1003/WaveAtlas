import { CuratedStationConnector, RadioBrowserConnector, FutureProviderConnector, type NormalizedStationEvidence, type StationSourceConnector } from '../lib/source-connectors';
import { calculateCoverageGaps, resolveStationTruthMesh } from '../lib/truth-mesh';

export type SourceOracleRunSummary = { schedule: 'every_6_hours'; dryRun: boolean; evidence_collected: number; truth_scores_calculated: number; coverage_gaps_updated: number; conflicts_flagged: number; audit_logs: string[]; errors: string[] };

type SupabaseConfig = { url: string; serviceRoleKey: string };
const ACTIVE_CONNECTORS: StationSourceConnector[] = [new RadioBrowserConnector(), new CuratedStationConnector()];
export const SOURCE_ORACLE_CONNECTORS = [...ACTIVE_CONNECTORS, new FutureProviderConnector()];

function supabaseConfig(): SupabaseConfig | undefined {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { url: url.replace(/\/$/, ''), serviceRoleKey } : undefined;
}

function headers(config: SupabaseConfig) { return { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }; }
async function supabaseRequest(config: SupabaseConfig, path: string, body: unknown) { const res = await fetch(`${config.url}/rest/v1/${path}`, { method: 'POST', headers: headers(config), body: JSON.stringify(body) }); if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`); }

async function collectEvidence(countries: string[], genres: string[]) {
  const evidence: NormalizedStationEvidence[] = [];
  for (const connector of ACTIVE_CONNECTORS) {
    for (const countryCode of countries) evidence.push(...(await connector.getStationsByCountry(countryCode)).map((station) => connector.normalize(station)));
    for (const genre of genres) evidence.push(...(await connector.getStationsByGenre(genre)).map((station) => connector.normalize(station)));
  }
  const unique = new Map<string, NormalizedStationEvidence>();
  for (const item of evidence) unique.set(`${item.stationUuid}:${item.sourceName}:${item.sourceStationId}`, item);
  return [...unique.values()];
}

export async function runSourceOracleAgent(options: { dryRun?: boolean; countries?: string[]; genres?: string[] } = {}): Promise<SourceOracleRunSummary> {
  const config = supabaseConfig();
  const dryRun = options.dryRun ?? !config;
  const audit_logs: string[] = [];
  const errors: string[] = [];
  let conflicts_flagged = 0;
  let truth_scores_calculated = 0;
  let coverage_gaps_updated = 0;
  const evidence = await collectEvidence(options.countries ?? ['US', 'GB', 'NG', 'JP', 'FR'], options.genres ?? ['news']);
  const byUuid = new Map<string, NormalizedStationEvidence[]>();
  for (const item of evidence) byUuid.set(item.stationUuid, [...(byUuid.get(item.stationUuid) ?? []), item]);
  for (const item of evidence) {
    if (dryRun || !config) continue;
    await supabaseRequest(config, 'station_source_evidence?on_conflict=station_uuid,source_name,source_station_id', { station_uuid: item.stationUuid, source_name: item.sourceName, source_station_id: item.sourceStationId, source_url: item.sourceUrl, raw_name: item.rawName, raw_country: item.rawCountry, raw_country_code: item.rawCountryCode, raw_city: item.rawCity, raw_language: item.rawLanguage, raw_genres: item.rawGenres ?? [], raw_stream_url: item.rawStreamUrl, raw_homepage: item.rawHomepage, raw_lat: item.rawLat, raw_lng: item.rawLng, evidence_confidence: item.evidenceConfidence, collected_at: item.collectedAt });
  }
  for (const group of byUuid.values()) {
    const result = resolveStationTruthMesh(group);
    truth_scores_calculated += 1;
    conflicts_flagged += result.conflicts.length;
    audit_logs.push(...result.auditLog);
    if (dryRun || !config) continue;
    await supabaseRequest(config, 'station_truth_scores?on_conflict=station_uuid', result.scores);
  }
  const gaps = calculateCoverageGaps(evidence);
  coverage_gaps_updated = gaps.length;
  if (!dryRun && config) for (const gap of gaps) await supabaseRequest(config, 'coverage_gaps?on_conflict=country_code', gap).catch((error) => errors.push(error instanceof Error ? error.message : 'coverage gap write failed'));
  return { schedule: 'every_6_hours', dryRun, evidence_collected: evidence.length, truth_scores_calculated, coverage_gaps_updated, conflicts_flagged, audit_logs, errors };
}
