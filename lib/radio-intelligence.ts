import { fetchStations, rankStations, type Station } from "@/lib/stations";

export type CanonicalStation = {
  stationId: string; name: string; streamUrl: string; resolvedUrl?: string; homepage?: string; country: string; state?: string; city?: string;
  coordinates?: { latitude: number; longitude: number }; language?: string; genre?: string; codec?: string; bitrate?: number; tags: string[]; source: string;
  confidence: number; lastCheckedAt: string; healthStatus: "playable" | "downgraded" | "failed" | "unknown";
  externalIds: Record<string, string>; failureCount: number; healthHistory: Array<{ checkedAt: string; status: CanonicalStation["healthStatus"]; latencyMs?: number; reason?: string }>;
};

const MAX_FAILURES_BEFORE_DEAD = 3;
const memory = new Map<string, CanonicalStation>();
let lastValidationRun: string | null = null;
let recoveredStations = 0;

function key(value?: string) { return (value || "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""); }
function nameGeoKey(s: Station) { return [s.name, s.country_code, s.state, s.city].map(key).join("|"); }

export function toCanonicalStation(station: Station, source = station.curation_source || "radio-browser"): CanonicalStation {
  const healthStatus: CanonicalStation["healthStatus"] = station.is_active && station.last_check_ok !== false ? "playable" : station.failure_count >= MAX_FAILURES_BEFORE_DEAD ? "failed" : "downgraded";
  return {
    stationId: station.station_uuid || station.id,
    name: station.name,
    streamUrl: station.url,
    resolvedUrl: station.url_resolved,
    homepage: station.homepage,
    country: station.country,
    state: station.state,
    city: station.city,
    coordinates: typeof station.latitude === "number" && typeof station.longitude === "number" ? { latitude: station.latitude, longitude: station.longitude } : undefined,
    language: station.language,
    genre: station.tags[0],
    codec: station.codec,
    bitrate: station.bitrate,
    tags: station.tags,
    source,
    confidence: Math.max(0, Math.min(100, station.health_score)),
    lastCheckedAt: station.last_checked_at,
    healthStatus,
    externalIds: station.station_uuid ? { radioBrowserUuid: station.station_uuid } : {},
    failureCount: station.failure_count,
    healthHistory: [{ checkedAt: station.last_checked_at, status: healthStatus, latencyMs: station.response_time_ms }],
  };
}

export function upsertCanonicalStations(stations: Station[], source?: string) {
  const index = new Map<string, string>();
  for (const [id, existing] of memory) {
    [key(existing.streamUrl), key(existing.resolvedUrl), key(existing.homepage), key(existing.externalIds.radioBrowserUuid), key(`${existing.name}|${existing.country}|${existing.state}|${existing.city}`)].filter(Boolean).forEach((k) => index.set(k, id));
  }
  for (const station of stations) {
    const candidate = toCanonicalStation(station, source);
    const keys = [key(candidate.streamUrl), key(candidate.resolvedUrl), key(candidate.homepage), key(candidate.externalIds.radioBrowserUuid), nameGeoKey(station)].filter(Boolean);
    const existingId = keys.map((k) => index.get(k)).find(Boolean);
    const id = existingId || candidate.stationId;
    const previous = memory.get(id);
    const merged = previous ? { ...previous, ...candidate, healthHistory: [...previous.healthHistory.slice(-24), ...candidate.healthHistory] } : candidate;
    memory.set(id, merged);
    keys.forEach((k) => index.set(k, id));
  }
  return Array.from(memory.values());
}

export async function discoverRadioIntelligence({ q = "", genre, countryCode, limit = 100 }: { q?: string; genre?: string; countryCode?: string; limit?: number }) {
  const stations = await fetchStations({ q, tag: genre, countryCode, hidebroken: "false", limit: String(Math.min(limit, 500)), allowFallback: "true" });
  return upsertCanonicalStations(stations, "radio-browser");
}

async function validateStation(station: CanonicalStation): Promise<CanonicalStation> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const response = await fetch(station.resolvedUrl || station.streamUrl, { method: "HEAD", signal: AbortSignal.timeout(4500), headers: { "Range": "bytes=0-1" } });
    const playable = response.ok || [405, 501, 403].includes(response.status);
    const status: CanonicalStation["healthStatus"] = playable ? "playable" : station.failureCount + 1 >= MAX_FAILURES_BEFORE_DEAD ? "failed" : "downgraded";
    if (station.healthStatus === "downgraded" && playable) recoveredStations += 1;
    return { ...station, healthStatus: status, failureCount: playable ? 0 : station.failureCount + 1, confidence: playable ? Math.max(station.confidence, 82) : Math.max(5, station.confidence - 12), lastCheckedAt: checkedAt, healthHistory: [...station.healthHistory.slice(-24), { checkedAt, status, latencyMs: Date.now() - started, reason: response.statusText }] };
  } catch (error) {
    const status = station.failureCount + 1 >= MAX_FAILURES_BEFORE_DEAD ? "failed" : "downgraded";
    return { ...station, healthStatus: status, failureCount: station.failureCount + 1, confidence: Math.max(5, station.confidence - 10), lastCheckedAt: checkedAt, healthHistory: [...station.healthHistory.slice(-24), { checkedAt, status, reason: error instanceof Error ? error.message : "validation failed" }] };
  }
}

export async function runValidationCycle(limit = 25) {
  const pool = Array.from(memory.values()).filter((s) => s.healthStatus !== "playable" || s.failureCount > 0).slice(0, limit);
  const checked = await Promise.all(pool.map(validateStation));
  checked.forEach((station) => memory.set(station.stationId, station));
  lastValidationRun = new Date().toISOString();
  return checked;
}

export function queryRadioIntelligence({ q = "", genre, country, health = "playable", limit = 50 }: { q?: string; genre?: string; country?: string; health?: CanonicalStation["healthStatus"] | "all"; limit?: number }) {
  const needle = q.toLowerCase();
  return Array.from(memory.values()).filter((s) => (health === "all" || s.healthStatus === health) && (!genre || s.tags.some((t) => t.toLowerCase().includes(genre.toLowerCase()))) && (!country || s.country.toLowerCase() === country.toLowerCase()) && (!needle || `${s.name} ${s.country} ${s.state} ${s.city} ${s.tags.join(" ")}`.toLowerCase().includes(needle))).slice(0, limit);
}

export function radioIntelligenceDiagnostics() {
  const stations = Array.from(memory.values());
  return { totalStations: stations.length, playableStations: stations.filter((s) => s.healthStatus === "playable").length, downgradedStations: stations.filter((s) => s.healthStatus === "downgraded").length, recoveredStations, failedStations: stations.filter((s) => s.healthStatus === "failed").length, lastValidationRun, targetCapacity: 300000 };
}

export function canonicalToStation(s: CanonicalStation): Station { return { id: s.stationId, station_uuid: s.externalIds.radioBrowserUuid || s.stationId, name: s.name, url: s.streamUrl, url_resolved: s.resolvedUrl, homepage: s.homepage, country: s.country, country_code: "UN", state: s.state, city: s.city, language: s.language || "Unknown", tags: s.tags, codec: s.codec || "Unknown", bitrate: s.bitrate || 0, latitude: s.coordinates?.latitude, longitude: s.coordinates?.longitude, votes: 0, click_count: 0, health_score: s.confidence, is_active: s.healthStatus === "playable", last_checked_at: s.lastCheckedAt, failure_count: s.failureCount, response_time_ms: s.healthHistory.at(-1)?.latencyMs || 0, last_check_ok: s.healthStatus === "playable" }; }
export function rankCanonical(stations: CanonicalStation[], q = "") { return rankStations(stations.map(canonicalToStation), q).map((station) => stations.find((s) => s.stationId === station.id)!).filter(Boolean); }
