import { WORLD_ENGINE_CACHE_TTL_MS, WORLD_ENGINE_TIMEOUT_MS } from "./config";
import { fetchJsonWithTimeout, getCached, setCached } from "./cache";
import type { SourceResult } from "./types";

type Feature = { properties?: { mag?: number; place?: string; time?: number; url?: string }; geometry?: { coordinates?: [number, number, number] } };
type Feed = { features?: Feature[] };
export type EarthquakeContext = { nearby: Array<{ magnitude?: number; place?: string; distanceKm: number; time?: string; url?: string }> };
const toRad = (n: number) => n * Math.PI / 180;
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) { const r = 6371; const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng); const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(x)); }

export async function getNearbyEarthquakes(lat?: number | null, lng?: number | null): Promise<SourceResult<EarthquakeContext>> {
  if (typeof lat !== "number" || typeof lng !== "number") return { status: "skipped", source: "USGS Earthquake", confidence: 0, data: null, attribution: "U.S. Geological Survey", url: "https://earthquake.usgs.gov/" };
  const key = "usgs:week:2.5";
  try {
    let feed = getCached<Feed>(key);
    let cached = true;
    if (!feed) { cached = false; feed = await fetchJsonWithTimeout<Feed>("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson", WORLD_ENGINE_TIMEOUT_MS); setCached(key, feed, WORLD_ENGINE_CACHE_TTL_MS / 12); }
    const nearby: EarthquakeContext["nearby"] = [];
    for (const f of feed.features ?? []) {
      const coords = f.geometry?.coordinates;
      if (!coords) continue;
      const distanceKm = Math.round(km({ lat, lng }, { lat: coords[1], lng: coords[0] }));
      if (distanceKm >= 650) continue;
      nearby.push({ magnitude: f.properties?.mag, place: f.properties?.place, distanceKm, time: f.properties?.time ? new Date(f.properties.time).toISOString() : undefined, url: f.properties?.url });
    }
    nearby.sort((a, b) => a.distanceKm - b.distanceKm);
    nearby.splice(3);
    return { status: "success", source: "USGS Earthquake", confidence: nearby.length ? 0.72 : 0.35, data: { nearby }, attribution: "U.S. Geological Survey", url: "https://earthquake.usgs.gov/", cached };
  } catch (error) { return { status: "error", source: "USGS Earthquake", confidence: 0, data: null, attribution: "U.S. Geological Survey", url: "https://earthquake.usgs.gov/", error: error instanceof Error ? error.message : "Unavailable" }; }
}
