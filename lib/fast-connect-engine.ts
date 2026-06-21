import type { Station } from "@/lib/stations";
import { isCuratedStation, isStationAvailable } from "@/lib/stations";
import { stationCity } from "@/lib/discovery/history";
import { stationContinent } from "@/lib/discovery/station-picker";

export const FAST_CONNECT_STARTUP_TIMEOUT_MS = 4000;
export const FAST_CONNECT_BUFFER_TIMEOUT_MS = 6000;
export const FAST_CONNECT_MAX_ATTEMPTS_BEFORE_GLOBAL_FALLBACK = 3;
export const FAST_CONNECT_COPY = {
  connecting: "Connecting to live signal…",
  retrying: "Finding a stronger signal…",
  fallback: "Tuning into a nearby live station…",
  failed: "This signal is weak. We are checking it in the background.",
} as const;

const HEALTH_KEY = "waveatlas_station_health";
const FAILED_KEY = "last_failed_stations";
const SUCCESS_KEY = "last_successful_stations";
const REVIEW_KEY = "waveatlas_signal_review_queue";
const DAY_MS = 24 * 60 * 60 * 1000;
const DIRECT_STREAM_PATTERN = /(?:mp3|aac|mpeg|audio)/i;

type HealthRecord = { failures: number; successes: number; degradedUntil?: number; lastFailureAt?: number; lastSuccessAt?: number; errorType?: string };
type HealthMemory = Record<string, HealthRecord>;
export type SignalFailureType = "audio_error" | "startup_timeout" | "buffer_timeout" | "stalled" | "waiting" | "network_error" | "unsupported_media" | "autoplay_blocked" | "missing_url" | "playback_error";

function storage() { return typeof window === "undefined" ? undefined : window.localStorage; }
export function stationKey(station: Station) { return station.station_uuid || station.id || `${station.name}:${station.url}`; }
function readJson<T>(key: string, fallback: T): T { try { const raw = storage()?.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } }
function writeJson(key: string, value: unknown) { try { storage()?.setItem(key, JSON.stringify(value)); } catch { /* local health memory is best-effort. */ } }

export function readStationHealthMemory(): HealthMemory {
  const now = Date.now();
  const memory = readJson<HealthMemory>(HEALTH_KEY, {});
  return Object.fromEntries(Object.entries(memory).filter(([, value]) => !value.degradedUntil || value.degradedUntil > now - DAY_MS));
}

function rememberList(key: string, station: Station) {
  const previous = readJson<Array<{ key: string; name: string; at: number }>>(key, []).filter((item) => Date.now() - item.at < DAY_MS);
  writeJson(key, [{ key: stationKey(station), name: station.name, at: Date.now() }, ...previous.filter((item) => item.key !== stationKey(station))].slice(0, 50));
}

export function markStationSuccess(station: Station) {
  const memory = readStationHealthMemory();
  const key = stationKey(station);
  const previous = memory[key] ?? { failures: 0, successes: 0 };
  memory[key] = { ...previous, successes: previous.successes + 1, lastSuccessAt: Date.now(), degradedUntil: undefined };
  writeJson(HEALTH_KEY, memory);
  rememberList(SUCCESS_KEY, station);
}

export function queueSignalReview(station: Station, errorType: SignalFailureType, detail?: string) {
  const item = { station_name: station.name, url: station.url_resolved || station.url, country: station.country, city: station.city || station.state, source: station.curation_source || station.curation_tier || "radio_browser", error_type: errorType, detail, timestamp: new Date().toISOString(), user_agent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent, status: "needs_review" };
  const queue = readJson<typeof item[]>(REVIEW_KEY, []);
  writeJson(REVIEW_KEY, [item, ...queue].slice(0, 100));
}

export function markStationFailure(station: Station, errorType: SignalFailureType, detail?: string) {
  const memory = readStationHealthMemory();
  const key = stationKey(station);
  const previous = memory[key] ?? { failures: 0, successes: 0 };
  memory[key] = { ...previous, failures: previous.failures + 1, lastFailureAt: Date.now(), degradedUntil: Date.now() + DAY_MS, errorType };
  writeJson(HEALTH_KEY, memory);
  rememberList(FAILED_KEY, station);
  queueSignalReview(station, errorType, detail);
}

function healthAdjustedScore(station: Station, selected?: Station) {
  const record = readStationHealthMemory()[stationKey(station)];
  let score = station.health_score + Math.min(25, station.votes / 1200) + Math.min(18, station.click_count / 6000) - Math.min(25, station.response_time_ms / 120);
  if (station.last_check_ok) score += 14;
  if (isCuratedStation(station)) score += 12;
  if (DIRECT_STREAM_PATTERN.test(`${station.codec} ${station.url_resolved || station.url}`)) score += 10;
  if (record?.lastSuccessAt && Date.now() - record.lastSuccessAt < DAY_MS) score += 28;
  if (record?.degradedUntil && record.degradedUntil > Date.now()) score -= 70 + record.failures * 18;
  if (!getStationStreamUrl(station)) score -= 500;
  if (station.failure_count > 1) score -= station.failure_count * 15;
  if (selected && stationKey(station) === stationKey(selected)) score += 200;
  return score;
}

export function getStationStreamUrl(station?: Station) { return station?.url_resolved?.trim() || station?.url?.trim() || ""; }

export function buildFastConnectQueue(stations: Station[], selected: Station, minimumBackups = 3) {
  const seen = new Set<string>();
  const city = stationCity(selected);
  const continent = stationContinent(selected);
  const tiers = [
    (s: Station) => stationKey(s) === stationKey(selected),
    (s: Station) => s.country_code === selected.country_code && stationCity(s) === city,
    (s: Station) => s.country_code === selected.country_code,
    (s: Station) => stationContinent(s) === continent,
    (s: Station) => isCuratedStation(s),
    () => true,
  ];
  const candidates: Station[] = [];
  for (const tier of tiers) {
    const ranked = stations.filter((station) => !seen.has(stationKey(station)) && isStationAvailable(station) && tier(station)).sort((a, b) => healthAdjustedScore(b, selected) - healthAdjustedScore(a, selected));
    for (const station of ranked) { seen.add(stationKey(station)); candidates.push(station); }
    if (candidates.length >= minimumBackups + 1 && tier !== tiers[0]) break;
  }
  return candidates.slice(0, Math.max(minimumBackups + 1, FAST_CONNECT_MAX_ATTEMPTS_BEFORE_GLOBAL_FALLBACK + 2));
}

export function nextFastConnectCandidate(stations: Station[], failed: Station, attemptedKeys: string[]) {
  const queue = buildFastConnectQueue(stations, failed, 6);
  return queue.find((station) => !attemptedKeys.includes(stationKey(station)) && stationKey(station) !== stationKey(failed));
}
