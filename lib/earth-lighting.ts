import { DEG, normalizeLongitude, type GlobeRotation } from "./globe-math";

export type EarthVector = [number, number, number];

export function earthVector(lat: number, lng: number): EarthVector {
  const latitude = lat * DEG, longitude = lng * DEG;
  return [Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude), Math.cos(latitude) * Math.cos(longitude)];
}

/** NOAA fractional-year approximation, sufficient for a visual solar terminator.
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF */
export function subsolarPoint(at: number): { lat: number; lng: number } {
  const date = new Date(at);
  const year = date.getUTCFullYear();
  const day = Math.floor((at - Date.UTC(year, 0, 1)) / 86400000) + 1;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const gamma = 2 * Math.PI / daysInYear * (day - 1 + (minutes / 60 - 12) / 24);
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  return { lat: declination / DEG, lng: normalizeLongitude((720 - minutes - equation) / 4) };
}

/** Inverse orthographic normal: x is screen-east, y is screen-north.
 * Shares the existing D3 camera rotation, so textured geography and hit targets align. */
export function surfaceVector(x: number, y: number, rotation: GlobeRotation): EarthVector | null {
  if (x * x + y * y > 1) return null;
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  const lat = rotation.rotX, lng = rotation.rotY;
  const forward = z * Math.cos(lat) - y * Math.sin(lat);
  return [x * Math.cos(lng) + forward * Math.sin(lng), y * Math.cos(lat) + z * Math.sin(lat), forward * Math.cos(lng) - x * Math.sin(lng)];
}

export function solarIntensity(point: { lat: number; lng: number }, at: number): number {
  const sun = subsolarPoint(at);
  const a = earthVector(point.lat, point.lng), b = earthVector(sun.lat, sun.lng);
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}
