import { resolveStationGeo as resolveStationGeoTruth } from "@/lib/geotruth-resolver";
export { resolveStationGeoTruth as resolveStationGeo };
import { isCuratedStation, type Station } from "@/lib/stations";

export type SignalStatus = "healthy" | "unverified" | "community";
export type SignalFeature = GeoJSON.Feature<GeoJSON.Point, { id: string; status: SignalStatus; favorite: boolean; priority: number; name: string }>;
export type SignalCluster = { id: string; lat: number; lng: number; count: number; favorite: boolean; priority: number; status: SignalStatus };
export type SignalViewport = { west: number; south: number; east: number; north: number } | { contains: (lng: number, lat: number) => boolean } | null | undefined;
export type GlobeHemisphere = { centerLat: number; centerLng: number } | ((lat: number, lng: number) => boolean) | null | undefined;

type Args = { stations: Station[]; currentStation?: Station | null; viewportBounds?: SignalViewport; globeVisibleHemisphere?: GlobeHemisphere; zoomLevel?: number; globeScale?: number; favoriteIds?: Iterable<string>; maxSignals: number; debug?: boolean };

function key(station?: Station | null) { return station ? station.station_uuid || station.id : ""; }
export function isStationRenderableSignal(station: Station, { debug = false }: { debug?: boolean } = {}) {
  const hasRenderableStream = Boolean(station.url && /^https?:\/\//i.test(station.url));
  const offlineOrFailed = !station.is_active || station.failure_count > 2 || station.health_score < 35;
  return hasRenderableStream && (debug || !offlineOrFailed);
}
function isVisibleInViewport(viewport: SignalViewport, lat: number, lng: number) {
  if (!viewport) return true;
  if ("contains" in viewport) return viewport.contains(lng, lat);
  const inLat = lat >= viewport.south && lat <= viewport.north;
  const inLng = viewport.west <= viewport.east ? lng >= viewport.west && lng <= viewport.east : lng >= viewport.west || lng <= viewport.east;
  return inLat && inLng;
}
function angularDistance(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = Math.PI / 180;
  const φ1 = aLat * toRad, φ2 = bLat * toRad, Δλ = (bLng - aLng) * toRad;
  return Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ);
}
function isVisibleOnGlobe(hemisphere: GlobeHemisphere, lat: number, lng: number) {
  if (!hemisphere) return true;
  if (typeof hemisphere === "function") return hemisphere(lat, lng);
  return angularDistance(hemisphere.centerLat, hemisphere.centerLng, lat, lng) > 0;
}
export function stationSignalStatus(station: Station): SignalStatus {
  if (isCuratedStation(station)) return "community";
  if (station.validation_status === "needs_review" || station.validation_status === "candidate" || station.health_score < 55 || !station.last_check_ok) return "unverified";
  return "healthy";
}
export function stationSignalPriority(station: Station, favorite = false) { return station.health_score + Math.min(30, station.votes / 1000) + Math.min(12, station.click_count / 10000) + (favorite ? 25 : 0) + (isCuratedStation(station) ? 8 : 0); }
function clusterSignals(signals: SignalFeature[], zoom = 1) {
  const cell = zoom < 1.18 ? 28 : zoom < 1.55 ? 18 : zoom < 2.1 ? 10 : 5;
  const buckets = new Map<string, SignalCluster>();
  for (const f of signals) {
    const [lng, lat] = f.geometry.coordinates;
    const id = `${Math.floor((lng + 180) / cell)}:${Math.floor((lat + 90) / cell)}`;
    const hit = buckets.get(id);
    if (hit) { hit.lat = (hit.lat * hit.count + lat) / (hit.count + 1); hit.lng = (hit.lng * hit.count + lng) / (hit.count + 1); hit.count += 1; hit.favorite ||= f.properties.favorite; if (f.properties.priority > hit.priority) { hit.priority = f.properties.priority; hit.status = f.properties.status; } }
    else buckets.set(id, { id, lat, lng, count: 1, favorite: f.properties.favorite, priority: f.properties.priority, status: f.properties.status });
  }
  return [...buckets.values()].filter((c) => c.count > 1).sort((a, b) => b.priority - a.priority);
}
export function buildSignalFeatures({ stations, currentStation, viewportBounds, globeVisibleHemisphere, zoomLevel, globeScale, favoriteIds = [], maxSignals, debug = false }: Args) {
  const favorites = favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds);
  const currentKey = key(currentStation);
  const candidates: SignalFeature[] = [];
  for (const station of stations) {
    if (!isStationRenderableSignal(station, { debug }) || key(station) === currentKey) continue;
    const geo = resolveStationGeoTruth(station);
    if (geo.lat === null || geo.lng === null) continue;
    if (!isVisibleInViewport(viewportBounds, geo.lat, geo.lng) || !isVisibleOnGlobe(globeVisibleHemisphere, geo.lat, geo.lng)) continue;
    const id = key(station);
    const favorite = favorites.has(id) || favorites.has(station.id);
    candidates.push({ type: "Feature", geometry: { type: "Point", coordinates: [geo.lng, geo.lat] }, properties: { id, name: station.name, status: stationSignalStatus(station), favorite, priority: stationSignalPriority(station, favorite) } });
  }
  const visibleSignals = candidates.sort((a, b) => b.properties.priority - a.properties.priority).slice(0, Math.max(0, maxSignals));
  return { visibleSignals, clusters: clusterSignals(visibleSignals, zoomLevel ?? globeScale ?? 1), stats: { candidates: candidates.length, rendered: visibleSignals.length, maxSignals } };
}
