import { WORLD_ENGINE_CACHE_TTL_MS, WORLD_ENGINE_TIMEOUT_MS, geonamesUsername } from "./config";
import { fetchJsonWithTimeout, getCached, setCached } from "./cache";
import type { SourceResult } from "./types";

type GeoNamesNearby = { geonames?: Array<{ name?: string; countryName?: string; lat?: string; lng?: string; fclName?: string }> };
export type GeoNamesPlace = { name?: string; country?: string; lat?: number; lng?: number; kind?: string };

export async function getNearestGeoName(lat?: number | null, lng?: number | null): Promise<SourceResult<GeoNamesPlace>> {
  const username = geonamesUsername();
  if (!username) return { status: "skipped", source: "GeoNames", confidence: 0, data: null, attribution: "GeoNames", url: "https://www.geonames.org/", error: "Set GEONAMES_USERNAME to enable GeoNames." };
  if (typeof lat !== "number" || typeof lng !== "number") return { status: "skipped", source: "GeoNames", confidence: 0, data: null, attribution: "GeoNames", url: "https://www.geonames.org/" };
  const key = `geonames:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = getCached<GeoNamesPlace>(key);
  if (cached) return { status: "success", source: "GeoNames", confidence: 0.74, data: cached, attribution: "GeoNames", url: "https://www.geonames.org/", cached: true };
  try { const json = await fetchJsonWithTimeout<GeoNamesNearby>(`https://secure.geonames.org/findNearbyPlaceNameJSON?lat=${lat}&lng=${lng}&radius=50&maxRows=1&username=${encodeURIComponent(username)}`, WORLD_ENGINE_TIMEOUT_MS); const item = json.geonames?.[0]; if (!item) throw new Error("No nearby populated place"); const data = { name: item.name, country: item.countryName, lat: Number(item.lat), lng: Number(item.lng), kind: item.fclName }; setCached(key, data, WORLD_ENGINE_CACHE_TTL_MS); return { status: "success", source: "GeoNames", confidence: 0.74, data, attribution: "GeoNames", url: "https://www.geonames.org/" }; } catch (error) { return { status: "error", source: "GeoNames", confidence: 0, data: null, attribution: "GeoNames", url: "https://www.geonames.org/", error: error instanceof Error ? error.message : "Unavailable" }; }
}
