import { geoDistance } from "d3-geo";
import { decideStation, type AtlasStationDecision } from "@/lib/atlas-intelligence-engine";
import { resolveStationGeo } from "@/lib/signal-constellations";
import type { Station } from "@/lib/stations";

export type GeoSelectionView = "map" | "globe";
export type GeoClickSource = "mouse" | "touch" | "pointer" | "programmatic";

export type NormalizedGeoLocation = {
  lat: number;
  lng: number;
  source: GeoClickSource;
  view: GeoSelectionView;
  timestamp: number;
  precision: "point" | "projected" | "centroid";
  rawEventType: string;
};

export type GeoSelectionContext = {
  view: GeoSelectionView;
  source?: GeoClickSource;
  rawEventType?: string;
  timestamp?: number;
  precision?: NormalizedGeoLocation["precision"];
  maxDistanceKm?: number;
  activeStationKey?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  debug?: boolean;
};

export type GeoSelectionCandidate = {
  station: Station;
  distanceKm: number;
  decision: AtlasStationDecision;
  playable: boolean;
  point: { lat: number; lng: number; source?: string; precision?: string } | null;
};

export type GeoSelectionDecision = {
  selectedStation: Station | null;
  candidateStations: Station[];
  rankedCandidates: GeoSelectionCandidate[];
  location: NormalizedGeoLocation;
  decisionReason: string;
  debug?: Record<string, unknown>;
  fallbackCandidates: Station[];
};

export function geoSelectionStationKey(station: Station) {
  return station.station_uuid || station.id;
}

export function geoDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return geoDistance([a.lng, a.lat], [b.lng, b.lat]) * 6371;
}

export function isGeoSelectionPlayableStation(station: Station) {
  const streamUrl = (station.url_resolved || station.url || "").trim();
  return Boolean(station.is_active && station.last_check_ok !== false && streamUrl && /^https?:\/\//i.test(streamUrl) && station.sourceType !== "geoaudio");
}

function stationPoint(station: Station) {
  const geo = resolveStationGeo(station);
  if (geo.lat === null || geo.lng === null || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return null;
  return { lat: geo.lat, lng: geo.lng, source: geo.source, precision: geo.precision };
}

function inferSource(rawEventType = ""): GeoClickSource {
  if (/touch/i.test(rawEventType)) return "touch";
  if (/pointer/i.test(rawEventType)) return "pointer";
  if (/click|mouse/i.test(rawEventType)) return "mouse";
  return "programmatic";
}

function normalizeLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function normalizeGeoClick(input: { lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown; view: GeoSelectionView; source?: GeoClickSource; timestamp?: number; precision?: NormalizedGeoLocation["precision"]; rawEventType?: string }): NormalizedGeoLocation | null {
  const lat = Number(input.lat ?? input.latitude);
  const lng = Number(input.lng ?? input.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90) return null;
  const rawEventType = input.rawEventType || input.source || "programmatic";
  return { lat, lng: normalizeLng(lng), source: input.source ?? inferSource(rawEventType), view: input.view, timestamp: input.timestamp ?? Date.now(), precision: input.precision ?? "point", rawEventType };
}

function compareCandidates(a: GeoSelectionCandidate, b: GeoSelectionCandidate) {
  if (a.decision.score !== b.decision.score) return b.decision.score - a.decision.score;
  if (a.decision.trustScore !== b.decision.trustScore) return b.decision.trustScore - a.decision.trustScore;
  if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  return b.station.votes - a.station.votes || b.station.click_count - a.station.click_count || geoSelectionStationKey(a.station).localeCompare(geoSelectionStationKey(b.station));
}

export function getGeoSelectionCandidates(location: NormalizedGeoLocation, stations: Station[], context: GeoSelectionContext): GeoSelectionCandidate[] {
  const maxDistanceKm = context.maxDistanceKm ?? 900;
  const countryCode = context.countryCode?.toUpperCase();
  const countryName = context.countryName?.toLowerCase();
  const raw: GeoSelectionCandidate[] = [];
  for (const station of stations) {
    const point = stationPoint(station);
    const distanceKm = point ? geoDistanceKm(location, point) : Number.POSITIVE_INFINITY;
    const inCountry = Boolean(countryCode && station.country_code?.toUpperCase() === countryCode) || Boolean(countryName && station.country?.toLowerCase() === countryName);
    if (!point && !inCountry) continue;
    if (Number.isFinite(distanceKm) && distanceKm > maxDistanceKm && !inCountry) continue;
    const distanceRelevance = Number.isFinite(distanceKm) ? Math.max(0, 100 * (1 - distanceKm / maxDistanceKm)) : inCountry ? 40 : 0;
    const geographicRelevance = Math.max(distanceRelevance, inCountry ? 55 : 0);
    raw.push({ station, distanceKm, point, playable: isGeoSelectionPlayableStation(station), decision: decideStation(station, { kind: "station", geographicRelevance, distanceRelevance, geoConfidence: point?.precision === "station" ? 92 : point ? 70 : 35 }) });
  }
  const playable = raw.filter((item) => item.playable);
  const nonActive = context.activeStationKey ? playable.filter((item) => geoSelectionStationKey(item.station) !== context.activeStationKey) : playable;
  return (nonActive.length ? nonActive : playable).sort(compareCandidates);
}

export function selectStationFromGeoClick(location: NormalizedGeoLocation, stations: Station[], context: GeoSelectionContext): GeoSelectionDecision {
  const rankedCandidates = getGeoSelectionCandidates(location, stations, context);
  const selectedStation = rankedCandidates[0]?.station ?? null;
  return { selectedStation, candidateStations: rankedCandidates.map((item) => item.station), rankedCandidates, location, decisionReason: selectedStation ? "atlas-decision-engine-ranked-geo-click" : "no-playable-geo-candidates", fallbackCandidates: rankedCandidates.slice(1).map((item) => item.station), debug: context.debug && process.env.NODE_ENV !== "production" ? { candidateCount: rankedCandidates.length, view: location.view } : undefined };
}

export function applyGeoSelectionDecision(decision: GeoSelectionDecision, context: { onStationSelect?: (station: Station, candidates: Station[], label?: string) => void; label?: string }) {
  if (!decision.selectedStation) return false;
  context.onStationSelect?.(decision.selectedStation, decision.candidateStations, context.label);
  return true;
}
