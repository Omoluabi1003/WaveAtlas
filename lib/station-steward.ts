import { fetchStations, type Station, validateStream } from './stations';

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
};

type SupabaseConfig = { url: string; serviceRoleKey: string };
type ExistingStation = { id: string; station_uuid: string | null; url: string | null; name: string | null; country_code: string | null; failure_count: number | null; success_count: number | null; is_retired: boolean | null };

const RADIO_BROWSER_SCAN_PLAN = [
  { order: 'votes', limit: '35' },
  { order: 'clickcount', limit: '35' },
  { countryCode: 'US', limit: '20' },
  { countryCode: 'GB', limit: '20' },
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
  return [station.station_uuid, station.url, `${station.name.toLowerCase()}::${station.country_code}`].filter(Boolean).join('|');
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

function normalizeForDatabase(station: Station, validation?: Awaited<ReturnType<typeof validateStream>>): Omit<StewardStationRecord, 'id'> & { station_uuid: string } {
  const ok = validation?.is_active ?? station.is_active;
  const now = new Date().toISOString();
  const failure_count = ok ? 0 : Math.max(1, station.failure_count + (validation ? 1 : 0));
  return {
    ...station,
    station_uuid: station.station_uuid || station.id,
    url_resolved: station.url,
    city: station.state,
    genres: station.tags,
    tags: station.tags,
    source: 'radio_browser',
    health_score: calculateHealthScore(station, validation),
    last_check_ok: ok,
    last_checked_at: validation?.last_checked_at ?? station.last_checked_at,
    response_time_ms: validation?.response_time_ms ?? station.response_time_ms,
    failure_count,
    success_count: ok ? 1 : 0,
    is_active: ok && failure_count < RETIRE_AFTER_FAILURES,
    is_retired: failure_count >= RETIRE_AFTER_FAILURES,
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
    await supabaseRequest(config, 'station_checks', { method: 'POST', body: JSON.stringify({ station_id: saved.id, status: normalized.last_check_ok ? 'ok' : 'failed', response_time_ms: normalized.response_time_ms, error_message: normalized.last_check_ok ? null : 'Stream validation failed', checked_at: normalized.last_checked_at }) });
  }
  return existing ? 'updated' : 'discovered';
}

export async function discoverCandidateStations() {
  const seen = new Set<string>();
  const candidates: Station[] = [];
  for (const params of RADIO_BROWSER_SCAN_PLAN) {
    const stations = await fetchStations(params);
    for (const station of stations) {
      const key = uniqueKey(station);
      if (!seen.has(key) && station.url && /^https?:\/\//i.test(station.url)) {
        seen.add(key);
        candidates.push(station);
      }
    }
  }
  return candidates.sort((a, b) => b.health_score - a.health_score || b.votes - a.votes);
}

export async function runStationStewardAgent(options: { dryRun?: boolean; validateLimit?: number } = {}): Promise<StewardRunSummary> {
  const started_at = new Date().toISOString();
  const errors: string[] = [];
  const config = supabaseConfig();
  const dryRun = options.dryRun ?? !config;
  let stations_discovered = 0;
  let stations_updated = 0;
  let stations_retired = 0;

  try {
    const candidates = await discoverCandidateStations();
    const validateLimit = Math.min(options.validateLimit ?? VALIDATION_SAMPLE_SIZE, STREAM_VALIDATE_TIMEOUT_SAFE_LIMIT, candidates.length);
    for (const [index, station] of candidates.entries()) {
      const validation = index < validateLimit ? await validateStream(station.url) : undefined;
      const normalized = normalizeForDatabase(station, validation);
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
  const summary = { status, started_at, finished_at, stations_discovered, stations_updated, stations_retired, errors, dry_run: dryRun };

  if (config && !dryRun) {
    await supabaseRequest(config, 'agent_runs', { method: 'POST', body: JSON.stringify(summary) }).catch((error) => errors.push(error instanceof Error ? error.message : 'Failed to log agent run'));
  }

  return summary;
}
