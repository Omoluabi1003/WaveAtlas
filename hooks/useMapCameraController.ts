"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Map, PaddingOptions } from "maplibre-gl";
import { captureCameraState, flyToCountry, flyToStation, stationDuration, haversineKm, resizeThenRestore, restoreCameraState, type CountryGeo, type MapCameraState } from "@/lib/map-camera";
import type { ResolvedStationGeo } from "@/lib/geotruth-resolver";
import { readAtlasLocation } from "@/lib/atlas-location";

export type MapCameraMode = "idle" | "searching" | "results_open" | "station_selected" | "search_closed_no_selection" | "reset";

type StartupPreferenceSnapshot = {
  resumeLastStation?: boolean;
  homeStationStartup?: boolean;
  homeStationId?: string | null;
};

const STARTUP_PREFERENCES_KEY = "waveatlas:startup-preferences";
const COLD_START_WORLD_CENTER: [number, number] = [0, 20];
const COLD_START_WORLD_ZOOM = 1.75;

export function shouldGuardColdStart(pathname: string, preferences: StartupPreferenceSnapshot = {}) {
  if (pathname !== "/") return false;
  if (preferences.resumeLastStation) return false;
  if (preferences.homeStationStartup && preferences.homeStationId) return false;
  return true;
}

function readStartupPreferenceSnapshot(): StartupPreferenceSnapshot {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STARTUP_PREFERENCES_KEY) || "{}");
    return {
      resumeLastStation: parsed?.resumeLastStation === true,
      homeStationStartup: parsed?.homeStationStartup === true,
      homeStationId: typeof parsed?.homeStationId === "string" ? parsed.homeStationId : null,
    };
  } catch {
    return {};
  }
}

function zoomForDeviceAccuracy(accuracyMeters: number) {
  if (accuracyMeters <= 30) return 12;
  if (accuracyMeters <= 100) return 11;
  if (accuracyMeters <= 500) return 10;
  if (accuracyMeters <= 1500) return 9;
  return 8;
}

export function useMapCameraController(map: Map | null, padding: PaddingOptions = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const modeRef = useRef<MapCameraMode>("idle");
  const intendedCameraRef = useRef<MapCameraState | null>(null);
  const preSearchCameraRef = useRef<MapCameraState | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const coldStartGuardedRef = useRef(false);
  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);
  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  // Cold-start GeoTruth guard: the home screen must never inherit stations[0]
  // as the listener's apparent location. Without an explicit startup station,
  // begin from a neutral world view and move only to a validated device fix.
  useEffect(() => {
    if (!map || coldStartGuardedRef.current || typeof window === "undefined") return;
    const preferences = readStartupPreferenceSnapshot();
    if (!shouldGuardColdStart(window.location.pathname, preferences)) return;

    coldStartGuardedRef.current = true;
    let cancelled = false;
    let userInteracted = false;
    const markInteraction = () => { userInteracted = true; };
    map.on("dragstart", markInteraction);
    map.on("pitchstart", markInteraction);
    map.on("rotatestart", markInteraction);

    map.jumpTo({ center: COLD_START_WORLD_CENTER, zoom: COLD_START_WORLD_ZOOM, bearing: 0, pitch: 0 });
    intendedCameraRef.current = captureCameraState(map);

    void readAtlasLocation({ allowPrompt: false, timeoutMs: 6000 }).then((location) => {
      if (cancelled || userInteracted || modeRef.current !== "idle" || !location) return;
      map.easeTo({
        center: [location.lng, location.lat],
        zoom: zoomForDeviceAccuracy(location.accuracy),
        bearing: 0,
        pitch: 0,
        duration: 900,
        padding,
        essential: true,
      });
      window.setTimeout(() => {
        if (!cancelled) intendedCameraRef.current = captureCameraState(map);
      }, 1020);
    });

    return () => {
      cancelled = true;
      map.off("dragstart", markInteraction);
      map.off("pitchstart", markInteraction);
      map.off("rotatestart", markInteraction);
    };
  }, [map, padding]);

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
