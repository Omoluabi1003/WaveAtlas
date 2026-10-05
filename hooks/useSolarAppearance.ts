"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { APPEARANCE_STORAGE_KEY, resolveSolarAppearance, validAppearanceMode, type Appearance, type AppearanceLocation, type AppearanceMode } from "@/lib/solar-appearance";

type AppearanceState = {
  mode: AppearanceMode; resolved: Appearance; location: AppearanceLocation | null;
  source: "location" | "device" | "manual"; locationMessage: string;
  setMode(mode: AppearanceMode): void;
};
export const useAppearance = create<AppearanceState>((set) => ({
  mode: "auto", resolved: "night", location: null, source: "device", locationMessage: "",
  setMode(mode) {
    try { localStorage.setItem(APPEARANCE_STORAGE_KEY, mode); } catch { /* Session preference still works. */ }
    set({ mode });
  },
}));

export function requestAppearanceLocation() {
  if (!navigator.geolocation) { useAppearance.setState({locationMessage:"Location is unavailable. Auto follows your device appearance."}); return; }
  useAppearance.setState({locationMessage:"Finding your local daylight…"});
  navigator.geolocation.getCurrentPosition(
    ({coords}) => useAppearance.setState({location:{lat:coords.latitude,lng:coords.longitude},locationMessage:"Auto follows your local sunrise and sunset."}),
    () => useAppearance.setState({location:null,locationMessage:"Location is unavailable. Auto follows your device appearance."}),
    {enableHighAccuracy:false,maximumAge:300000,timeout:8000},
  );
}

/** Mount once at the app root. No geolocation prompt until an explicit user action. */
export function useSolarAppearance() {
  const resolved = useAppearance((s) => s.resolved);
  useEffect(() => {
    let active = true;
    let permission: PermissionStatus | null = null;
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    try { useAppearance.setState({mode:validAppearanceMode(localStorage.getItem(APPEARANCE_STORAGE_KEY))}); } catch { /* Default Auto. */ }
    const update = () => {
      if (!active) return;
      const {mode,location} = useAppearance.getState();
      const next = resolveSolarAppearance(mode, location, Date.now(), scheme.matches);
      const source = mode !== "auto" ? "manual" : location ? "location" : "device";
      const state = useAppearance.getState();
      if (state.resolved !== next || state.source !== source) useAppearance.setState({resolved:next,source});
    };
    const onPermission = () => {
      if (!active || !permission) return;
      if (permission.state === "granted" && useAppearance.getState().mode === "auto") requestAppearanceLocation();
      if (permission.state !== "granted") useAppearance.setState({location:null});
    };
    if (navigator.permissions) void navigator.permissions.query({name:"geolocation"}).then((result) => {
      if (!active) return;
      permission=result; permission.addEventListener("change",onPermission); onPermission();
    }).catch(() => { /* Auto still follows the device. */ });
    const unsubscribe = useAppearance.subscribe((state, previous) => { update(); if (state.mode !== previous.mode && state.mode === "auto") onPermission(); });
    scheme.addEventListener("change",update);
    const onVisibility = () => { if (!document.hidden) { update(); onPermission(); } };
    document.addEventListener("visibilitychange",onVisibility);
    window.addEventListener("pageshow",update);
    const onStorage = (event: StorageEvent) => { if(event.key===APPEARANCE_STORAGE_KEY)useAppearance.setState({mode:validAppearanceMode(event.newValue)}); };
    window.addEventListener("storage",onStorage);
    const timer = window.setInterval(() => { if (!document.hidden) update(); },30000);
    update();
    return () => {
      active=false; unsubscribe(); window.clearInterval(timer);
      scheme.removeEventListener("change",update); document.removeEventListener("visibilitychange",onVisibility);
      window.removeEventListener("pageshow",update); window.removeEventListener("storage",onStorage);
      permission?.removeEventListener("change",onPermission);
    };
  },[]);
  return resolved;
}
