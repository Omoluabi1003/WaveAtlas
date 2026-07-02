import { coordinateMatchesStationCountry, resolveStationGeo, type GeoPrecision } from '@/lib/geotruth-resolver';
import { atlasStationKey, isPlayableAtlasStation } from '@/lib/atlas-interaction-engine';
import type { Station } from '@/lib/stations';

export type StationGeoTruthHealthStation = { key: string; name: string; country: string; country_code: string; lat: number | null; lng: number | null; precision: GeoPrecision; source: string; warning: string | null };
export type StationGeoTruthCountryHealth = { country: string; country_code: string; playableStations: number; stationLevel: number; cityLevel: number; countryCentroid: number; missingCoordinates: number; preciseCoordinates: number };
export type StationGeoTruthDuplicateCoordinate = { lat: number; lng: number; stationCount: number; stations: StationGeoTruthHealthStation[] };
export type StationGeoTruthHealthReport = {
  totalStations: number;
  playableStations: number;
  playableStationsByCountry: StationGeoTruthCountryHealth[];
  coordinatePrecisionCounts: Record<GeoPrecision, number>;
  countriesWithPlayableStationsButNoPreciseCoordinates: StationGeoTruthCountryHealth[];
  duplicatedCoordinates: StationGeoTruthDuplicateCoordinate[];
  stationsOutsideDeclaredCountry: StationGeoTruthHealthStation[];
};

function countryKey(station: Station) {
  return (station.country_code || station.country || 'UN').trim().toUpperCase();
}

function stationSummary(station: Station): StationGeoTruthHealthStation {
  const geo = resolveStationGeo(station);
  return { key: atlasStationKey(station), name: station.name, country: station.country, country_code: station.country_code, lat: geo.lat, lng: geo.lng, precision: geo.precision, source: geo.source, warning: geo.warning };
}

function coordinateKey(lat: number, lng: number) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function buildStationGeoTruthHealthReport(stations: Station[], duplicateCoordinateThreshold = 5): StationGeoTruthHealthReport {
  const countries = new Map<string, StationGeoTruthCountryHealth>();
  const duplicateBuckets = new Map<string, StationGeoTruthHealthStation[]>();
  const coordinatePrecisionCounts: Record<GeoPrecision, number> = { station: 0, city: 0, country: 0, unknown: 0 };
  const stationsOutsideDeclaredCountry: StationGeoTruthHealthStation[] = [];
  let playableStations = 0;

  for (const station of stations) {
    const playable = isPlayableAtlasStation(station);
    const summary = stationSummary(station);
    coordinatePrecisionCounts[summary.precision] += 1;

    if (summary.lat !== null && summary.lng !== null) {
      const bucketKey = coordinateKey(summary.lat, summary.lng);
      duplicateBuckets.set(bucketKey, [...(duplicateBuckets.get(bucketKey) ?? []), summary]);
    }

    if (typeof station.latitude === 'number' && typeof station.longitude === 'number' && Number.isFinite(station.latitude) && Number.isFinite(station.longitude) && !coordinateMatchesStationCountry(station.latitude, station.longitude, station.country_code)) {
      stationsOutsideDeclaredCountry.push(summary);
    }

    if (!playable) continue;
    playableStations += 1;
    const key = countryKey(station);
    const row = countries.get(key) ?? { country: station.country || key, country_code: station.country_code || key, playableStations: 0, stationLevel: 0, cityLevel: 0, countryCentroid: 0, missingCoordinates: 0, preciseCoordinates: 0 };
    row.playableStations += 1;
    if (summary.precision === 'station') row.stationLevel += 1;
    if (summary.precision === 'city') row.cityLevel += 1;
    if (summary.precision === 'country') row.countryCentroid += 1;
    if (summary.precision === 'unknown') row.missingCoordinates += 1;
    if (summary.precision === 'station' || summary.precision === 'city') row.preciseCoordinates += 1;
    countries.set(key, row);
  }

  const playableStationsByCountry = [...countries.values()].sort((a, b) => b.playableStations - a.playableStations || a.country.localeCompare(b.country));
  const duplicatedCoordinates = [...duplicateBuckets.entries()]
    .map(([key, bucket]) => {
      const [lat, lng] = key.split(',').map(Number);
      return { lat, lng, stationCount: bucket.length, stations: bucket };
    })
    .filter((bucket) => bucket.stationCount >= duplicateCoordinateThreshold)
    .sort((a, b) => b.stationCount - a.stationCount);

  return {
    totalStations: stations.length,
    playableStations,
    playableStationsByCountry,
    coordinatePrecisionCounts,
    countriesWithPlayableStationsButNoPreciseCoordinates: playableStationsByCountry.filter((country) => country.playableStations > 0 && country.preciseCoordinates === 0),
    duplicatedCoordinates,
    stationsOutsideDeclaredCountry,
  };
}

export function logStationGeoTruthHealthReport(stations: Station[]) {
  const report = buildStationGeoTruthHealthReport(stations);
  if (process.env.NODE_ENV !== 'production') console.info('[WaveAtlas geotruth health]', report);
  return report;
}
