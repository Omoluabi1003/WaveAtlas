export const WORLD_ENGINE_TIMEOUT_MS = 3500;
export const WORLD_ENGINE_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
export const OVERPASS_CACHE_TTL_MS = 1000 * 60 * 30;
export const WORLD_ENGINE_USER_AGENT = "WaveAtlas/zero-cost-world-engine (open data context; no paid APIs)";

export function geonamesUsername() {
  return process.env.GEONAMES_USERNAME?.trim() || "";
}
