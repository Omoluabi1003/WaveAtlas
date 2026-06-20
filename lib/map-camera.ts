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

export function flyToStation(map: Map, stationGeo: ResolvedStationGeo, padding: PaddingOptions = EMPTY_PADDING) {
  if (stationGeo.lat === null || stationGeo.lng === null) return;
  map.stop();
  map.flyTo({
    center: [stationGeo.lng, stationGeo.lat],
    zoom: stationGeo.precision === "station" ? 7 : stationGeo.precision === "city" ? 6 : 4.4,
    speed: 0.72,
    curve: 1.35,
    padding,
    essential: true,
  });
}

export function flyToCountry(map: Map, countryGeo: CountryGeo, padding: PaddingOptions = EMPTY_PADDING) {
  map.stop();
  if (countryGeo.bounds) {
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
  map.flyTo({
    center: [countryGeo.centroid.lng, countryGeo.centroid.lat],
    zoom: 4.4,
    speed: 0.72,
    curve: 1.35,
    padding,
    essential: true,
  });
}

export function resizeThenRestore(map: Map, camera: MapCameraState) {
  requestAnimationFrame(() => {
    map.resize();
    requestAnimationFrame(() => restoreCameraState(map, camera));
  });
}
