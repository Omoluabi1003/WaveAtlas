import type { FitBoundsOptions, FlyToOptions, LngLatBoundsLike, Map, PaddingOptions } from "maplibre-gl";
import type { ResolvedStationGeo } from "@/lib/geotruth-resolver";

export type MapCameraState = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

export type CountryGeo = {
  centroid: { lat: number; lng: number };
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
};

const EMPTY_PADDING: PaddingOptions = { top: 0, right: 0, bottom: 0, left: 0 };
const MAP_BEACON_EASING = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function prefersReducedMotion() { return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; }
function prefersIOSCameraPath() { return typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent); }
function stationDuration(distanceKm: number) { return prefersReducedMotion() ? 0 : distanceKm > 2400 ? 2600 : distanceKm < 350 ? 1200 : 1800; }
function stationZoom(stationGeo: ResolvedStationGeo, currentZoom: number, distanceKm: number) {
  const base = stationGeo.precision === "station" ? 13.5 : stationGeo.precision === "city" ? 11.5 : 5.4;
  if (distanceKm < 80) return Math.max(Math.min(currentZoom, 15), Math.min(base, 12.5));
  if (distanceKm > 2400) return Math.min(base, 6.2);
  return base;
}

export function captureCameraState(map: Map): MapCameraState {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

export function restoreCameraState(map: Map, camera: MapCameraState, options: Partial<FlyToOptions> = {}) {
  map.stop();
  map.easeTo({
    center: camera.center,
    zoom: camera.zoom,
    bearing: camera.bearing,
    pitch: camera.pitch,
    padding: EMPTY_PADDING,
    duration: 0,
    essential: true,
    ...options,
  });
}

export function applyVisualCenterCamera(map: Map, center: [number, number], zoom: number, padding: PaddingOptions = EMPTY_PADDING, options: Partial<FlyToOptions> = {}) {
  map.stop();
  const reducedMotion = prefersReducedMotion();
  const cameraOptions = {
    center,
    zoom,
    speed: 0.72,
    curve: 1.35,
    padding,
    essential: !reducedMotion,
    ...options,
    duration: reducedMotion ? 0 : options.duration,
  };
  if (prefersIOSCameraPath()) map.easeTo(cameraOptions);
  else map.flyTo(cameraOptions);
}

export function flyToStation(map: Map, stationGeo: ResolvedStationGeo, padding: PaddingOptions = EMPTY_PADDING) {
  if (stationGeo.lat === null || stationGeo.lng === null) return;
  const center = map.getCenter();
  const distanceKm = haversineKm({ lat: center.lat, lng: center.lng }, { lat: stationGeo.lat, lng: stationGeo.lng });
  const zoom = stationZoom(stationGeo, map.getZoom(), distanceKm);
  const duration = stationDuration(distanceKm);
  if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_GLOBE === "true") {
    console.debug("[WaveAtlas map camera] flyToStation", {
      center: [stationGeo.lng, stationGeo.lat],
      zoom,
      speed: 0.72,
      curve: 1.35,
      easing: "easeInOutCubic",
      duration,
      padding,
      timestamp: new Date().toISOString(),
    });
  }
  applyVisualCenterCamera(
    map,
    [stationGeo.lng, stationGeo.lat],
    zoom,
    padding,
    { duration, easing: MAP_BEACON_EASING },
  );
}

export function flyToCountry(map: Map, countryGeo: CountryGeo, padding: PaddingOptions = EMPTY_PADDING) {
  if (countryGeo.bounds) {
    map.stop();
    const bounds: LngLatBoundsLike = [
      [countryGeo.bounds.minLng, countryGeo.bounds.minLat],
      [countryGeo.bounds.maxLng, countryGeo.bounds.maxLat],
    ];
    map.fitBounds(bounds, {
      padding,
      maxZoom: 5.2,
      duration: 900,
      essential: true,
    } satisfies FitBoundsOptions);
    return;
  }
  applyVisualCenterCamera(map, [countryGeo.centroid.lng, countryGeo.centroid.lat], 4.4, padding);
}

export function resizeThenRestore(map: Map, camera: MapCameraState) {
  requestAnimationFrame(() => {
    map.resize();
    requestAnimationFrame(() => restoreCameraState(map, camera));
  });
}

export function resizeThenReapply(map: Map, reapply: () => void) {
  requestAnimationFrame(() => {
    map.resize();
    requestAnimationFrame(reapply);
  });
}
