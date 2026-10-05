import { solarIntensity } from "./earth-lighting";
export type AppearanceMode = "auto" | "day" | "night";
export type Appearance = "day" | "night";
export type AppearanceLocation = { lat: number; lng: number };
export const APPEARANCE_STORAGE_KEY = "waveatlas-appearance-v1";

export function validAppearanceMode(value: unknown): AppearanceMode {
  return value === "day" || value === "night" ? value : "auto";
}
export function resolveSolarAppearance(mode: AppearanceMode, location: AppearanceLocation | null, at: number, deviceDark: boolean): Appearance {
  if (mode !== "auto") return mode;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) return deviceDark ? "night" : "day";
  // Approximate apparent sunrise/sunset (solar center 0.833 degrees below horizon).
  return solarIntensity(location, at) > Math.sin(-0.833 * Math.PI / 180) ? "day" : "night";
}
export function appearanceStreetBasemap<T extends string>(basemap: T, appearance: Appearance): T | "atlasStreets" | "atlas" {
  return ["atlasStreets", "streets", "atlas"].includes(basemap) ? (appearance === "night" ? "atlas" : "atlasStreets") : basemap;
}
