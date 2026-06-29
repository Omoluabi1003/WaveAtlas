import { countryAliases, type Station, rankStations, searchCountries } from './stations';
import { countryBounds, isoCountryCentroids, resolveStationGeo } from './geotruth-resolver';
import { haversineKm } from './geo-focus';

export type GlobalGeoPlaceKind = 'city' | 'region' | 'country' | 'territory' | 'island';
export type GlobalGeoPlace = {
  id: string;
  name: string;
  kind: GlobalGeoPlaceKind;
  countryCode: string;
  countryName: string;
  admin1?: string;
  adminCode?: string;
  aliases: string[];
  lat: number;
  lng: number;
  radiusKm: number;
  bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  confidence: number;
  source: 'curated-gazetteer' | 'country-index' | 'nominatim';
};
export type GlobalGeoResolution = { intent: 'geo'; query: string; normalizedQuery: string; place?: GlobalGeoPlace; ambiguous: boolean; disambiguation: GlobalGeoPlace[]; reason?: string };

const normalizePlace = (value = '') => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const city = (name: string, countryCode: string, countryName: string, admin1: string | undefined, lat: number, lng: number, radiusKm: number, aliases: string[] = [], adminCode?: string): GlobalGeoPlace => ({ id: `${countryCode}:${adminCode ?? admin1 ?? 'city'}:${name}`.toLowerCase().replace(/\s+/g, '-'), name, kind: 'city', countryCode, countryName, admin1, adminCode, aliases, lat, lng, radiusKm, confidence: 96, source: 'curated-gazetteer' });
const region = (name: string, countryCode: string, countryName: string, lat: number, lng: number, radiusKm: number, aliases: string[] = [], adminCode?: string): GlobalGeoPlace => ({ id: `${countryCode}:region:${adminCode ?? name}`.toLowerCase().replace(/\s+/g, '-'), name, kind: 'region', countryCode, countryName, admin1: name, adminCode, aliases, lat, lng, radiusKm, confidence: 92, source: 'curated-gazetteer' });

const curatedPlaces: GlobalGeoPlace[] = [
  city('Paris', 'FR', 'France', 'Île-de-France', 48.8566, 2.3522, 65, ['paris france']),
  city('Paris', 'US', 'United States', 'Texas', 33.6609, -95.5555, 45, ['paris texas', 'paris tx'], 'TX'),
  city('Lagos', 'NG', 'Nigeria', 'Lagos', 6.5244, 3.3792, 75, ['lagos nigeria']),
  city('Lagos', 'PT', 'Portugal', 'Faro', 37.1028, -8.6742, 35, ['lagos portugal']),
  city('London', 'GB', 'United Kingdom', 'England', 51.5072, -0.1276, 85, ['london uk', 'london england', 'london united kingdom']),
  city('London', 'CA', 'Canada', 'Ontario', 42.9849, -81.2453, 55, ['london ontario', 'london canada'], 'ON'),
  region('Georgia', 'US', 'United States', 32.1656, -82.9001, 360, ['georgia usa', 'georgia us', 'state of georgia'], 'GA'),
  { id: 'GE:country:georgia', name: 'Georgia', kind: 'country', countryCode: 'GE', countryName: 'Georgia', aliases: ['georgia country', 'sakartvelo'], lat: 42.3154, lng: 43.3569, radiusKm: 260, bbox: countryBounds.GE, confidence: 94, source: 'curated-gazetteer' },
  city('New York', 'US', 'United States', 'New York', 40.7128, -74.006, 80, ['nyc', 'new york city'], 'NY'),
  city('Tokyo', 'JP', 'Japan', 'Tokyo', 35.6762, 139.6503, 90),
  city('Dubai', 'AE', 'United Arab Emirates', 'Dubai', 25.2048, 55.2708, 70, ['dubai uae']),
  city('Ibadan', 'NG', 'Nigeria', 'Oyo', 7.3775, 3.947, 65),
  city('Accra', 'GH', 'Ghana', 'Greater Accra', 5.6037, -0.187, 60),
];

function matchesPlace(place: GlobalGeoPlace, normalized: string) { return [place.name, place.countryName, place.countryCode, place.admin1, place.adminCode, ...place.aliases].filter(Boolean).some((part) => normalizePlace(part) === normalized) || place.aliases.some((alias) => normalizePlace(alias).includes(normalized)); }
function queryHasQualifier(query: string) { const q = normalizePlace(query); return Object.keys(countryAliases).some((alias) => q.includes(normalizePlace(alias))) || /\b[A-Z]{2}\b/.test(query); }
function bboxRadius(bbox?: GlobalGeoPlace['bbox']) { if (!bbox) return undefined; return Math.max(35, haversineKm({ lat: bbox.minLat, lng: bbox.minLng }, { lat: bbox.maxLat, lng: bbox.maxLng }) / 2); }

export async function resolveGlobalGeoQuery(rawQuery: string): Promise<GlobalGeoResolution | null> {
  const query = rawQuery.trim();
  const normalizedQuery = normalizePlace(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return null;
  const country = await searchCountries(query).then((countries) => countries.find((c) => normalizePlace(c.name) === normalizedQuery || c.code.toLowerCase() === normalizedQuery || countryAliases[normalizedQuery] === c.code)).catch(() => undefined);
  if (country) {
    const bbox = countryBounds[country.code];
    const centroid = isoCountryCentroids[country.code] ?? country.centroid;
    return { intent: 'geo', query, normalizedQuery, ambiguous: false, disambiguation: [], place: { id: `${country.code}:country`, name: country.name, kind: 'country', countryCode: country.code, countryName: country.name, aliases: [], lat: centroid.lat, lng: centroid.lng, radiusKm: bboxRadius(bbox) ?? 650, bbox, confidence: 95, source: 'country-index' } };
  }
  const matches = curatedPlaces.filter((place) => matchesPlace(place, normalizedQuery) || normalizePlace(`${place.name} ${place.countryName}`) === normalizedQuery || normalizePlace(`${place.name} ${place.admin1 ?? ''}`) === normalizedQuery);
  if (matches.length > 1 && !queryHasQualifier(query)) return { intent: 'geo', query, normalizedQuery, ambiguous: true, disambiguation: matches, reason: 'Multiple global places match this name; choose the intended geography before station ranking.' };
  if (matches.length) return { intent: 'geo', query, normalizedQuery, ambiguous: false, disambiguation: matches.slice(1), place: matches[0] };
  return null;
}

function inPlace(station: Station, place: GlobalGeoPlace, distance: number) {
  if (station.country_code !== place.countryCode) return false;
  if (place.kind === 'country') return true;
  const admin = normalizePlace(`${station.city ?? ''} ${station.state ?? ''}`);
  if (admin && [place.name, place.admin1, place.adminCode, ...place.aliases].filter(Boolean).some((part) => admin.includes(normalizePlace(part)))) return true;
  return distance <= place.radiusKm;
}

function scopedScore(station: Station, place: GlobalGeoPlace) {
  const geo = resolveStationGeo(station);
  if (geo.lat === null || geo.lng === null) return null;
  const distance = haversineKm({ lat: place.lat, lng: place.lng }, { lat: geo.lat, lng: geo.lng });
  if (!inPlace(station, place, distance)) return null;
  const adminScore = normalizePlace(`${station.city ?? ''} ${station.state ?? ''}`).includes(normalizePlace(place.name)) ? 1_000_000 : station.country_code === place.countryCode ? 700_000 : 0;
  const proximityScore = Math.max(0, 200_000 * (1 - distance / Math.max(place.radiusKm, 1)));
  const qualityScore = (station.is_active ? 40_000 : 0) + (station.last_check_ok ? 20_000 : 0) + Math.min(15_000, station.bitrate * 70) + Math.min(15_000, station.votes * 3);
  return adminScore + proximityScore + qualityScore + geo.confidence * 100;
}

export function rankStationsForResolvedPlace(stations: Station[], place: GlobalGeoPlace, rawQuery = '') {
  const fallbackOrder = new Map(rankStations(stations, rawQuery).map((station, index) => [station.station_uuid || station.id, index]));
  return [...stations]
    .map((station) => ({ station, score: scopedScore(station, place) }))
    .filter((item): item is { station: Station; score: number } => item.score !== null)
    .sort((a, b) => (b.score - a.score) || ((fallbackOrder.get(a.station.station_uuid || a.station.id) ?? 0) - (fallbackOrder.get(b.station.station_uuid || b.station.id) ?? 0)))
    .map((item) => item.station);
}
