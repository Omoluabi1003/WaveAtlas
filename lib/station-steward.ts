import { resolveStationGeo } from './geotruth-resolver';
import { buildRadioBrowserClaim, reconcileStationTruth } from './source-oracle';
import { fetchStations, fetchStationsByCountry, isCuratedStation, type Station, validateStream } from './stations';

export type StewardStationRecord = Station & {
  url_resolved?: string;
  city?: string;
  genres: string[];
  source: string;
  success_count: number;
  is_retired: boolean;
  last_check_ok: boolean;
  updated_at: string;
  created_at?: string;
};

export type StewardRunSummary = {
  status: 'completed' | 'dry_run' | 'failed';
  started_at: string;
  finished_at: string;
  stations_discovered: number;
  stations_updated: number;
  stations_retired: number;
  errors: string[];
  dry_run: boolean;
  coverage_stats: Record<string, { countries_teleported: number; stations_found: number }>;
  countries_with_no_results: string[];
  geo_conflicts_flagged: number;
};

type SupabaseConfig = { url: string; serviceRoleKey: string };
type ExistingStation = { id: string; station_uuid: string | null; url: string | null; name: string | null; country_code: string | null; failure_count: number | null; success_count: number | null; is_retired: boolean | null };


const CONTINENT_SEED_TARGETS: Record<string, string[]> = {
  Asia: ['JP', 'CN', 'IN', 'KR', 'ID', 'PH', 'TH', 'MY', 'SG', 'AE', 'SA', 'QA', 'IL', 'TR'],
  Australia_Oceania: ['AU', 'NZ', 'FJ', 'PG'],
  Africa: ['NG', 'GH', 'ZA', 'KE', 'EG', 'MA', 'TZ', 'UG', 'CM', 'SN'],
  Europe: ['GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'SE', 'NO', 'IE', 'CH', 'BE', 'PT'],
  North_America: ['US', 'CA', 'MX'],
  South_America: ['BR', 'AR', 'CL', 'CO', 'PE'],
};

const RADIO_BROWSER_SCAN_PLAN = [
  { order: 'votes', limit: '35' },
  { order: 'clickcount', limit: '35' },
  { countryCode: 'US', limit: '20' },
  { countryCode: 'GB', limit: '20' },
  { countryCode: 'JP', limit: '20' },
  { countryCode: 'AU', limit: '20' },
  { countryCode: 'NG', limit: '20' },
  { countryCode: 'FR', limit: '20' },
  { countryCode: 'BR', limit: '20' },
  { tag: 'news', limit: '20' },
  { tag: 'jazz', limit: '20' },
  { tag: 'afrobeats', limit: '20' },
];

const RETIRE_AFTER_FAILURES = Number(process.env.STATION_STEWARD_RETIRE_AFTER_FAILURES ?? 5);
const VALIDATION_SAMPLE_SIZE = Number(process.env.STATION_STEWARD_VALIDATE_LIMIT ?? 30);
const STREAM_VALIDATE_TIMEOUT_SAFE_LIMIT = 30;

function supabaseConfig(): SupabaseConfig | undefined {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { url: url.replace(/\/$/, ''), serviceRoleKey } : undefined;
}

function headers(config: SupabaseConfig) {
  return { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' };
}

function uniqueKey(station: Station) {
  return station.station_uuid || [station.url, `${station.name.toLowerCase()}::${station.country_code}`].filter(Boolean).join('|');
}

function normalizedName(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function aliasesFor(station: Station) {
  return Array.from(new Set([station.name, station.normalized_name, normalizedName(station.name)].filter(Boolean) as string[]));
}

function metadataQuality(station: Station) {
  return [station.country_code, station.language, station.codec, station.bitrate, station.latitude, station.longitude, station.favicon, station.homepage, station.tags.length].filter(Boolean).length;
}

function calculateHealthScore(station: Station, validation?: Awaited<ReturnType<typeof validateStream>>) {
  const base = validation ? validation.health_score : station.health_score;
  const failures = validation?.failure_count ?? station.failure_count;
  const successBoost = validation?.is_active || station.is_active ? 14 : 0;
  const bitrateBoost = Math.min(12, Math.max(0, station.bitrate) / 16);
  const codecBoost = station.codec && station.codec !== 'Unknown' ? 6 : 0;
  const metadataBoost = metadataQuality(station) * 2;
  return Math.max(0, Math.min(100, Math.round(base + successBoost + bitrateBoost + codecBoost + metadataBoost - failures * 12)));
}

function normalizeForDatabase(station: Station, validation?: Awaited<ReturnType<typeof validateStream>>): Omit<StewardStationRecord, 'id'> & { station_uuid: string; geo_confidence_score: number; consensus_score: number; confidence_score: number; source_count: number } {
  const geo = resolveStationGeo(station);
  const truth = reconcileStationTruth([buildRadioBrowserClaim(station)]);
  const ok = validation?.is_active ?? station.is_active;
  const now = new Date().toISOString();
  const failure_count = ok ? 0 : Math.max(1, station.failure_count + (validation ? 1 : 0));
  return {
    ...station,
    latitude: geo.lat ?? undefined,
    longitude: geo.lng ?? undefined,
    station_uuid: station.station_uuid || station.id,
    normalized_name: station.normalized_name || normalizedName(station.name),
    url_resolved: station.url_resolved || station.url,
    city: station.state,
    genres: station.tags,
    tags: station.tags,
    source: geo.source === 'verified_api_geo' ? 'radio_browser' : geo.source,
    health_score: Math.round((calculateHealthScore(station, validation) * 0.7) + (truth.scores.confidenceScore * 0.3)),
    last_check_ok: ok,
    last_checked_at: validation?.last_checked_at ?? station.last_checked_at,
    response_time_ms: validation?.response_time_ms ?? station.response_time_ms,
    failure_count,
    success_count: ok ? 1 : 0,
    is_active: ok && failure_count < RETIRE_AFTER_FAILURES,
    is_retired: failure_count >= RETIRE_AFTER_FAILURES,
    geo_confidence_score: geo.confidence,
    consensus_score: truth.scores.consensusScore,
    confidence_score: truth.scores.confidenceScore,
    source_count: truth.canonical.source_count,
    updated_at: now,
  };
}

async function supabaseRequest<T>(config: SupabaseConfig, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${config.url}/rest/v1/${path}`, { ...init, headers: { ...headers(config), ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function getExisting(config: SupabaseConfig, station: Station) {
  const uuid = encodeURIComponent(station.station_uuid || station.id);
  const rows = await supabaseRequest<ExistingStation[]>(config, `stations?select=id,station_uuid,url,name,country_code,failure_count,success_count,is_retired&station_uuid=eq.${uuid}&limit=1`);
  return rows[0];
}

async function upsertStation(config: SupabaseConfig, station: Station, validation?: Awaited<ReturnType<typeof validateStream>>) {
  const existing = await getExisting(config, station);
  const truth = reconcileStationTruth([buildRadioBrowserClaim(station)]);
  const normalized = normalizeForDatabase(station, validation);
  if (existing) {
    normalized.success_count = (existing.success_count ?? 0) + (normalized.last_check_ok ? 1 : 0);
    normalized.failure_count = normalized.last_check_ok ? 0 : (existing.failure_count ?? 0) + 1;
    normalized.is_retired = normalized.failure_count >= RETIRE_AFTER_FAILURES;
    normalized.is_active = normalized.last_check_ok && !normalized.is_retired;
  }
  const result = await supabaseRequest<StewardStationRecord[]>(config, 'stations?on_conflict=station_uuid', { method: 'POST', body: JSON.stringify(normalized) });
  const saved = result[0];
  if (saved?.id) {
    const geo = resolveStationGeo(station);
    await supabaseRequest(config, 'station_sources?on_conflict=station_uuid,source', { method: 'POST', body: JSON.stringify({ station_uuid: normalized.station_uuid, source: 'radio_browser', source_tier: 1, source_weight: 0.8, external_id: station.station_uuid, url: station.url, raw_payload: buildRadioBrowserClaim(station), fetched_at: normalized.updated_at }) }).catch(() => undefined);
    await supabaseRequest(config, 'source_scores?on_conflict=station_uuid,source', { method: 'POST', body: JSON.stringify({ station_uuid: normalized.station_uuid, source: 'radio_browser', identity_score: truth.scores.identityScore, geo_score: truth.scores.geoScore, metadata_score: truth.scores.metadataScore, stream_health_score: truth.scores.streamHealthScore, consensus_score: truth.scores.consensusScore, confidence_score: truth.scores.confidenceScore, scored_at: normalized.updated_at }) }).catch(() => undefined);
    await Promise.all(truth.conflicts.map((conflict) => supabaseRequest(config, 'station_conflicts', { method: 'POST', body: JSON.stringify({ station_uuid: normalized.station_uuid, field: conflict.field, winning_value: conflict.winningValue, rejected_values: conflict.rejectedValues, confidence_score: truth.scores.confidenceScore, detected_at: normalized.updated_at }) }).catch(() => undefined)));
    await supabaseRequest(config, 'truth_audit', { method: 'POST', body: JSON.stringify({ station_uuid: normalized.station_uuid, source_count: truth.canonical.source_count, identity_score: truth.scores.identityScore, geo_score: truth.scores.geoScore, metadata_score: truth.scores.metadataScore, stream_health_score: truth.scores.streamHealthScore, consensus_score: truth.scores.consensusScore, confidence_score: truth.scores.confidenceScore, audited_at: normalized.updated_at }) }).catch(() => undefined);
    await supabaseRequest(config, 'station_health', { method: 'POST', body: JSON.stringify({ station_uuid: normalized.station_uuid, stream_url: normalized.url_resolved || normalized.url, status: normalized.last_check_ok ? 'ok' : 'failed', response_time_ms: normalized.response_time_ms, content_type: validation?.content_type, checked_at: normalized.last_checked_at }) }).catch(() => undefined);
    await supabaseRequest(config, 'station_checks', { method: 'POST', body: JSON.stringify({ station_id: saved.id, status: normalized.last_check_ok ? 'ok' : 'failed', response_time_ms: normalized.response_time_ms, error_message: normalized.last_check_ok ? null : 'Stream validation failed', checked_at: normalized.last_checked_at }) });
    await supabaseRequest(config, 'station_geo_overrides?on_conflict=station_uuid', { method: 'POST', body: JSON.stringify({ station_uuid: normalized.station_uuid, lat: normalized.latitude ?? null, lng: normalized.longitude ?? null, precision: geo.precision, source: geo.source, confidence: geo.confidence, notes: geo.warning, updated_at: normalized.updated_at }) }).catch(() => undefined);
    await supabaseRequest(config, 'station_geo_audit', { method: 'POST', body: JSON.stringify({ station_uuid: normalized.station_uuid, reported_country_code: station.country_code, reported_lat: station.latitude ?? null, reported_lng: station.longitude ?? null, resolved_lat: geo.lat, resolved_lng: geo.lng, resolution_source: geo.source, confidence: geo.confidence, warning: geo.warning, audited_at: normalized.updated_at }) }).catch(() => undefined);
    await Promise.all(aliasesFor(station).map((alias) => supabaseRequest(config, 'station_aliases?on_conflict=station_id,alias', { method: 'POST', body: JSON.stringify({ station_id: saved.id, alias, source: 'station_steward', confidence: alias === station.name ? 1 : 0.9 }) }).catch(() => undefined)));
    if (existing && (existing.name !== normalized.name || existing.url !== normalized.url)) {
      await supabaseRequest(config, 'station_identity_audit', { method: 'POST', body: JSON.stringify({ station_uuid: normalized.station_uuid, old_name: existing.name, new_name: normalized.name, old_url: existing.url, new_url: normalized.url, change_reason: 'Station Steward metadata refresh without changing canonical UUID', checked_at: normalized.updated_at }) });
    }
  }
  return existing ? 'updated' : 'discovered';
}

export async function discoverCandidateStations() {
  const seen = new Set<string>();
  const candidates: Station[] = [];
  const coverage_stats: StewardRunSummary['coverage_stats'] = {};
  const countries_with_no_results: string[] = [];
  const addStations = (stations: Station[]) => {
    for (const station of stations) {
      const key = uniqueKey(station);
      if (!seen.has(key) && station.url && /^https?:\/\//i.test(station.url)) {
        seen.add(key);
        candidates.push(station);
      }
    }
  };
  for (const params of RADIO_BROWSER_SCAN_PLAN) {
    addStations(await fetchStations(params));
  }
  for (const [continent, countryCodes] of Object.entries(CONTINENT_SEED_TARGETS)) {
    coverage_stats[continent] = { countries_teleported: 0, stations_found: 0 };
    for (const countryCode of countryCodes) {
      coverage_stats[continent].countries_teleported += 1;
      const stations = await fetchStationsByCountry({ countryCode, limit: '50', offset: '0' });
      coverage_stats[continent].stations_found += stations.length;
      if (!stations.length) countries_with_no_results.push(countryCode);
      addStations(stations);
    }
  }
  return {
    candidates: candidates.sort((a, b) => b.health_score - a.health_score || b.votes - a.votes),
    coverage_stats,
    countries_with_no_results,
  };
}

export async function runStationStewardAgent(options: { dryRun?: boolean; validateLimit?: number } = {}): Promise<StewardRunSummary> {
  const started_at = new Date().toISOString();
  const errors: string[] = [];
  const config = supabaseConfig();
  const dryRun = options.dryRun ?? !config;
  let stations_discovered = 0;
  let stations_updated = 0;
  let stations_retired = 0;
  let coverage_stats: StewardRunSummary['coverage_stats'] = {};
  let countries_with_no_results: string[] = [];
  let geo_conflicts_flagged = 0;

  try {
    const discovery = await discoverCandidateStations();
    const candidates = discovery.candidates;
    coverage_stats = discovery.coverage_stats;
    countries_with_no_results = discovery.countries_with_no_results;
    const validateLimit = Math.min(options.validateLimit ?? VALIDATION_SAMPLE_SIZE, STREAM_VALIDATE_TIMEOUT_SAFE_LIMIT, candidates.length);
    for (const [index, station] of candidates.entries()) {
      const validation = index < validateLimit ? await validateStream(station.url, { curated: isCuratedStation(station) }) : undefined;
      const normalized = normalizeForDatabase(station, validation);
      if (resolveStationGeo(station).warning) geo_conflicts_flagged += 1;
      if (normalized.is_retired) stations_retired += 1;
      if (dryRun || !config) {
        stations_discovered += 1;
        continue;
      }
      const outcome = await upsertStation(config, station, validation);
      if (outcome === 'discovered') stations_discovered += 1;
      else stations_updated += 1;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown Station Steward Agent error');
  }

  const finished_at = new Date().toISOString();
  const status: StewardRunSummary['status'] = errors.length ? 'failed' : dryRun ? 'dry_run' : 'completed';
  const summary = { status, started_at, finished_at, stations_discovered, stations_updated, stations_retired, errors, dry_run: dryRun, coverage_stats, countries_with_no_results, geo_conflicts_flagged };

  if (config && !dryRun) {
    await supabaseRequest(config, 'agent_runs', { method: 'POST', body: JSON.stringify(summary) }).catch((error) => errors.push(error instanceof Error ? error.message : 'Failed to log agent run'));
  }

  return summary;
}
