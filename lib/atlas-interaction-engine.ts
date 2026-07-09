import { geoDistance } from "d3-geo";
import type { Station } from "@/lib/stations";
import { invertGlobePoint, projectGlobePoint, type GlobeRotation, type GlobeScreen } from "@/lib/globe-math";
import { resolveStationGeo } from "@/lib/signal-constellations";
import { decideStation } from "@/lib/atlas-intelligence-engine";

export type AtlasInteractionCountry = {
  name: string;
  code: string;
  flag: string;
  centroid: { lat: number; lng: number };
  station_count: number;
};

export type AtlasInteractionScreenPoint = { x: number; y: number };
export type AtlasInteractionGeoPoint = { lat: number; lng: number };
export type AtlasInteractionStationPoint = AtlasInteractionGeoPoint & { source?: string; precision?: string };
export type AtlasInteractionGeometry = GlobeScreen & { usableBounds?: { left: number; top: number; right: number; bottom: number } };
export type AtlasInteractionGeometryProvider = () => { geometry: AtlasInteractionGeometry; rotation: GlobeRotation } | null;
export type AtlasInteractionCountryResolver = (point: AtlasInteractionGeoPoint) => AtlasInteractionCountry | null;
export type AtlasInteractionActiveStationKeyProvider = () => string | null | undefined;

export type AtlasInteractionDiagnostics = {
  screen: AtlasInteractionScreenPoint;
  resolvedLatLng: AtlasInteractionGeoPoint | null;
  resolvedCountry: { name: string; code: string } | null;
  playableStationsInCountry: number;
  activeStationKey: string | null;
  excludedActiveStation: boolean;
  candidateCountBeforeExclusion: number;
  candidateCountAfterExclusion: number;
  selectedStation: { id: string; key: string; name: string; country: string; country_code: string } | null;
  distanceToSelectedStationKm: number | null;
  selectedStationDistanceKm: number | null;
  fallbackReason: string | null;
  rejectedReason: string | null;
};

export type GlobeDestinationSelectedEvent = {
  type: "GlobeDestinationSelected";
  station: Station;
  candidates: Station[];
  country: AtlasInteractionCountry;
  distanceKm: number;
  diagnostics: AtlasInteractionDiagnostics;
};

export type AtlasInteractionResult =
  | { kind: "destination"; event: GlobeDestinationSelectedEvent; diagnostics: AtlasInteractionDiagnostics }
  | { kind: "country"; country: AtlasInteractionCountry; diagnostics: AtlasInteractionDiagnostics }
  | { kind: "rejected"; diagnostics: AtlasInteractionDiagnostics };

export function greatCircleDistanceKm(a: AtlasInteractionGeoPoint, b: AtlasInteractionGeoPoint) {
  return geoDistance([a.lng, a.lat], [b.lng, b.lat]) * 6371;
}

export function isPlayableAtlasStation(station: Station) {
  const streamUrl = (station.url_resolved || station.url || "").trim();
  return Boolean(station.is_active && streamUrl && /^https?:\/\//i.test(streamUrl) && station.sourceType !== "geoaudio");
}

export function stationAtlasPoint(station: Station): AtlasInteractionStationPoint | null {
  const geo = resolveStationGeo(station);
  if (geo.lat === null || geo.lng === null || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return null;
  return { lat: geo.lat, lng: geo.lng, source: geo.source, precision: geo.precision };
}

function normalizeCountryText(value = "") {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function atlasStationMatchesCountry(station: Station, country: AtlasInteractionCountry) {
  const stationCode = station.country_code?.trim().toUpperCase();
  if (stationCode && stationCode === country.code.toUpperCase()) return true;
  return normalizeCountryText(station.country) === normalizeCountryText(country.name);
}

export function atlasStationKey(station: Station) {
  return station.station_uuid || station.id;
}

type RankedAtlasStation = { station: Station; point: AtlasInteractionStationPoint | null; distanceKm: number; aieScore: number; trustScore: number };

function compareAtlasStationDecision(a: RankedAtlasStation, b: RankedAtlasStation) {
  if (a.aieScore !== b.aieScore) return b.aieScore - a.aieScore;
  if (a.trustScore !== b.trustScore) return b.trustScore - a.trustScore;
  const aFinite = Number.isFinite(a.distanceKm);
  const bFinite = Number.isFinite(b.distanceKm);
  if (aFinite && bFinite && a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  if (aFinite !== bFinite) return aFinite ? -1 : 1;
  return b.station.votes - a.station.votes || b.station.click_count - a.station.click_count;
}

export function rankPlayableAtlasStationsInCountry(stations: Station[], tap: AtlasInteractionGeoPoint, country: AtlasInteractionCountry, activeStationKey?: string | null) {
  const allCandidates = stations
    .filter((station) => isPlayableAtlasStation(station) && atlasStationMatchesCountry(station, country))
    .map((station) => {
      const point = stationAtlasPoint(station);
      const distanceKm = point ? greatCircleDistanceKm(tap, point) : Number.POSITIVE_INFINITY;
      const geographicRelevance = Number.isFinite(distanceKm) ? Math.max(0, 100 * (1 - distanceKm / 750)) : 25;
      const decision = decideStation(station, { kind: 'beacon', geographicRelevance, distanceRelevance: geographicRelevance, geoConfidence: point?.precision === 'station' ? 90 : 55 });
      return { station, point, distanceKm, aieScore: decision.score, trustScore: decision.trustScore };
    })
    .sort(compareAtlasStationDecision);
  const candidateCountBeforeExclusion = allCandidates.length;
  const nonActiveCandidates = activeStationKey ? allCandidates.filter((item) => atlasStationKey(item.station) !== activeStationKey) : allCandidates;
  const excludedActiveStation = nonActiveCandidates.length < allCandidates.length;
  const ranked = excludedActiveStation && nonActiveCandidates.length > 0 ? nonActiveCandidates : allCandidates;
  const fallbackReason = excludedActiveStation && nonActiveCandidates.length === 0 && allCandidates.length > 0 ? "only-active-station-in-country" : null;
  return { ranked, candidateCountBeforeExclusion, candidateCountAfterExclusion: ranked.length, excludedActiveStation: excludedActiveStation && nonActiveCandidates.length > 0, fallbackReason };
}

export class AtlasInteractionEngine {
  private candidate: { pointerId: number; x: number; y: number; blocked: boolean; dragging: boolean } | null = null;
  private readonly activePointers = new Set<number>();
  private multiTouchBlocked = false;

  constructor(private readonly options: { dragThresholdPx?: number; geometryProvider: AtlasInteractionGeometryProvider; countryResolver: AtlasInteractionCountryResolver; stationsProvider: () => Station[]; activeStationKeyProvider?: AtlasInteractionActiveStationKeyProvider }) {}

  pointerDown(input: { pointerId: number; clientX: number; clientY: number; blockedByOverlay?: boolean }) {
    this.activePointers.add(input.pointerId);
    if (this.activePointers.size > 1 || (this.candidate && this.candidate.pointerId !== input.pointerId)) {
      this.candidate = null;
      this.multiTouchBlocked = true;
      return;
    }
    this.candidate = { pointerId: input.pointerId, x: input.clientX, y: input.clientY, blocked: Boolean(input.blockedByOverlay), dragging: false };
    this.multiTouchBlocked = false;
  }

  pointerMove(input: { pointerId: number; clientX: number; clientY: number }) {
    if (!this.candidate || this.candidate.pointerId !== input.pointerId) return false;
    const threshold = this.options.dragThresholdPx ?? 8;
    if (Math.hypot(input.clientX - this.candidate.x, input.clientY - this.candidate.y) > threshold) this.candidate.dragging = true;
    return this.candidate.dragging;
  }

  pointerCancel(pointerId: number) {
    this.activePointers.delete(pointerId);
    if (this.candidate?.pointerId === pointerId) this.candidate = null;
    if (this.activePointers.size === 0) this.multiTouchBlocked = false;
  }

  pointerUp(input: { pointerId: number; clientX: number; clientY: number; canvasRect: DOMRect; blockedByOverlay?: boolean }): AtlasInteractionResult {
    this.activePointers.delete(input.pointerId);
    const candidate = this.candidate;
    this.candidate = null;
    const screen = { x: input.clientX - input.canvasRect.left, y: input.clientY - input.canvasRect.top };
    const base = (reason: string | null, point: AtlasInteractionGeoPoint | null = null, country: AtlasInteractionCountry | null = null): AtlasInteractionDiagnostics => ({ screen, resolvedLatLng: point, resolvedCountry: country ? { name: country.name, code: country.code } : null, playableStationsInCountry: 0, activeStationKey: this.options.activeStationKeyProvider?.() ?? null, excludedActiveStation: false, candidateCountBeforeExclusion: 0, candidateCountAfterExclusion: 0, selectedStation: null, distanceToSelectedStationKm: null, selectedStationDistanceKm: null, fallbackReason: null, rejectedReason: reason });
    if (this.multiTouchBlocked) { if (this.activePointers.size === 0) this.multiTouchBlocked = false; return { kind: "rejected", diagnostics: base("multi-touch") }; }
    if (!candidate || candidate.pointerId !== input.pointerId) return { kind: "rejected", diagnostics: base("missing-pointer-candidate") };
    if (candidate.blocked || input.blockedByOverlay) return { kind: "rejected", diagnostics: base("overlay") };
    if (candidate.dragging || Math.hypot(input.clientX - candidate.x, input.clientY - candidate.y) > (this.options.dragThresholdPx ?? 8)) return { kind: "rejected", diagnostics: base("drag-threshold") };
    const authoritative = this.options.geometryProvider();
    if (!authoritative) return { kind: "rejected", diagnostics: base("missing-geometry") };
    const { geometry, rotation } = authoritative;
    const bounds = geometry.usableBounds;
    if (bounds && (screen.x < bounds.left || screen.x > bounds.right || screen.y < bounds.top || screen.y > bounds.bottom)) return { kind: "rejected", diagnostics: base("outside-usable-bounds") };
    const point = invertGlobePoint(screen.x, screen.y, rotation, geometry);
    if (!point) return { kind: "rejected", diagnostics: base("outside-globe") };
    const projected = projectGlobePoint(point, rotation, geometry);
    if (projected.z < -0.001) return { kind: "rejected", diagnostics: base("back-facing", point) };
    const country = this.options.countryResolver(point);
    if (!country) return { kind: "rejected", diagnostics: base("no-country", point) };
    const activeStationKey = this.options.activeStationKeyProvider?.() ?? null;
    const { ranked, candidateCountBeforeExclusion, candidateCountAfterExclusion, excludedActiveStation, fallbackReason } = rankPlayableAtlasStationsInCountry(this.options.stationsProvider(), point, country, activeStationKey);
    const selected = ranked[0];
    const selectedDistanceKm = selected && Number.isFinite(selected.distanceKm) ? selected.distanceKm : null;
    const diagnostics: AtlasInteractionDiagnostics = { ...base(selected ? null : "country-only-no-playable-station", point, country), playableStationsInCountry: candidateCountAfterExclusion, activeStationKey, excludedActiveStation, candidateCountBeforeExclusion, candidateCountAfterExclusion, selectedStation: selected ? { id: selected.station.id, key: atlasStationKey(selected.station), name: selected.station.name, country: selected.station.country, country_code: selected.station.country_code } : null, distanceToSelectedStationKm: selectedDistanceKm, selectedStationDistanceKm: selectedDistanceKm, fallbackReason };
    if (!selected) return { kind: "country", country, diagnostics };
    const event: GlobeDestinationSelectedEvent = { type: "GlobeDestinationSelected", station: selected.station, candidates: ranked.map((item) => item.station), country, distanceKm: selected.distanceKm, diagnostics };
    return { kind: "destination", event, diagnostics };
  }
}
