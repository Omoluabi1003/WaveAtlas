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
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export function normalizeLongitudeDelta(delta: number) { return ((((delta + 180) % 360) + 360) % 360) - 180; }
const MAP_BEACON_EASING = easeOutCubic;
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function prefersReducedMotion() { return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches; }
function prefersIOSCameraPath() { return typeof navigator !== "undefined" && /iP(hone|ad|od)/.test(navigator.userAgent); }
function isMobileViewport() { return typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches; }
const ZOOM_POLICY = { worldDefault: 3.2, continentDefault: 4.2, countryDefault: 5.2, stationDefault: 5.8, stationMax: 6.8, cityMax: 7.2, mobileMax: 6.2 } as const;
export function stationDuration(distanceKm: number) {
  if (prefersReducedMotion()) return 0;
  const base = distanceKm > 2400 ? 2200 : distanceKm < 350 ? 900 : 1500;
  return isMobileViewport() ? Math.round(base * 0.72) : base;
}
export function stationZoom(stationGeo: ResolvedStationGeo, currentZoom: number, distanceKm: number) {
  const viewportMax = isMobileViewport() ? ZOOM_POLICY.mobileMax : Number.POSITIVE_INFINITY;
  const precisionMax = stationGeo.precision === "station" ? ZOOM_POLICY.stationMax : stationGeo.precision === "city" ? ZOOM_POLICY.cityMax : ZOOM_POLICY.countryDefault;
  const policyMax = Math.min(precisionMax, viewportMax, ZOOM_POLICY.cityMax);
  const contextualDefault = distanceKm > 5200
    ? ZOOM_POLICY.worldDefault
    : distanceKm > 2200
      ? ZOOM_POLICY.continentDefault
      : stationGeo.precision === "country" || stationGeo.precision === "unknown"
        ? ZOOM_POLICY.countryDefault
        : ZOOM_POLICY.stationDefault;
  const clampedCurrent = Math.min(currentZoom, policyMax);
  const targetZoom = distanceKm < 80 ? Math.max(clampedCurrent, Math.min(contextualDefault, policyMax)) : contextualDefault;
  return Math.min(targetZoom, policyMax);
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

export function applyVisualCenterCamera(map: Map, center: [number, number], zoom: number | undefined, padding: PaddingOptions = EMPTY_PADDING, options: Partial<FlyToOptions> = {}) {
  map.stop();
  const reducedMotion = prefersReducedMotion();
  const cameraOptions = {
    center,
    ...(zoom === undefined ? {} : { zoom }),
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
  const targetLng = center.lng + normalizeLongitudeDelta(stationGeo.lng - center.lng);
  const distanceKm = haversineKm({ lat: center.lat, lng: center.lng }, { lat: stationGeo.lat, lng: targetLng });
  const currentZoom = map.getZoom();
  const bounds = map.getBounds();
  const isVisible = bounds.contains([targetLng, stationGeo.lat]);
  const computedZoom = stationZoom(stationGeo, currentZoom, distanceKm);
  const zoom = isVisible && currentZoom > ZOOM_POLICY.cityMax ? undefined : isVisible ? Math.min(currentZoom, Math.max(computedZoom, currentZoom - 0.35), ZOOM_POLICY.cityMax) : computedZoom;
  const duration = stationDuration(distanceKm);
  if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_GLOBE === "true") {
    console.debug("[WaveAtlas map camera] flyToStation", {
      center: [targetLng, stationGeo.lat],
      zoom,
      speed: 0.72,
      curve: 1.35,
      easing: "easeOutCubic",
      duration,
      padding,
      timestamp: new Date().toISOString(),
    });
  }
  applyVisualCenterCamera(
    map,
    [targetLng, stationGeo.lat],
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
