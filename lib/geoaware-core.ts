import { countryAliases, searchCountries, type Station } from './stations';
import { countryBounds, isoCountryCentroids, resolveStationGeo, type GeoPrecision, type GeoSource } from './geotruth-resolver';
import { haversineKm, type GeoFocus } from './geo-focus';

export type GeoAwareBoundingBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };
export type GeoAwareCoordinates = { lat: number; lng: number };
export type GeoAwareLocationKind = 'world' | 'country' | 'region' | 'county' | 'city' | 'locality' | 'landmark' | 'station';
export type GeoAwareSource = 'geoaware-core' | 'curated-gazetteer' | 'country-index' | 'station-metadata' | GeoSource;

export type GeoAwareLocation = {
  id: string;
  kind: GeoAwareLocationKind;
  label: string;
  hierarchyLabel: string;
  country?: string;
  countryCode?: string;
  iso2?: string;
  iso3?: string;
  stateProvince?: string;
  stateCode?: string;
  countyRegion?: string;
  city?: string;
  locality?: string;
  coordinates: GeoAwareCoordinates;
  boundingBox?: GeoAwareBoundingBox;
  radiusKm: number;
  aliases: string[];
  confidence: number;
  source: GeoAwareSource;
  precision?: GeoPrecision;
  stationIdentity?: { id: string; name: string; brand: string };
  warnings: string[];
};

export type GeoAwareResolution = { intent: 'geo'; query: string; normalizedQuery: string; location?: GeoAwareLocation; ambiguous: boolean; disambiguation: GeoAwareLocation[]; reason?: string };

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const normalize = (value = '') => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const dedupe = (values: Array<string | undefined>) => [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))];
const bboxRadius = (bbox?: GeoAwareBoundingBox) => bbox ? Math.max(35, haversineKm({ lat: bbox.minLat, lng: bbox.minLng }, { lat: bbox.maxLat, lng: bbox.maxLng }) / 2) : undefined;
const hierarchy = (parts: Array<string | undefined>) => dedupe(parts).join(', ');

function location(input: Omit<GeoAwareLocation, 'hierarchyLabel' | 'iso2' | 'warnings'> & { hierarchy?: Array<string | undefined>; warnings?: string[] }): GeoAwareLocation {
  const iso2 = input.countryCode?.toUpperCase();
  return { ...input, iso2, hierarchyLabel: hierarchy(input.hierarchy ?? [input.locality, input.city, input.countyRegion, input.stateProvince, input.country]), warnings: input.warnings ?? [] };
}

const curatedLocations: GeoAwareLocation[] = [
  location({ id: 'FR:city:paris', kind: 'city', label: 'Paris', city: 'Paris', stateProvince: 'Île-de-France', country: 'France', countryCode: 'FR', coordinates: { lat: 48.8566, lng: 2.3522 }, radiusKm: 65, aliases: ['paris france', 'parís', '巴黎'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'US:TX:city:paris', kind: 'city', label: 'Paris', city: 'Paris', stateProvince: 'Texas', stateCode: 'TX', country: 'United States', countryCode: 'US', coordinates: { lat: 33.6609, lng: -95.5555 }, radiusKm: 45, aliases: ['paris texas', 'paris tx'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'NG:city:lagos', kind: 'city', label: 'Lagos', city: 'Lagos', stateProvince: 'Lagos', country: 'Nigeria', countryCode: 'NG', coordinates: { lat: 6.5244, lng: 3.3792 }, radiusKm: 75, aliases: ['lagos nigeria', 'eko'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'PT:city:lagos', kind: 'city', label: 'Lagos', city: 'Lagos', stateProvince: 'Faro', country: 'Portugal', countryCode: 'PT', coordinates: { lat: 37.1028, lng: -8.6742 }, radiusKm: 35, aliases: ['lagos portugal'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'GB:city:london', kind: 'city', label: 'London', city: 'London', stateProvince: 'England', country: 'United Kingdom', countryCode: 'GB', coordinates: { lat: 51.5072, lng: -0.1276 }, radiusKm: 85, aliases: ['london uk', 'london england', 'londres'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'CA:ON:city:london', kind: 'city', label: 'London', city: 'London', stateProvince: 'Ontario', stateCode: 'ON', country: 'Canada', countryCode: 'CA', coordinates: { lat: 42.9849, lng: -81.2453 }, radiusKm: 55, aliases: ['london ontario', 'london canada'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'US:GA:region:georgia', kind: 'region', label: 'Georgia', stateProvince: 'Georgia', stateCode: 'GA', country: 'United States', countryCode: 'US', coordinates: { lat: 32.1656, lng: -82.9001 }, radiusKm: 360, aliases: ['georgia usa', 'georgia us', 'state of georgia'], confidence: 92, source: 'curated-gazetteer' }),
  location({ id: 'GE:country:georgia', kind: 'country', label: 'Georgia', country: 'Georgia', countryCode: 'GE', coordinates: { lat: 42.3154, lng: 43.3569 }, boundingBox: countryBounds.GE, radiusKm: bboxRadius(countryBounds.GE) ?? 260, aliases: ['georgia country', 'sakartvelo', 'საქართველო'], confidence: 94, source: 'curated-gazetteer' }),
  location({ id: 'US:NY:city:new-york', kind: 'city', label: 'New York', city: 'New York', stateProvince: 'New York', stateCode: 'NY', country: 'United States', countryCode: 'US', coordinates: { lat: 40.7128, lng: -74.006 }, radiusKm: 80, aliases: ['nyc', 'new york city'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'JP:city:tokyo', kind: 'city', label: 'Tokyo', city: 'Tokyo', stateProvince: 'Tokyo', country: 'Japan', countryCode: 'JP', coordinates: { lat: 35.6762, lng: 139.6503 }, radiusKm: 90, aliases: ['東京', 'tokio'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'AE:city:dubai', kind: 'city', label: 'Dubai', city: 'Dubai', stateProvince: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', coordinates: { lat: 25.2048, lng: 55.2708 }, radiusKm: 70, aliases: ['dubai uae', 'دبي'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'NG:city:ibadan', kind: 'city', label: 'Ibadan', city: 'Ibadan', stateProvince: 'Oyo', country: 'Nigeria', countryCode: 'NG', coordinates: { lat: 7.3775, lng: 3.947 }, radiusKm: 65, aliases: ['ìbàdàn'], confidence: 96, source: 'curated-gazetteer' }),
  location({ id: 'GH:city:accra', kind: 'city', label: 'Accra', city: 'Accra', stateProvince: 'Greater Accra', country: 'Ghana', countryCode: 'GH', coordinates: { lat: 5.6037, lng: -0.187 }, radiusKm: 60, aliases: ['akra'], confidence: 96, source: 'curated-gazetteer' }),
];

function matches(loc: GeoAwareLocation, q: string) { return [loc.label, loc.country, loc.countryCode, loc.stateProvince, loc.stateCode, loc.countyRegion, loc.city, loc.locality, ...loc.aliases].filter(Boolean).some((part) => normalize(part) === q) || loc.aliases.some((alias) => normalize(alias).includes(q)); }
function hasQualifier(query: string) { const q = normalize(query); return Object.keys(countryAliases).some((alias) => q.includes(normalize(alias))) || /\b[A-Z]{2}\b/.test(query); }

export async function resolveGeoAwareQuery(rawQuery: string): Promise<GeoAwareResolution | null> {
  const query = rawQuery.trim();
  const normalizedQuery = normalize(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return null;
  const country = await searchCountries(query).then((countries) => countries.find((c) => normalize(c.name) === normalizedQuery || c.code.toLowerCase() === normalizedQuery || countryAliases[normalizedQuery] === c.code)).catch(() => undefined);
  if (country) {
    const bbox = countryBounds[country.code];
    const centroid = isoCountryCentroids[country.code] ?? country.centroid;
    return { intent: 'geo', query, normalizedQuery, ambiguous: false, disambiguation: [], location: location({ id: `${country.code}:country`, kind: 'country', label: country.name, country: country.name, countryCode: country.code, coordinates: centroid, boundingBox: bbox, radiusKm: bboxRadius(bbox) ?? 650, aliases: dedupe([countryAliases[normalizedQuery] === country.code ? query : undefined, country.code]), confidence: 95, source: 'country-index' }) };
  }
  const found = curatedLocations.filter((loc) => matches(loc, normalizedQuery) || normalize(`${loc.label} ${loc.country ?? ''}`) === normalizedQuery || normalize(`${loc.label} ${loc.stateProvince ?? ''}`) === normalizedQuery);
  if (found.length > 1 && !hasQualifier(query)) return { intent: 'geo', query, normalizedQuery, ambiguous: true, disambiguation: found, reason: 'Multiple global places match this name; choose the intended geography before station ranking.' };
  if (found.length) return { intent: 'geo', query, normalizedQuery, ambiguous: false, disambiguation: found.slice(1), location: found[0] };
  return null;
}

export function geoAwareFromFocus(focus: GeoFocus): GeoAwareLocation {
  const country = focus.countryName ?? (focus.countryCode ? countryNames.of(focus.countryCode) ?? focus.countryCode : undefined);
  return location({ id: focus.countryCode ? `${focus.countryCode}:${focus.mode}` : `point:${focus.lat.toFixed(4)}:${focus.lng.toFixed(4)}`, kind: focus.mode === 'world' ? 'world' : focus.mode === 'country' ? 'country' : 'locality', label: focus.label, country, countryCode: focus.countryCode, coordinates: { lat: focus.lat, lng: focus.lng }, boundingBox: focus.countryCode ? countryBounds[focus.countryCode] : undefined, radiusKm: focus.radiusKm, aliases: dedupe([focus.label, country]), confidence: focus.countryCode ? 78 : 55, source: 'geoaware-core' });
}

export function geoAwareFromStation(station: Station): GeoAwareLocation | null {
  const geo = resolveStationGeo(station);
  if (geo.lat === null || geo.lng === null) return null;
  const country = station.country || (station.country_code ? countryNames.of(station.country_code) ?? station.country_code : undefined);
  return location({ id: `station:${station.station_uuid || station.id}`, kind: geo.precision === 'country' ? 'country' : geo.precision === 'city' ? 'city' : 'station', label: station.city || station.state || country || station.name, city: geo.precision === 'country' ? undefined : station.city || undefined, stateProvince: station.state || undefined, country, countryCode: station.country_code || undefined, coordinates: { lat: geo.lat, lng: geo.lng }, boundingBox: station.country_code ? countryBounds[station.country_code] : undefined, radiusKm: geo.precision === 'station' ? 18 : geo.precision === 'city' ? 65 : 650, aliases: dedupe([station.city, station.state, station.country, station.country_code]), confidence: geo.confidence, source: geo.source, precision: geo.precision, stationIdentity: { id: station.station_uuid || station.id, name: station.name, brand: station.name }, warnings: geo.warning ? [geo.warning] : [] });
}

export function stationBelongsToGeoAwareLocation(station: Station, loc: GeoAwareLocation, distanceKm: number) {
  if (loc.countryCode && station.country_code !== loc.countryCode) return false;
  if (loc.kind === 'country' || loc.kind === 'world') return true;
  const admin = normalize(`${station.city ?? ''} ${station.state ?? ''}`);
  const tokens = [loc.label, loc.city, loc.stateProvince, loc.stateCode, loc.countyRegion, loc.locality, ...loc.aliases].filter(Boolean);
  return Boolean(admin && tokens.some((part) => admin.includes(normalize(part)))) || distanceKm <= loc.radiusKm;
}
