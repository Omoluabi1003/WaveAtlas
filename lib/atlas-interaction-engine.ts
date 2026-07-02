import { geoDistance } from "d3-geo";
import type { Station } from "@/lib/stations";
import { invertGlobePoint, projectGlobePoint, type GlobeRotation, type GlobeScreen } from "@/lib/globe-math";
import { resolveStationGeo } from "@/lib/signal-constellations";

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

export type AtlasInteractionDiagnostics = {
  screen: AtlasInteractionScreenPoint;
  resolvedLatLng: AtlasInteractionGeoPoint | null;
  resolvedCountry: { name: string; code: string } | null;
  playableStationsInCountry: number;
  selectedStation: { id: string; name: string; country: string; country_code: string } | null;
  distanceToSelectedStationKm: number | null;
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

export function rankPlayableAtlasStationsInCountry(stations: Station[], tap: AtlasInteractionGeoPoint, country: AtlasInteractionCountry) {
  return stations
    .filter((station) => isPlayableAtlasStation(station) && atlasStationMatchesCountry(station, country))
    .map((station) => {
      const point = stationAtlasPoint(station);
      return { station, point, distanceKm: point ? greatCircleDistanceKm(tap, point) : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || b.station.votes - a.station.votes || b.station.click_count - a.station.click_count);
}

export class AtlasInteractionEngine {
  private candidate: { pointerId: number; x: number; y: number; blocked: boolean } | null = null;
  private dragging = false;

  constructor(private readonly options: { dragThresholdPx?: number; geometryProvider: AtlasInteractionGeometryProvider; countryResolver: AtlasInteractionCountryResolver; stationsProvider: () => Station[] }) {}

  pointerDown(input: { pointerId: number; clientX: number; clientY: number; blockedByOverlay?: boolean }) {
    this.candidate = { pointerId: input.pointerId, x: input.clientX, y: input.clientY, blocked: Boolean(input.blockedByOverlay) };
    this.dragging = false;
  }

  pointerMove(input: { pointerId: number; clientX: number; clientY: number }) {
    if (!this.candidate || this.candidate.pointerId !== input.pointerId) return false;
    const threshold = this.options.dragThresholdPx ?? 8;
    if (Math.hypot(input.clientX - this.candidate.x, input.clientY - this.candidate.y) > threshold) this.dragging = true;
    return this.dragging;
  }

  pointerCancel(pointerId: number) {
    if (this.candidate?.pointerId === pointerId) this.candidate = null;
    this.dragging = false;
  }

  pointerUp(input: { pointerId: number; clientX: number; clientY: number; canvasRect: DOMRect; blockedByOverlay?: boolean }): AtlasInteractionResult {
    const candidate = this.candidate;
    this.candidate = null;
    const screen = { x: input.clientX - input.canvasRect.left, y: input.clientY - input.canvasRect.top };
    const base = (reason: string | null, point: AtlasInteractionGeoPoint | null = null, country: AtlasInteractionCountry | null = null): AtlasInteractionDiagnostics => ({ screen, resolvedLatLng: point, resolvedCountry: country ? { name: country.name, code: country.code } : null, playableStationsInCountry: 0, selectedStation: null, distanceToSelectedStationKm: null, rejectedReason: reason });
    if (!candidate || candidate.pointerId !== input.pointerId) return { kind: "rejected", diagnostics: base("missing-pointer-candidate") };
    if (candidate.blocked || input.blockedByOverlay) return { kind: "rejected", diagnostics: base("overlay") };
    if (this.dragging || Math.hypot(input.clientX - candidate.x, input.clientY - candidate.y) > (this.options.dragThresholdPx ?? 8)) return { kind: "rejected", diagnostics: base("drag-threshold") };
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
    const ranked = rankPlayableAtlasStationsInCountry(this.options.stationsProvider(), point, country);
    const selected = ranked[0];
    const diagnostics: AtlasInteractionDiagnostics = { ...base(selected ? null : "country-only-no-playable-station", point, country), playableStationsInCountry: ranked.length, selectedStation: selected ? { id: selected.station.id, name: selected.station.name, country: selected.station.country, country_code: selected.station.country_code } : null, distanceToSelectedStationKm: selected && Number.isFinite(selected.distanceKm) ? selected.distanceKm : null };
    if (!selected) return { kind: "country", country, diagnostics };
    const event: GlobeDestinationSelectedEvent = { type: "GlobeDestinationSelected", station: selected.station, candidates: ranked.map((item) => item.station), country, distanceKm: selected.distanceKm, diagnostics };
    return { kind: "destination", event, diagnostics };
  }
}
