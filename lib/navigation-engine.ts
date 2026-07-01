import { create } from "zustand";
import type { Station } from "@/lib/stations";

export type NavigationSelectionSource = "manual" | "voice" | "startup" | "teleport" | "fallback" | "wanderer" | "deeplink" | "auto" | "atlas-drive" | "nearby";
export type NavigationCameraReason = "station-selected" | "teleport" | "wanderer" | "candidate-lock" | "startup" | "fallback" | "deeplink" | "auto" | "atlas-drive" | "nearby";
export type NavigationBeaconState = "idle" | "traveling" | "arrived";

export type NavigationCameraIntent = {
  id: number;
  station: Station;
  source: NavigationSelectionSource;
  reason: NavigationCameraReason;
  createdAt: number;
};

type NavigationHistoryEntry = {
  station: Station;
  source: NavigationSelectionSource;
  at: number;
};

type NavigationEngineState = {
  activeStation?: Station;
  selectedStation?: Station;
  cameraIntent?: NavigationCameraIntent;
  beaconState: NavigationBeaconState;
  teleportOrigin?: Station;
  wandererDestination?: Station;
  candidateLockDestination?: Station;
  stationHistory: NavigationHistoryEntry[];
  selectionVersion: number;
  setActiveStation: (station: Station, source?: NavigationSelectionSource, version?: number) => void;
  setSelectedStation: (station: Station, source?: NavigationSelectionSource, version?: number) => void;
  setBeaconState: (state: NavigationBeaconState) => void;
  setTeleportOrigin: (station?: Station) => void;
  setWandererDestination: (station?: Station) => void;
  setCandidateLockDestination: (station?: Station) => void;
};

let cameraIntentId = 0;

function stationIdentity(station: Station) {
  return station.station_uuid || station.id;
}

function cameraReasonForSource(source: NavigationSelectionSource): NavigationCameraReason {
  if (source === "teleport" || source === "wanderer" || source === "fallback" || source === "deeplink" || source === "auto" || source === "atlas-drive" || source === "nearby" || source === "startup") return source;
  return "station-selected";
}

export const useNavigationEngine = create<NavigationEngineState>((set) => ({
  beaconState: "idle",
  stationHistory: [],
  selectionVersion: 0,
  setActiveStation: (station, source = "manual", version) => set((state) => {
    const nextVersion = version ?? state.selectionVersion + 1;
    const sameStation = state.activeStation && stationIdentity(state.activeStation) === stationIdentity(station);
    return {
      activeStation: station,
      selectedStation: station,
      selectionVersion: nextVersion,
      beaconState: sameStation ? state.beaconState : "traveling",
      cameraIntent: sameStation && state.cameraIntent?.station && stationIdentity(state.cameraIntent.station) === stationIdentity(station)
        ? state.cameraIntent
        : { id: ++cameraIntentId, station, source, reason: cameraReasonForSource(source), createdAt: Date.now() },
      stationHistory: sameStation ? state.stationHistory : [{ station, source, at: Date.now() }, ...state.stationHistory].slice(0, 50),
      teleportOrigin: source === "teleport" ? state.activeStation : state.teleportOrigin,
      wandererDestination: source === "wanderer" ? station : state.wandererDestination,
      candidateLockDestination: source === "auto" ? station : state.candidateLockDestination,
    };
  }),
  setSelectedStation: (station, source = "manual", version) => useNavigationEngine.getState().setActiveStation(station, source, version),
  setBeaconState: (beaconState) => set({ beaconState }),
  setTeleportOrigin: (teleportOrigin) => set({ teleportOrigin }),
  setWandererDestination: (wandererDestination) => set({ wandererDestination }),
  setCandidateLockDestination: (candidateLockDestination) => set({ candidateLockDestination }),
}));
