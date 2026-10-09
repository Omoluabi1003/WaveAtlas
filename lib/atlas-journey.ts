import { geoCentroid, geoContains, geoDistance, geoInterpolate, type GeoPermissibleObjects } from 'd3-geo';
import countries from './data/natural-earth-countries.json';
import { resolveStationGeo } from './geotruth-resolver';
import type { Station } from './stations';

import type { JourneyPlace, JourneyRoute } from './atlas-journey-contract';
export { decodeJourney, validJourneyPlace, validJourneyRoute } from './atlas-journey-contract';
export type { JourneyPlace, JourneyRoute } from './atlas-journey-contract';
export const JOURNEY_SAVED_KEY = 'waveatlas_journeys_v1';
export const JOURNEY_PRESETS: JourneyRoute[] = [
  { from: { label: 'Lagos, Nigeria', lat: 6.5244, lng: 3.3792, countryCode: 'NG' }, to: { label: 'Dubai, United Arab Emirates', lat: 25.2048, lng: 55.2708, countryCode: 'AE' } },
  { from: { label: 'London, United Kingdom', lat: 51.5072, lng: -0.1276, countryCode: 'GB' }, to: { label: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503, countryCode: 'JP' } },
  { from: { label: 'New York, United States', lat: 40.7128, lng: -74.006, countryCode: 'US' }, to: { label: 'São Paulo, Brazil', lat: -23.5505, lng: -46.6333, countryCode: 'BR' } },
];
export const JOURNEY_COUNTRIES: JourneyPlace[] = countries.features.filter((f) => /^[A-Z]{2}$/.test(f.properties.ISO_A2)).map((f) => {
  const [lng, lat] = geoCentroid(f as GeoPermissibleObjects);
  return { label: f.properties.NAME_EN || f.properties.NAME, lat, lng, countryCode: f.properties.ISO_A2, approximate: true };
}).sort((a, b) => a.label.localeCompare(b.label));

export function journeyFromStation(station?: Station | null): JourneyPlace | null {
  if (!station) return null;
  const geo = resolveStationGeo(station);
  if (geo.lat === null || geo.lng === null) return null;
  return { label: (geo.precision === 'country' ? station.country : [station.city || station.state, station.country].filter(Boolean).join(', ')) || station.name, lat: geo.lat, lng: geo.lng, countryCode: /^[A-Z]{2}$/.test(station.country_code) ? station.country_code : undefined, approximate: geo.precision === 'country' };
}
export function journeyDistance(route: JourneyRoute) { return geoDistance([route.from.lng, route.from.lat], [route.to.lng, route.to.lat]) * 6371; }
const interpolators = new WeakMap<JourneyRoute, (progress: number) => [number, number]>();
function routeInterpolator(route: JourneyRoute) {
  const cached = interpolators.get(route);
  if (cached) return cached;
  const from: [number, number] = [route.from.lng, route.from.lat], to: [number, number] = [route.to.lng, route.to.lat];
  // Antipodes have many equally short routes. Choose a deterministic orthogonal
  // waypoint so interpolation remains finite and moves at a constant rate.
  const antipodal = Math.PI - geoDistance(from, to) < 1e-6;
  const middle: [number, number] = [((route.from.lng + 270) % 360) - 180, 0];
  const first = geoInterpolate(from, middle), second = geoInterpolate(middle, to), direct = geoInterpolate(from, to);
  const interpolate = antipodal ? (p: number): [number, number] => p <= 0.5 ? first(p * 2) : second((p - 0.5) * 2) : direct;
  interpolators.set(route, interpolate); return interpolate;
}
export function journeyPosition(route: JourneyRoute, progress: number) {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const [lng, lat] = routeInterpolator(route)(p);
  return { lat, lng };
}
export function journeyTrack(route: JourneyRoute, end = 1, steps = 100): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => { const point = journeyPosition(route, Math.max(0, Math.min(1, end)) * i / steps); return [point.lng, point.lat]; });
}
export function journeyRegion(point: { lat: number; lng: number }) {
  const feature = countries.features.find((f) => geoContains(f as GeoPermissibleObjects, [point.lng, point.lat]));
  return feature ? { name: feature.properties.NAME_EN || feature.properties.NAME, code: feature.properties.ISO_A2 } : null;
}
export function journeyClock(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function nearbyJourneyStations(stations: Station[], point: { lat: number; lng: number }, radiusKm = 800, limit = 6) {
  const seen = new Set<string>();
  return stations.flatMap((station) => {
    const id = station.station_uuid || station.id;
    if (seen.has(id) || !station.is_active || station.failure_count > 2 || station.health_score < 35 || !/^https?:\/\//i.test(station.url) || station.sourceType === 'geoaudio') return [];
    seen.add(id);
    const place = journeyFromStation(station);
    // Country centroids are useful route endpoints, but cannot establish that
    // a radio station is physically nearby the simulated aircraft.
    if (!place || place.approximate) return [];
    const distanceKm = geoDistance([point.lng, point.lat], [place.lng, place.lat]) * 6371;
    return distanceKm <= radiusKm ? [{ station, place, distanceKm }] : [];
  }).sort((a, b) => a.distanceKm - b.distanceKm || b.station.health_score - a.station.health_score).slice(0, limit);
}

/** Planning estimate only: adjustable cruise speed plus climb/descent allowance. */
export function journeyFlightSeconds(route: JourneyRoute, cruiseKmh = 850) {
  const speed = Math.max(400, Math.min(1000, Number.isFinite(cruiseKmh) ? cruiseKmh : 850));
  return Math.round((journeyDistance(route) * 1.04 / speed * 60 + 25) * 60);
}
export function journeyFlightLabel(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
export function journeyRouteCountries(route: JourneyRoute) {
  const regions = [route.from.countryCode ? { code: route.from.countryCode, name: route.from.label } : null,
    ...Array.from({ length: 25 }, (_, i) => journeyRegion(journeyPosition(route, i / 24))),
    route.to.countryCode ? { code: route.to.countryCode, name: route.to.label } : null];
  return regions.filter((region, i, all): region is { code: string; name: string } => Boolean(region && /^[A-Z]{2}$/.test(region.code) && all.findIndex(r => r?.code === region.code) === i)).slice(0, 15);
}

export function journeyRadioCandidates(stations: Station[], position: { lat: number; lng: number }, country?: string) {
  return nearbyJourneyStations(stations, position, 800, 60).sort((a, b) =>
    Number(b.station.country_code === country) - Number(a.station.country_code === country)
    || Number(b.station.last_check_ok === true) - Number(a.station.last_check_ok === true)
    || (Date.parse(b.station.last_checked_at) || 0) - (Date.parse(a.station.last_checked_at) || 0)
    || b.station.health_score - a.station.health_score || a.distanceKm - b.distanceKm).slice(0, 8);
}
