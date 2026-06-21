import { OVERPASS_CACHE_TTL_MS, WORLD_ENGINE_TIMEOUT_MS } from "./config";
import { fetchJsonWithTimeout, getCached, setCached } from "./cache";
import type { SourceResult } from "./types";

type OverpassElement = { tags?: Record<string, string>; lat?: number; lon?: number };
type Overpass = { elements?: OverpassElement[] };
export type OsmNearby = { landmarks: Array<{ name: string; kind?: string; lat?: number; lng?: number }> };
let lastOverpassAt = 0;

export async function getNearbyOsmPoi(lat?: number | null, lng?: number | null): Promise<SourceResult<OsmNearby>> {
  if (typeof lat !== "number" || typeof lng !== "number") return { status: "skipped", source: "OpenStreetMap", confidence: 0, data: null, attribution: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/" };
  const rounded = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const key = `osm:${rounded}`;
  const cached = getCached<OsmNearby>(key);
  if (cached) return { status: "success", source: "OpenStreetMap", confidence: 0.68, data: cached, attribution: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/", cached: true };
  if (Date.now() - lastOverpassAt < 1200) return { status: "skipped", source: "OpenStreetMap", confidence: 0, data: null, attribution: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/", error: "Throttled" };
  lastOverpassAt = Date.now();
  const q = `[out:json][timeout:3];(node(around:2500,${lat},${lng})[tourism][name];node(around:2500,${lat},${lng})[amenity][name];node(around:5000,${lat},${lng})[aeroway=aerodrome][name];node(around:5000,${lat},${lng})[railway=station][name];);out center 12;`;
  try { const json = await fetchJsonWithTimeout<Overpass>(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, WORLD_ENGINE_TIMEOUT_MS); const seen = new Set<string>(); const landmarks = (json.elements ?? []).map((el) => ({ name: el.tags?.name ?? "", kind: el.tags?.tourism ?? el.tags?.amenity ?? el.tags?.railway ?? el.tags?.aeroway, lat: el.lat, lng: el.lon })).filter((p) => p.name && !seen.has(p.name) && seen.add(p.name)).slice(0, 5); const data = { landmarks }; setCached(key, data, OVERPASS_CACHE_TTL_MS); return { status: "success", source: "OpenStreetMap", confidence: landmarks.length ? 0.68 : 0.3, data, attribution: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/" }; } catch (error) { return { status: "error", source: "OpenStreetMap", confidence: 0, data: null, attribution: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/", error: error instanceof Error ? error.message : "Unavailable" }; }
}
