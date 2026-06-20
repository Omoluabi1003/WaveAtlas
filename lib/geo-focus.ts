import { countryBounds } from './geotruth-resolver';

export type GeoFocus = { lat: number; lng: number; zoom: number; radiusKm: number; countryCode?: string; countryName?: string; city?: string; label: string; mode: 'world' | 'country' | 'city' | 'street' };

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function radiusForZoom(zoom: number) {
  if (zoom <= 2) return 1200;
  if (zoom <= 4) return 500;
  if (zoom <= 7) return 150;
  if (zoom <= 10) return 50;
  return 20;
}

export function modeForZoom(zoom: number): GeoFocus['mode'] {
  if (zoom < 3) return 'world';
  if (zoom < 6) return 'country';
  if (zoom < 10) return 'city';
  return 'street';
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function inBounds(lat: number, lng: number, bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

export function countryCodeForPoint(lat: number, lng: number) {
  const exact = Object.entries(countryBounds).find(([, bounds]) => inBounds(lat, lng, bounds));
  return exact?.[0];
}

export function focusForPoint(lat: number, lng: number, zoom: number, radiusKm = radiusForZoom(zoom)): GeoFocus {
  const mode = modeForZoom(zoom);
  const countryCode = countryCodeForPoint(lat, lng);
  const countryName = countryCode ? countryNames.of(countryCode) ?? countryCode : undefined;
  return { lat, lng, zoom, radiusKm, countryCode, countryName, label: countryName ? `${countryName} signal area` : `${lat.toFixed(2)}, ${lng.toFixed(2)}`, mode };
}
