import { type Station, rankStations } from './stations';
import { haversineKm } from './geo-focus';
import { geoAwareFromStation, resolveGeoAwareQuery, stationBelongsToGeoAwareLocation, type GeoAwareLocation, type GeoAwareResolution } from './geoaware-core';

export type GlobalGeoPlaceKind = GeoAwareLocation['kind'];
export type GlobalGeoPlace = GeoAwareLocation;
export type GlobalGeoResolution = GeoAwareResolution;

export async function resolveGlobalGeoQuery(rawQuery: string): Promise<GlobalGeoResolution | null> {
  return resolveGeoAwareQuery(rawQuery);
}

function scopedScore(station: Station, place: GeoAwareLocation) {
  const stationLocation = geoAwareFromStation(station);
  if (!stationLocation) return null;
  const distance = haversineKm(place.coordinates, stationLocation.coordinates);
  if (!stationBelongsToGeoAwareLocation(station, place, distance)) return null;
  const admin = `${station.city ?? ''} ${station.state ?? ''}`.toLowerCase();
  const locationTokens = [place.label, place.city, place.stateProvince, place.stateCode, place.countyRegion, place.locality].filter((part): part is string => Boolean(part)).map((part) => part.toLowerCase());
  const adminScore = locationTokens.some((part) => admin.includes(part)) ? 1_000_000 : station.country_code === place.countryCode ? 700_000 : 0;
  const proximityScore = Math.max(0, 200_000 * (1 - distance / Math.max(place.radiusKm, 1)));
  const qualityScore = (station.is_active ? 40_000 : 0) + (station.last_check_ok ? 20_000 : 0) + Math.min(15_000, station.bitrate * 70) + Math.min(15_000, station.votes * 3);
  return adminScore + proximityScore + qualityScore + stationLocation.confidence * 100;
}

export function rankStationsForResolvedPlace(stations: Station[], place: GeoAwareLocation, rawQuery = '') {
  const fallbackOrder = new Map(rankStations(stations, rawQuery).map((station, index) => [station.station_uuid || station.id, index]));
  return [...stations]
    .map((station) => ({ station, score: scopedScore(station, place) }))
    .filter((item): item is { station: Station; score: number } => item.score !== null)
    .sort((a, b) => (b.score - a.score) || ((fallbackOrder.get(a.station.station_uuid || a.station.id) ?? 0) - (fallbackOrder.get(b.station.station_uuid || b.station.id) ?? 0)))
    .map((item) => item.station);
}
