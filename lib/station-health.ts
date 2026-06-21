import type { Station } from '@/lib/stations';

export const STATION_HEALTH_STORAGE_KEYS = {
  health: 'waveatlas_station_health',
  failed: 'failed_stations',
  successful: 'successful_stations',
} as const;

export const STATION_HEALTH_TTL_MS = 24 * 60 * 60 * 1000;

export const CURATED_STATION_HEALTH_POLICY = {
  rememberHours: 24,
  successBoost: true,
  failurePenalty: true,
  autoRetest: true,
  preserveOnFailure: true,
} as const;

export const CURATED_STATION_RETEST_QUEUE_KEY = 'waveatlas_curated_station_retest_queue';

export type StationHealthRecord = {
  failures: number;
  successes: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  rememberUntil?: number;
  errorType?: string;
};

export type StationHealthMemory = Record<string, StationHealthRecord>;

type StoredStationEvent = { key: string; name: string; country?: string; at: number };

function storage() { return typeof window === 'undefined' ? undefined : window.localStorage; }

export function stationHealthKey(station: Pick<Station, 'station_uuid' | 'id' | 'name' | 'url'>) {
  return station.station_uuid || station.id || `${station.name}:${station.url}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try { storage()?.setItem(key, JSON.stringify(value)); } catch { /* best-effort client memory */ }
}

export function readStationHealthMemory(now = Date.now()): StationHealthMemory {
  const memory = readJson<StationHealthMemory>(STATION_HEALTH_STORAGE_KEYS.health, {});
  return Object.fromEntries(Object.entries(memory).filter(([, record]) => !record.rememberUntil || record.rememberUntil > now));
}

function rememberStationEvent(key: typeof STATION_HEALTH_STORAGE_KEYS.failed | typeof STATION_HEALTH_STORAGE_KEYS.successful, station: Station, now = Date.now()) {
  const previous = readJson<StoredStationEvent[]>(key, []).filter((event) => now - event.at < STATION_HEALTH_TTL_MS);
  const event = { key: stationHealthKey(station), name: station.name, country: station.country, at: now };
  writeJson(key, [event, ...previous.filter((item) => item.key !== event.key)].slice(0, 50));
}

export function markStationHealthy(station: Station, now = Date.now()) {
  const memory = readStationHealthMemory(now);
  const key = stationHealthKey(station);
  const previous = memory[key] ?? { failures: 0, successes: 0 };
  memory[key] = { ...previous, successes: previous.successes + 1, lastSuccessAt: now, rememberUntil: now + STATION_HEALTH_TTL_MS, errorType: undefined };
  writeJson(STATION_HEALTH_STORAGE_KEYS.health, memory);
  rememberStationEvent(STATION_HEALTH_STORAGE_KEYS.successful, station, now);
}

export function markStationUnhealthy(station: Station, errorType = 'playback_error', now = Date.now()) {
  const memory = readStationHealthMemory(now);
  const key = stationHealthKey(station);
  const previous = memory[key] ?? { failures: 0, successes: 0 };
  memory[key] = { ...previous, failures: previous.failures + 1, lastFailureAt: now, rememberUntil: now + STATION_HEALTH_TTL_MS, errorType };
  writeJson(STATION_HEALTH_STORAGE_KEYS.health, memory);
  rememberStationEvent(STATION_HEALTH_STORAGE_KEYS.failed, station, now);
  if (station.curation_tier === 'curated_atlas') queueCuratedStationRetest(station, now);
}

export function queueCuratedStationRetest(station: Station, now = Date.now()) {
  const previous = readJson<StoredStationEvent[]>(CURATED_STATION_RETEST_QUEUE_KEY, []).filter((event) => now - event.at < STATION_HEALTH_TTL_MS);
  const event = { key: stationHealthKey(station), name: station.name, country: station.country, at: now };
  writeJson(CURATED_STATION_RETEST_QUEUE_KEY, [event, ...previous.filter((item) => item.key !== event.key)].slice(0, 50));
}

export function healthMemoryBoost(station: Station, now = Date.now()) {
  const record = readStationHealthMemory(now)[stationHealthKey(station)];
  if (!record) return 0;
  const recentSuccess = record.lastSuccessAt && now - record.lastSuccessAt < STATION_HEALTH_TTL_MS;
  const recentFailure = record.lastFailureAt && now - record.lastFailureAt < STATION_HEALTH_TTL_MS;
  return (recentSuccess ? Math.min(30, 12 + record.successes * 4) : 0) - (recentFailure ? Math.min(85, 35 + record.failures * 15) : 0);
}
