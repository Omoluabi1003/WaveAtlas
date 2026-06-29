import { geoAwareFromStation, type GeoAwareLocation } from './geoaware-core';
import { isCuratedStation, logCuratedStationDiagnostic, type Station } from './stations';
import { haversineKm, type GeoFocus } from './geo-focus';
import { geoAwareFromFocus } from './geoaware-core';

export type RankedStationCandidate = { station: Station; distanceKm: number; signalStrength: number; rankScore: number; lat: number; lng: number; geoPrecision: import('./geotruth-resolver').GeoPrecision; geoConfidence: number; geoAwareLocation: GeoAwareLocation };

function metadataQuality(station: Station) {
  return [station.country_code, station.country, station.state || station.city, station.language, station.codec, station.bitrate, station.favicon, station.homepage, station.tags.length].filter(Boolean).length;
}

export function rankNearbyStations(stations: Station[], focus: GeoFocus, limit = 5): RankedStationCandidate[] {
  const resolvedFocus = geoAwareFromFocus(focus);
  const center = resolvedFocus.coordinates;
  return stations
    .filter((station) => {
      const curated = isCuratedStation(station);
      const keep = Boolean(station.url_resolved || station.url) && station.country_code !== 'UN' && (curated || (station.is_active && station.failure_count <= 2));
      if (!keep) logCuratedStationDiagnostic(station, 'excluded from nearby ranking by url/country/health gate', 'rankNearbyStations');
      return keep;
    })
    .map((station) => {
      const geo = geoAwareFromStation(station);
      if (!geo || geo.confidence < 50) return null;
      const distance = haversineKm(center, geo.coordinates);
      const countryMatch = focus.countryCode ? station.country_code === focus.countryCode : true;
      const inRange = focus.mode === 'world' ? countryMatch : distance <= focus.radiusKm;
      if (!inRange) return null;
      const distanceScore = focus.mode === 'world' ? (countryMatch ? 34 : 0) : Math.max(0, 38 * (1 - distance / Math.max(1, focus.radiusKm)));
      const score = (isCuratedStation(station) ? 8 : 0) + distanceScore + Math.min(24, station.health_score * 0.24) + (station.last_check_ok ? 10 : 0) + Math.min(9, station.bitrate / 24) + Math.min(10, station.votes / 2500) + Math.min(5, metadataQuality(station));
      return { station, distanceKm: Math.round(distance), signalStrength: Math.max(1, Math.min(100, Math.round(score))), rankScore: score, lat: geo.coordinates.lat, lng: geo.coordinates.lng, geoPrecision: geo.precision ?? 'unknown', geoConfidence: geo.confidence, geoAwareLocation: geo };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.rankScore - a.rankScore || a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
