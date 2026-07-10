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
  allowCrossBorderFallback?: boolean;
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

let lastAppliedDecision: { stationKey: string; lat: number; lng: number; appliedAt: number } | null = null;

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

function parseCoordinate(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

function normalizeCountryText(value = "") {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeGeoClick(input: { lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown; view: GeoSelectionView; source?: GeoClickSource; timestamp?: number; precision?: NormalizedGeoLocation["precision"]; rawEventType?: string }): NormalizedGeoLocation | null {
  if (!input || typeof input !== "object") return null;
  const lat = parseCoordinate(input.lat ?? input.latitude, -90, 90);
  const rawLng = parseCoordinate(input.lng ?? input.longitude, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
  if (lat === null || rawLng === null) return null;
  const rawEventType = input.rawEventType || input.source || "programmatic";
  return { lat, lng: normalizeLng(rawLng), source: input.source ?? inferSource(rawEventType), view: input.view, timestamp: input.timestamp ?? Date.now(), precision: input.precision ?? "point", rawEventType };
}

function compareCandidates(a: GeoSelectionCandidate, b: GeoSelectionCandidate) {
  if (a.decision.score !== b.decision.score) return b.decision.score - a.decision.score;
  if (a.decision.trustScore !== b.decision.trustScore) return b.decision.trustScore - a.decision.trustScore;
  const aFinite = Number.isFinite(a.distanceKm);
  const bFinite = Number.isFinite(b.distanceKm);
  if (aFinite !== bFinite) return aFinite ? -1 : 1;
  if (aFinite && bFinite && a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  return b.station.votes - a.station.votes || b.station.click_count - a.station.click_count || geoSelectionStationKey(a.station).localeCompare(geoSelectionStationKey(b.station));
}

function removeActiveStation(candidates: GeoSelectionCandidate[], activeStationKey?: string | null) {
  if (!activeStationKey) return candidates;
  const nonActive = candidates.filter((item) => geoSelectionStationKey(item.station) !== activeStationKey);
  return nonActive.length ? nonActive : candidates;
}

export function getGeoSelectionCandidates(location: NormalizedGeoLocation, stations: Station[], context: GeoSelectionContext): GeoSelectionCandidate[] {
  if (!Array.isArray(stations) || !stations.length) return [];
  const maxDistanceKm = context.maxDistanceKm ?? 900;
  const countryCode = context.countryCode?.trim().toUpperCase() || "";
  const countryName = normalizeCountryText(context.countryName ?? "");
  const hasCountryIntent = Boolean(countryCode || countryName);
  const countryCandidates: GeoSelectionCandidate[] = [];
  const nearbyCandidates: GeoSelectionCandidate[] = [];

  for (const station of stations) {
    if (!station || typeof station !== "object") continue;
    const point = stationPoint(station);
    const distanceKm = point ? geoDistanceKm(location, point) : Number.POSITIVE_INFINITY;
    const stationCountryCode = station.country_code?.trim().toUpperCase() || "";
    const stationCountryName = normalizeCountryText(station.country);
    const inCountry = Boolean(countryCode && stationCountryCode === countryCode) || Boolean(countryName && stationCountryName === countryName);
    if (!point && !inCountry) continue;
    if (Number.isFinite(distanceKm) && distanceKm > maxDistanceKm && !inCountry) continue;

    const distanceRelevance = Number.isFinite(distanceKm) ? Math.max(0, 100 * (1 - distanceKm / maxDistanceKm)) : inCountry ? 40 : 0;
    const geographicRelevance = Math.max(distanceRelevance, inCountry ? 55 : 0);
    const candidate = {
      station,
      distanceKm,
      point,
      playable: isGeoSelectionPlayableStation(station),
      decision: decideStation(station, { kind: "station", geographicRelevance, distanceRelevance, geoConfidence: point?.precision === "station" ? 92 : point ? 70 : 35 }),
    } satisfies GeoSelectionCandidate;

    if (!candidate.playable) continue;
    if (inCountry) countryCandidates.push(candidate);
    else nearbyCandidates.push(candidate);
  }

  const scoped = hasCountryIntent
    ? countryCandidates.length
      ? countryCandidates
      : context.allowCrossBorderFallback
        ? nearbyCandidates
        : []
    : nearbyCandidates;

  return removeActiveStation(scoped, context.activeStationKey).sort(compareCandidates);
}

export function selectStationFromGeoClick(location: NormalizedGeoLocation, stations: Station[], context: GeoSelectionContext): GeoSelectionDecision {
  const rankedCandidates = getGeoSelectionCandidates(location, stations, context);
  const selectedStation = rankedCandidates[0]?.station ?? null;
  const hasCountryIntent = Boolean(context.countryCode || context.countryName);
  const decisionReason = selectedStation
    ? hasCountryIntent
      ? "atlas-decision-engine-ranked-country-scoped-geo-click"
      : "atlas-decision-engine-ranked-geo-click"
    : hasCountryIntent
      ? "no-playable-stations-in-resolved-country"
      : "no-playable-geo-candidates";
  return {
    selectedStation,
    candidateStations: rankedCandidates.map((item) => item.station),
    rankedCandidates,
    location,
    decisionReason,
    fallbackCandidates: rankedCandidates.slice(1).map((item) => item.station),
    debug: context.debug && process.env.NODE_ENV !== "production" ? { candidateCount: rankedCandidates.length, view: location.view, countryCode: context.countryCode ?? null, countryName: context.countryName ?? null } : undefined,
  };
}

export function applyGeoSelectionDecision(decision: GeoSelectionDecision, context: { onStationSelect?: (station: Station, candidates: Station[], label?: string) => void; label?: string }) {
  if (!decision.selectedStation || !context.onStationSelect) return false;
  const stationKey = geoSelectionStationKey(decision.selectedStation);
  const now = Date.now();
  const duplicate = lastAppliedDecision
    && lastAppliedDecision.stationKey === stationKey
    && now - lastAppliedDecision.appliedAt < 650
    && geoDistanceKm(lastAppliedDecision, decision.location) < 0.1;
  if (duplicate) return true;
  lastAppliedDecision = { stationKey, lat: decision.location.lat, lng: decision.location.lng, appliedAt: now };
  context.onStationSelect(decision.selectedStation, decision.candidateStations, context.label);
  return true;
}
