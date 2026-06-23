"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Map, PaddingOptions } from "maplibre-gl";
import { captureCameraState, flyToCountry, flyToStation, stationDuration, haversineKm, resizeThenRestore, restoreCameraState, type CountryGeo, type MapCameraState } from "@/lib/map-camera";
import type { ResolvedStationGeo } from "@/lib/geotruth-resolver";

export type MapCameraMode = "idle" | "searching" | "results_open" | "station_selected" | "search_closed_no_selection" | "reset";

export function useMapCameraController(map: Map | null, padding: PaddingOptions = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const modeRef = useRef<MapCameraMode>("idle");
  const intendedCameraRef = useRef<MapCameraState | null>(null);
  const preSearchCameraRef = useRef<MapCameraState | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);
  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  const remember = useCallback(() => {
    if (!map) return null;
    const camera = captureCameraState(map);
    intendedCameraRef.current = camera;
    return camera;
  }, [map]);

  const beginSearch = useCallback(() => {
    if (!map || preSearchCameraRef.current) return;
    modeRef.current = "searching";
    preSearchCameraRef.current = captureCameraState(map);
    intendedCameraRef.current = preSearchCameraRef.current;
  }, [map]);

  const openResults = useCallback(() => {
    if (preSearchCameraRef.current) modeRef.current = "results_open";
  }, []);

  const closeSearchWithoutSelection = useCallback(() => {
    if (!map || !preSearchCameraRef.current) return;
    modeRef.current = "search_closed_no_selection";
    const camera = preSearchCameraRef.current;
    intendedCameraRef.current = camera;
    preSearchCameraRef.current = null;
    resizeThenRestore(map, camera);
  }, [map]);

  const selectStation = useCallback((stationGeo: ResolvedStationGeo, _source?: unknown) => {
    if (!map) return;
    modeRef.current = "station_selected";
    preSearchCameraRef.current = null;
    clearSettleTimer();
    flyToStation(map, stationGeo, padding);
    const center = map.getCenter();
    const duration = stationGeo.lat === null || stationGeo.lng === null ? 0 : stationDuration(haversineKm({ lat: center.lat, lng: center.lng }, { lat: stationGeo.lat, lng: stationGeo.lng }));
    settleTimerRef.current = window.setTimeout(() => { intendedCameraRef.current = captureCameraState(map); settleTimerRef.current = null; }, duration + 120);
  }, [clearSettleTimer, map, padding]);

  const selectCountry = useCallback((countryGeo: CountryGeo) => {
    if (!map) return;
    modeRef.current = "station_selected";
    preSearchCameraRef.current = null;
    clearSettleTimer();
    flyToCountry(map, countryGeo, padding);
    settleTimerRef.current = window.setTimeout(() => { intendedCameraRef.current = captureCameraState(map); settleTimerRef.current = null; }, 1020);
  }, [clearSettleTimer, map, padding]);

  const resizeThenReapplyIntended = useCallback(() => {
    if (!map) return;
    const camera = intendedCameraRef.current ?? captureCameraState(map);
    resizeThenRestore(map, camera);
  }, [map]);

  const reset = useCallback((camera: MapCameraState) => {
    if (!map) return;
    modeRef.current = "reset";
    preSearchCameraRef.current = null;
    intendedCameraRef.current = camera;
    clearSettleTimer();
    restoreCameraState(map, camera, { duration: 900 });
  }, [clearSettleTimer, map]);

  return useMemo(() => ({ modeRef, intendedCameraRef, preSearchCameraRef, remember, beginSearch, openResults, closeSearchWithoutSelection, selectStation, selectCountry, resizeThenReapplyIntended, reset }), [beginSearch, closeSearchWithoutSelection, openResults, remember, reset, resizeThenReapplyIntended, selectCountry, selectStation]);
}
