"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import dynamic from "next/dynamic";
import Image from "next/image";
import NextLink from "next/link";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Compass,
  Gauge,
  Globe2,
  Heart,
  Languages,
  MapPin,
  Pause,
  Play,
  Radio,
  Plane,
  Search,
  Link,
  Signal,
  Trophy,
  Layers,
  Settings,
  Newspaper,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { isoCountryCentroids, resolveStationGeo, type ResolvedStationGeo } from "@/lib/geotruth-resolver";
import { BRAND, WAVEATLAS_LOGO_PATH } from "@/lib/branding";
import { useMapCameraController } from "@/hooks/useMapCameraController";
import { useIOSVisualViewport } from "@/hooks/useIOSVisualViewport";
import { countryAliases, flagFor, isCuratedStation, isVerifiedNigerianStation, type Station } from "@/lib/stations";
import { ArrivalCard } from "@/components/arrival-card";
import { PlaceHero } from "@/components/PlaceHero";
import { NewspaperBrief } from "@/components/NewspaperBrief";
import { RadioDNA } from "@/components/RadioDNA";
import { WorldContextPanel } from "@/components/WorldContextPanel";
import type { WorldContext } from "@/lib/world-engine/types";

const BlueMarbleGlobe = dynamic(() => import("@/components/BlueMarbleGlobe"), {
  ssr: false,
  loading: () => (
    <div className="relative h-full min-h-[100dvh] w-full overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(0,214,143,.14),transparent_24%),linear-gradient(135deg,#020617,#07111f_48%,#031713)] shadow-2xl">
      <div className="absolute left-1/2 top-1/2 size-[min(58vw,58vh)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/20 bg-slate-950/60 shadow-[0_0_90px_rgba(0,214,143,.18)]" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950/65 px-5 py-3 text-sm font-medium text-ivory shadow-2xl backdrop-blur-xl">Preparing Audio Tourism globe…</div>
    </div>
  ),
});
import { getAmbientTheme } from "@/lib/world-engine/ambient-theme";
import { buildAtmosphereLine, buildPlaceDescriptor, buildPlaceLabel } from "@/lib/world-engine/place-labels";
import { createArrivalDestination, type ArrivalDestination } from "@/lib/discovery/arrival-engine";
import { destinationLabel, persistArrival, readArrivalHistory, stationGenre } from "@/lib/discovery/history";
import { pickFallbackStation } from "@/lib/discovery/station-picker";
import { FAST_CONNECT_COPY, FAST_CONNECT_PARALLEL_CANDIDATES, buildFastConnectQueue, getAdaptiveBufferPolicy, getStationStreamUrl, markStationFailure, markStationSuccess, nextFastConnectCandidate, stationKey, type SignalFailureType } from "@/lib/fast-connect-engine";
import { localTimeForStation, stationTimeCopy, teleportCopy } from "@/lib/smart-time-copy";

type CountryResult = {
  name: string;
  code: string;
  flag: string;
  centroid: { lat: number; lng: number };
  station_count: number;
};

type GeoPoint = ResolvedStationGeo & { label: string; tone: "green-gold" | "blue-gold" | "radio-gold" };
type PlaybackStatus =
  | "idle"
  | "buffering"
  | "playing"
  | "paused"
  | "blocked"
  | "failed";
type StationSelectionSource = "manual" | "startup" | "teleport" | "fallback" | "wanderer" | "deeplink" | "auto";

type PlayerState = {
  current?: Station;
  stationSelectionSource: StationSelectionSource;
  playing: boolean;
  status: PlaybackStatus;
  volume: number;
  error?: string;
  userActivated: boolean;
  arrivalStation?: Station;
  startupQueue: Station[];
  replacementReason?: string;
  teleportQueue: Station[];
  setTeleportQueue: (stations: Station[]) => void;
  clearArrivalContext: () => void;
  setArrivalStation: (station: Station, queue?: Station[]) => void;
  replaceStartupStation: (previous: Station, next: Station, reason: string) => void;
  setStation: (s: Station, source?: StationSelectionSource) => void;
  prepareStation: (s: Station, source?: StationSelectionSource) => void;
  toggle: () => void;
  setVolume: (n: number) => void;
  setStatus: (s: PlaybackStatus, error?: string) => void;
};

const usePlayer = create<PlayerState>((set) => ({
  playing: false,
  status: "idle",
  stationSelectionSource: "startup",
  volume: 1,
  userActivated: false,
  startupQueue: [],
  teleportQueue: [],
  setTeleportQueue: (teleportQueue) => set({ teleportQueue }),
  clearArrivalContext: () => set({ arrivalStation: undefined, startupQueue: [], replacementReason: undefined }),
  setArrivalStation: (station, queue = [station]) => set({ arrivalStation: station, startupQueue: queue.length ? queue : [station], replacementReason: undefined }),
  replaceStartupStation: (previous, next, reason) => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("waveatlas:startup-station-replaced", { detail: { previousStation: previous, nextStation: next, reason } }));
    set((state) => ({
      arrivalStation: next,
      current: state.current && stationKey(state.current) === stationKey(previous) ? next : state.current,
      startupQueue: [next, ...state.startupQueue.filter((station) => stationKey(station) !== stationKey(next) && stationKey(station) !== stationKey(previous))],
      replacementReason: reason,
    }));
  },
  setStation: (current, stationSelectionSource = "manual") =>
    set({
      current,
      stationSelectionSource,
      playing: false,
      status: "buffering",
      error: undefined,
      userActivated: true,
      teleportQueue: [],
    }),
  prepareStation: (current, stationSelectionSource = "startup") =>
    set((state) => ({
      current,
      stationSelectionSource,
      startupQueue: state.arrivalStation && stationKey(state.arrivalStation) === stationKey(current) ? [current, ...state.startupQueue.filter((station) => stationKey(station) !== stationKey(current))] : state.startupQueue,
      playing: false,
      status: state.userActivated ? "buffering" : "idle",
      error: undefined,
    })),
  toggle: () =>
    set((s) => {
      if (!s.current) return s;
      return s.playing
        ? { playing: false, status: "paused", error: undefined }
        : {
            playing: false,
            status: "buffering",
            error: undefined,
            userActivated: true,
          };
    }),
  setVolume: (volume) => set({ volume }),
  setStatus: (status, error) =>
    set({ status, error, playing: status === "playing" }),
}));

function stationTone(countryCode?: string): GeoPoint["tone"] {
  return countryCode === "NG" || countryCode === "GH" || countryCode === "ZA" ? "green-gold" : countryCode === "AE" || countryCode === "SG" ? "blue-gold" : "radio-gold";
}

function geotruth(station: Station): GeoPoint {
  const resolved = resolveStationGeo(station);
  return { ...resolved, label: station.state || station.city || station.country || "Unknown location", tone: stationTone(station.country_code) };
}

const countryFallbacks: Record<string, { lat: number; lng: number; tone: GeoPoint["tone"] }> = Object.fromEntries(
  Object.entries(isoCountryCentroids).map(([code, point]) => [code, { ...point, tone: stationTone(code) }]),
);

function teleportDebugEnabled() {
  return typeof window !== "undefined" && process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_TELEPORT === "true";
}

function debugTeleport(label: string, payload: Record<string, unknown>) {
  if (!teleportDebugEnabled()) return;
  console.debug(`[WaveAtlas Teleport] ${label}`, payload);
}

function debugPlayback(label: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_PLAYBACK !== "true") return;
  console.debug(`[WaveAtlas Playback] ${label}`, payload);
}

function debugCountryClick(label: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
  console.debug(`[WaveAtlas Country Click] ${label}`, payload);
}


let stationSelectionVersion = 0;
let teleportPoolCache: { anchorKey: string; stations: Station[]; expires: number } | null = null;
let activeTeleportController: AbortController | null = null;
const TELEPORT_POOL_TTL_MS = 45_000;

function warnIfStationGeoConflicts(station: Station, geo: GeoPoint) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
  if (geo.lat === null || geo.lng === null || !station.country_code) return;
  const centroid = isoCountryCentroids[station.country_code];
  if (!centroid) return;
  const distance = haversineKm({ lat: geo.lat, lng: geo.lng }, centroid);
  if (distance > 2_500 && geo.precision === "station") {
    console.warn("[WaveAtlas GeoTruth] Station coordinates are far from country metadata; keeping station country metadata for labels.", {
      station: station.name,
      country: station.country,
      countryCode: station.country_code,
      coordinates: { lat: geo.lat, lng: geo.lng },
      countryCentroid: centroid,
      distanceKm: Math.round(distance),
    });
  }
}

function setCurrentStationAndDestination(station: Station, source: StationSelectionSource = "manual", queue: Station[] = []) {
  const version = ++stationSelectionVersion;
  warnIfStationGeoConflicts(station, geotruth(station));
  const player = usePlayer.getState();
  player.setStation(station, source);
  if (queue.length) player.setTeleportQueue(queue.filter((candidate) => stationKey(candidate) !== stationKey(station)));
  return version;
}

function isCurrentStationSelection(version: number) {
  return version === stationSelectionVersion;
}

function readHasCompletedArrival() {
  return typeof window !== "undefined" && window.sessionStorage.getItem(ARRIVAL_COMPLETED_SESSION_KEY) === "true";
}

function markArrivalCompleted() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ARRIVAL_COMPLETED_SESSION_KEY, "true");
  window.dispatchEvent(new Event(ARRIVAL_COMPLETED_EVENT));
}

function commitTeleportStation(station: Station, queue: Station[] = []) {
  setCurrentStationAndDestination(station, "teleport", queue);
}


const neighboringCountries: Record<string, string[]> = {
  NG: ["Ghana", "Benin", "Cameroon", "Niger", "Togo"],
  GH: ["Nigeria", "Togo", "Côte d’Ivoire", "Benin", "Cameroon"],
  AE: ["Saudi Arabia", "Qatar", "Oman", "Bahrain", "Kuwait"],
  FR: ["United Kingdom", "Germany", "Spain", "Italy", "Belgium"],
  GB: ["Ireland", "France", "Netherlands", "Belgium", "Germany"],
  US: ["Canada", "Mexico", "Bahamas", "Cuba", "Dominican Republic"],
  BR: ["Argentina", "Uruguay", "Paraguay", "Bolivia", "Peru"],
  ZA: ["Namibia", "Botswana", "Zimbabwe", "Mozambique", "Lesotho"],
  JP: ["South Korea", "Taiwan", "China", "Philippines", "Russia"],
};

function localTimeFor(lng: number | null) { if (lng === null) return "Unknown local time"; const offset = Math.round(lng / 15); return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.now() + offset * 3600_000)); }
function estimatedTemperature(geo: GeoPoint) { return geo.lat === null || geo.lng === null ? 72 : Math.round(72 - Math.abs(geo.lat) * 0.28 + ((geo.lng + 180) % 11)); }

function getPrimaryGenre(station: Station) {
  return stationGenre(station);
}

function getStreamHealth(station: Station) {
  if (!station.is_active || station.failure_count > 2 || station.health_score < 35)
    return { label: "Offline", tone: "text-red-200", dot: "bg-red-400" };
  if (station.health_score >= 85)
    return { label: "Excellent", tone: "text-emerald-200", dot: "bg-radio" };
  if (station.health_score >= 65)
    return { label: "Good", tone: "text-sky-200", dot: "bg-sky" };
  if (station.health_score > 0)
    return { label: "Weak", tone: "text-amber-200", dot: "bg-gold" };
  return { label: "Unknown", tone: "text-slate-200", dot: "bg-slate-400" };
}

function getTrendingRank(station: Station, stations: Station[]) {
  const ranked = [...stations].sort(
    (a, b) => b.click_count + b.votes * 2 - (a.click_count + a.votes * 2),
  );
  const rank = ranked.findIndex((s) => s.id === station.id);
  return rank >= 0 && rank < 100 ? `#${rank + 1} trending` : "Not ranked";
}

function StationMetricCard({
  icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  onClick?: () => void;
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      onClick={onClick}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-gold/40 hover:bg-white/[0.07]"
    >
      <div className="flex items-center gap-2 text-gold">{icon}</div>
      <p className="mt-3 text-xs font-medium opacity-75 text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
      {detail ? <p className="mt-1 text-xs text-ivory/50">{detail}</p> : null}
    </Component>
  );
}

function StreamHealthBadge({ station }: { station: Station }) {
  const health = getStreamHealth(station);
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium ${health.tone}`}>
      <span className={`size-2 rounded-full ${health.dot}`} />
      {health.label}
    </span>
  );
}

function readFavoriteStationIds() {
  const raw = window.localStorage.getItem("waveatlas:favorites");
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function SaveStationButton({ station }: { station: Station }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    window.queueMicrotask(() => {
      setSaved(readFavoriteStationIds().includes(station.station_uuid || station.id));
    });
  }, [station.id, station.station_uuid]);
  const toggleSave = () => {
    const key = station.station_uuid || station.id;
    const favorites = readFavoriteStationIds();
    const next = favorites.includes(key)
      ? favorites.filter((id) => id !== key)
      : [...favorites, key];
    try { window.localStorage.setItem("waveatlas:favorites", JSON.stringify(next)); } catch { /* Favorites are optional when storage is unavailable. */ }
    setSaved(next.includes(key));
  };
  return (
    <button onClick={toggleSave} className="rounded-full border border-white/10 px-4 py-2 text-sm transition hover:bg-white/[0.08]">
      <Heart className={`mr-2 inline size-4 ${saved ? "fill-radio text-radio" : ""}`} />
      {saved ? "Saved" : "Save destination"}
    </button>
  );
}

function ShareStationButton({ station }: { station: Station }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const stationUuid = station.station_uuid;
    if (!stationUuid) return;
    const url = `${window.location.origin}?station=${encodeURIComponent(stationUuid)}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={share} className="rounded-full border border-white/10 px-4 py-2 text-sm transition hover:bg-white/[0.08]">
      {copied ? <Check className="mr-2 inline size-4 text-radio" /> : <Link className="mr-2 inline size-4" />}
      {copied ? "Destination link copied" : "Share destination"}
    </button>
  );
}

function MiniCountryMapCard({ station }: { station: Station }) {
  const geo = useMemo(() => geotruth(station), [station]);
  return (
    <button
      onClick={() => document.getElementById("atlas-map")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-0 text-left transition hover:border-sky/50 hover:bg-white/[0.07] sm:col-span-2"
    >
      <div className="relative h-28 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,.25),transparent_18%),radial-gradient(circle_at_30%_45%,rgba(214,168,79,.2),transparent_20%),linear-gradient(135deg,rgba(15,23,42,.95),rgba(8,47,73,.55))]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[size:22px_22px]" />
        <span className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-radio shadow-[0_0_0_10px_rgba(88,225,132,.16),0_0_30px_rgba(88,225,132,.8)]" />
      </div>
      <div className="p-4">
        <p className="text-xs font-medium opacity-75 text-slate-400">Country map</p>
        <p className="mt-2 text-sm font-semibold text-slate-100">{station.country}</p>
        <p className="mt-1 text-xs text-ivory/50">{geo.lat === null || geo.lng === null ? "GeoTruth pending" : `Fly to ${geo.lat.toFixed(2)}, ${geo.lng.toFixed(2)}`}</p>
      </div>
    </button>
  );
}

function SimilarStationsList({ station, stations }: { station: Station; stations: Station[] }) {
  const similar = stations.filter((s) => s.id !== station.id && (s.country_code === station.country_code || s.language === station.language || s.tags.some((tag) => station.tags.includes(tag)))).slice(0, 5);
  return <ListCard title="Nearby echoes" items={similar.map((s) => ({ key: s.id, label: s.name, meta: `${s.country} · ${getPrimaryGenre(s)}`, action: () => setCurrentStationAndDestination(s) }))} />;
}

function NearbyCountriesList({ station, setQuery }: { station: Station; setQuery: (q: string) => void }) {
  const countries = (neighboringCountries[station.country_code] || Object.keys(countryFallbacks).map((code) => code)).slice(0, 5);
  return <ListCard title="Nearby countries" items={countries.map((country) => ({ key: country, label: country, meta: "Open active stations", action: () => setQuery(country) }))} />;
}

function ListCard({ title, items }: { title: string; items: { key: string; label: string; meta: string; action: () => void }[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-medium opacity-75 text-slate-400">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          <button key={item.key} onClick={item.action} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left transition hover:border-gold/40 hover:bg-white/[0.07]">
            <span><b className="block truncate text-sm text-ivory">{item.label}</b><span className="text-xs text-ivory/50">{item.meta}</span></span>
            <MapPin className="size-4 shrink-0 text-gold" />
          </button>
        )) : <p className="text-sm text-ivory/50">No live matches yet.</p>}
      </div>
    </div>
  );
}


function useStationWorldContext(station: Station) {
  const geo = useMemo(() => geotruth(station), [station]);
  const [worldContext, setWorldContext] = useState<WorldContext | null>(null);
  const [worldContextStatus, setWorldContextStatus] = useState<"loading" | "ready" | "empty">("loading");
  const [worldContextStationKey, setWorldContextStationKey] = useState("");
  const stationWorldKey = `${stationKey(station)}:${geo.lat ?? ""}:${geo.lng ?? ""}`;
  const visibleWorldContext = worldContextStationKey === stationWorldKey ? worldContext : null;
  const visibleWorldContextStatus = worldContextStationKey === stationWorldKey ? worldContextStatus : "loading";

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("stationName", station.name);
    if (station.city) params.set("city", station.city);
    if (station.state) params.set("state", station.state);
    if (station.country) params.set("country", station.country);
    if (station.country_code) params.set("countryCode", station.country_code);
    if (station.language) params.set("language", station.language);
    if (geo.lat !== null) params.set("lat", String(geo.lat));
    if (geo.lng !== null) params.set("lng", String(geo.lng));
    fetch(`/api/world-context?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: WorldContext | null) => {
        if (payload?.radioDNA) {
          setWorldContext(payload);
          setWorldContextStatus("ready");
        } else {
          setWorldContext(null);
          setWorldContextStatus("empty");
        }
        setWorldContextStationKey(stationWorldKey);
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setWorldContext(null);
          setWorldContextStatus("empty");
          setWorldContextStationKey(stationWorldKey);
        }
      });
    return () => controller.abort();
  }, [geo.lat, geo.lng, station.city, station.country, station.country_code, station.language, station.name, station.state, stationWorldKey]);

  return { geo, visibleWorldContext, visibleWorldContextStatus };
}

function climateOrMood(context: WorldContext | null) {
  const theme = getAmbientTheme(context);
  const temp = context?.climate && typeof context.climate.temperatureC === "number" ? `${Math.round(context.climate.temperatureC)}°C` : null;
  return [temp, theme.moodLabel].filter(Boolean).join(" · ") || "Live signal";
}

function SelectedStationTheater({ station }: { station: Station }) {
  return <div className="pointer-events-none fixed inset-0 z-30" aria-live="polite" />;
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/72">{label}</p><p className="mt-1 text-sm leading-5 text-ivory/78">{value}</p></div>;
}

function BriefChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[11px] font-medium text-ivory/68">{children}</span>;
}

function StationContextBrief({ station, open, onClose }: { station: Station; open: boolean; onClose: () => void }) {
  const { visibleWorldContext, visibleWorldContextStatus } = useStationWorldContext(station);
  const context = visibleWorldContext;
  const theme = getAmbientTheme(context);
  const place = context ? buildPlaceLabel(context) : [station.city || station.state, station.country].filter(Boolean).join(", ") || "Tuning destination";
  const descriptor = context ? buildPlaceDescriptor(context) : station.language || "Live radio";
  const atmosphere = buildAtmosphereLine(context, theme);
  const climate = context?.climate;
  const weatherChips = [
    typeof climate?.temperatureC === "number" ? `${Math.round(climate.temperatureC)}°C` : null,
    typeof climate?.humidityPercent === "number" ? `${Math.round(climate.humidityPercent)}% humidity` : null,
    typeof climate?.rainfallMillimeters === "number" ? `${Math.round(climate.rainfallMillimeters)}mm rain` : null,
  ].filter(Boolean) as string[];
  const landmarks = context?.radioDNA.nearbyLandmarks.slice(0, 4) ?? [];
  const earthquakes = ((context?.environment.recentEarthquakes as Array<{ magnitude?: number; place?: string; distanceKm: number }> | undefined) ?? []).slice(0, 3);
  const sources = context?.sources.filter((source) => source.status === "success").map((source) => source.source) ?? [];
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-auto fixed inset-0 z-[66] flex items-end justify-center bg-black/10 px-3 pb-[calc(env(safe-area-inset-bottom)+5.25rem)] md:px-6 md:pb-28"
          onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <motion.aside
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-h-[55dvh] w-full max-w-3xl overflow-y-auto rounded-t-[1.6rem] border border-white/10 bg-slate-950/88 p-3 text-ivory shadow-[0_-16px_55px_rgba(0,0,0,.30)] backdrop-blur-xl md:max-h-[45dvh] md:rounded-[1.6rem] md:p-4"
            role="dialog"
            aria-modal="false"
            aria-label="Station brief"
          >
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-white/25" />
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold/80">Brief</p>
                <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-white">{place}</h2>
                <p className="mt-1 truncate text-xs text-ivory/52">{station.name} · {climateOrMood(context)}</p>
              </div>
              <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-ivory/70 hover:text-white" aria-label="Close brief"><X className="size-4" /></button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <BriefRow label="Place" value={descriptor || place} />
              <BriefRow label="Atmosphere" value={visibleWorldContextStatus === "loading" ? "Loading open-data atmosphere…" : atmosphere} />
              <BriefRow label="Culture" value={context?.radioDNA.culturalSummary || "Cultural signal pending from open sources."} />
              <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/72">Nearby</p><div className="mt-2 flex flex-wrap gap-1.5">{landmarks.length ? landmarks.map((item) => <BriefChip key={item}>{item}</BriefChip>) : <BriefChip>Landmarks pending</BriefChip>}</div></div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/72">Earth</p><div className="mt-2 flex flex-wrap gap-1.5">{weatherChips.map((item) => <BriefChip key={item}>{item}</BriefChip>)}{earthquakes.length ? earthquakes.map((event) => <BriefChip key={`${event.place}-${event.distanceKm}`}>M{event.magnitude ?? "?"} · {Math.round(event.distanceKm)}km</BriefChip>) : <BriefChip>NASA POWER climate</BriefChip>}</div></div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/72">Sources</p><div className="mt-2 flex flex-wrap gap-1.5">{sources.length ? sources.slice(0, 5).map((item) => <BriefChip key={item}>{item}</BriefChip>) : <BriefChip>Local fallback geography</BriefChip>}</div></div>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function StationIntelligencePanel({ station, stations, setQuery }: { station: Station; stations: Station[]; setQuery: (q: string) => void }) {
  const { playing, status } = usePlayer();
  const genre = getPrimaryGenre(station);
  const { visibleWorldContext, visibleWorldContextStatus } = useStationWorldContext(station);
  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-[12px] font-semibold text-gold">Destination Intelligence</p>
          <p className="mt-1 text-sm text-ivory/55">Cultural context for this destination</p>
        </div>
        <StreamHealthBadge station={station} />
      </div>
      <PlaceHero context={visibleWorldContext} stationName={station.name} fallbackPlace={[station.city || station.state, station.country].filter(Boolean).join(", ")} isPlaying={playing || status === "buffering"} />
      <RadioDNA context={visibleWorldContext} status={visibleWorldContextStatus} />
      <WorldContextPanel context={visibleWorldContext} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MiniCountryMapCard station={station} />
        <GeoTrustCards station={station} />
        <StationMetricCard icon={<Languages className="size-4" />} label="Language" value={station.language || "Unknown"} detail="Filter Discover" onClick={() => setQuery(station.language || "")} />
        <StationMetricCard icon={<Radio className="size-4" />} label="Genre" value={genre} detail="Find similar formats" onClick={() => setQuery(genre)} />
        <StationMetricCard icon={<Gauge className="size-4" />} label="Bitrate" value={station.bitrate ? `${station.bitrate} kbps` : "Unknown kbps"} detail={`${station.codec || "Unknown codec"} stream`} />
        <StationMetricCard icon={<Trophy className="size-4" />} label="Trending rank" value={getTrendingRank(station, stations)} detail={`${station.click_count.toLocaleString()} plays · ${station.votes.toLocaleString()} votes`} />
      </div>
      <div className="flex flex-wrap gap-2">
        <SaveStationButton station={station} />
        <ShareStationButton station={station} />
      </div>
      <RecentlyVisitedPanel />
      <WorldPassportPanel />
      <SimilarStationsList station={station} stations={stations} />
      <NearbyCountriesList station={station} setQuery={setQuery} />
    </section>
  );
}

function GeoTrustCards({ station }: { station: Station }) {
  const geo = useMemo(() => geotruth(station), [station]);
  const confidence = geo.confidence >= 75 ? "High" : geo.confidence >= 60 ? "Medium" : "Low";
  const precision = geo.precision === "station" ? "Station location" : geo.precision === "city" ? "City-level" : geo.precision === "country" ? "Country-level" : "Unknown";
  const source = geo.source === "country_centroid" ? "Verified centroid" : geo.source === "verified_api_geo" ? "Verified API geo" : geo.source === "city_gazetteer" ? "Trusted gazetteer" : geo.source === "manual_override" ? "Manual override" : "Unknown";
  return (
    <>
      <StationMetricCard icon={<MapPin className="size-4" />} label="Geo Confidence" value={confidence} detail={`${geo.confidence}/100 · ${geo.warning ?? "Country verified"}`} />
      <StationMetricCard icon={<Globe2 className="size-4" />} label="Geo Precision" value={precision} detail={`Location Source: ${source}`} />
    </>
  );
}


const SIGNAL_SPLASH_KEY = "waveatlas:splash-seen";
const signalInitializationPhases = [
  "Acquiring signal...",
  "Resolving Earth...",
  "Calibrating atlas...",
  "Loading station intelligence...",
  "Traveling through sound...",
];
function SignalInitializationSequence({ onComplete }: { onComplete?: () => void }) {
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState(0);
  const completed = useRef(false);
  const dismiss = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    try { window.sessionStorage.setItem(SIGNAL_SPLASH_KEY, "true"); } catch { /* Splash persistence is optional. */ }
    setVisible(false);
    onComplete?.();
  }, [onComplete]);
  useEffect(() => {
    const phaseTimer = window.setInterval(() => setPhase((p) => (p + 1) % signalInitializationPhases.length), 420);
    const doneTimer = window.setTimeout(dismiss, 1900);
    return () => { window.clearInterval(phaseTimer); window.clearTimeout(doneTimer); };
  }, [dismiss]);
  return <AnimatePresence>{visible ? <motion.div className="fixed inset-0 z-[110] grid place-items-center overflow-hidden bg-midnight/72 text-ivory backdrop-blur-xl" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .45 }}>
    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,8,20,.50),rgba(7,17,31,.76))]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(0,214,143,.18),transparent_24%),radial-gradient(circle_at_50%_58%,rgba(214,168,79,.13),transparent_26%)]" />
    <div className="cloud-layer absolute inset-0 opacity-20" />
    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:52px_52px] opacity-50" />
    <div className="relative flex max-w-xl flex-col items-center px-6 text-center">
      <motion.div className="relative grid size-56 place-items-center rounded-full border border-radio/20 bg-[radial-gradient(circle,rgba(0,214,143,.16),rgba(15,23,42,.42)_55%,transparent_70%)] shadow-[0_0_100px_rgba(0,214,143,.18)]" animate={{ rotate: 360 }} transition={{ duration: 24, repeat: Infinity, ease: "linear" }}>
        <div className="absolute inset-7 rounded-full border border-gold/25" />
        <div className="absolute inset-12 rounded-full border border-radio/20" />
        <Image src={WAVEATLAS_LOGO_PATH} alt="WaveAtlas logo" width={132} height={132} className="size-32 object-contain" />
        <span className="absolute size-4 rounded-full bg-radio shadow-[0_0_0_18px_rgba(88,225,132,.12),0_0_50px_rgba(88,225,132,.8)]" />
      </motion.div>
      <p className="mt-7 font-display text-xs font-semibold text-gold">Signal Initialization</p>
      <h1 className="mt-3 font-display text-[36px] font-extrabold leading-[1.08]">{BRAND.name}</h1>
      <p className="mt-2 text-lg text-ivory/70">Explore Humanity Through Sound™</p>
      <AnimatePresence mode="wait"><motion.p key={phase} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-6 font-mono text-sm text-radio">{signalInitializationPhases[phase]}</motion.p></AnimatePresence>
    </div>
    <p className="absolute bottom-8 left-1/2 w-full max-w-sm -translate-x-1/2 px-6 text-center text-xs font-medium tracking-wide text-ivory/45 sm:bottom-10">Powered by ETL GIS Consulting LLC</p>
  </motion.div> : null}</AnimatePresence>;
}

function AudioEngine({ stations }: { stations: Station[] }) {
  const { current, status, volume, userActivated, stationSelectionSource, setStatus } = usePlayer();
  const audio = useRef<HTMLAudioElement | null>(null);
  const attempted = useRef<string[]>([]);
  const skipTimestamps = useRef<number[]>([]);
  const currentKey = current ? stationKey(current) : "";

  const skipToNextCandidate = useCallback((failed: Station, errorType: SignalFailureType, detail?: string) => {
    const hardFailure = ["audio_error", "network_error", "unsupported_media", "autoplay_blocked", "missing_url", "abort", "playback_error"].includes(errorType);
    const now = Date.now();
    skipTimestamps.current = skipTimestamps.current.filter((timestamp) => now - timestamp < 20000);
    if (!hardFailure && skipTimestamps.current.length >= 2) {
      setStatus("buffering", "Finding a stronger live signal…");
      return false;
    }
    skipTimestamps.current = [...skipTimestamps.current, now];
    const state = usePlayer.getState();
    if (!(state.stationSelectionSource === "manual" && isCuratedStation(failed))) markStationFailure(failed, errorType, detail);
    attempted.current = [...new Set([...attempted.current, stationKey(failed)])];
    const manualSelection = state.stationSelectionSource === "manual";
    debugPlayback("fallback check", { station: failed.name, country: failed.country, source: failed.curation_source || failed.curation_tier || "radio_browser", stationSelectionSource: state.stationSelectionSource, failed: failed.name, errorType, detail, healthPenaltyApplied: !(state.stationSelectionSource === "manual" && isCuratedStation(failed)) });
    debugTeleport("playback fallback check", { stationSelectionSource: state.stationSelectionSource, failed: failed.name, errorType, detail });
    if (manualSelection && !hardFailure) {
      setStatus("buffering", "Holding the selected signal…");
      return false;
    }
    if (isCuratedStation(failed) && failed.country_code === "NG" && (errorType === "waiting" || errorType === "stalled")) {
      setStatus("buffering", "Holding the Nigerian signal…");
      return false;
    }
    const failedContinent = stationContinent(failed);
    const scopedCountryFallback = state.stationSelectionSource === "auto"
      ? state.teleportQueue.find((station) => station.country_code === failed.country_code && !attempted.current.includes(stationKey(station)))
      : undefined;
    const queueFallback = scopedCountryFallback
      ?? state.teleportQueue.find((station) => !attempted.current.includes(stationKey(station)) && stationContinent(station) !== failedContinent)
      ?? state.teleportQueue.find((station) => !attempted.current.includes(stationKey(station)));
    const fallback = queueFallback ?? nextFastConnectCandidate(stations, failed, attempted.current) ?? pickFallbackStation(stations, failed, readArrivalHistory());
    if (fallback) {
      const reason = errorType === "startup_timeout" || errorType === "waiting" || errorType === "stalled" ? "weak_signal" : "fallback";
      debugPlayback("fallback selected", { station: failed.name, country: failed.country, source: failed.curation_source || failed.curation_tier || "radio_browser", stationSelectionSource: state.stationSelectionSource, skipReason: errorType, fallbackStation: fallback.name });
      debugTeleport("fast-connect fallback", { failed: failed.name, failedContinent, replacement: fallback.name, replacementContinent: stationContinent(fallback), reason, usedTeleportQueue: Boolean(queueFallback), ignoredArrivalContext: Boolean(state.arrivalStation) });
      setStatus("buffering", FAST_CONNECT_COPY.retrying);
      if (queueFallback) {
        commitTeleportStation(fallback, state.teleportQueue.filter((station) => stationKey(station) !== stationKey(fallback)));
      } else if (state.arrivalStation && stationKey(state.arrivalStation) === stationKey(failed)) {
        state.replaceStartupStation(failed, fallback, reason);
        setCurrentStationAndDestination(fallback, "fallback");
      } else {
        setCurrentStationAndDestination(fallback, "fallback");
      }
      return true;
    }
    setStatus("failed", FAST_CONNECT_COPY.failed);
    return false;
  }, [setStatus, stations]);

  useEffect(() => {
    if (!current) return;
    const queue = buildFastConnectQueue(stations, current, FAST_CONNECT_PARALLEL_CANDIDATES - 1);
    attempted.current = [stationKey(current)];
    if (queue.length > 1) setStatus("buffering", usePlayer.getState().stationSelectionSource === "manual" ? "Holding the selected signal…" : getAdaptiveBufferPolicy(current).message);
  }, [currentKey, current, setStatus, stations]);

  useEffect(() => {
    const element = new Audio();
    element.preload = "auto";
    element.volume = 1;
    element.muted = false;
    audio.current = element;
    const onError = () => {
      const failed = usePlayer.getState().current;
      if (failed) skipToNextCandidate(failed, element.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? "unsupported_media" : "audio_error", element.error?.message);
    };
    element.addEventListener("error", onError);

    return () => {
      element.removeEventListener("error", onError);
      element.pause();
      element.removeAttribute("src");
      element.load();
      audio.current = null;
    };
  }, [skipToNextCandidate]);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.volume = volume;
    if (element.muted) element.muted = false;
  }, [volume]);

  useEffect(() => {
    const element = audio.current;
    if (!element || !current) return;

    const streamUrl = getStationStreamUrl(current);
    if (!streamUrl) {
      skipToNextCandidate(current, "missing_url", "Station did not provide a stream URL.");
      return;
    }

    if (!/^https?:\/\//i.test(streamUrl)) {
      skipToNextCandidate(current, "unsupported_media", `Unsupported stream URL: ${streamUrl}`);
      return;
    }

    if (!userActivated) {
      element.src = streamUrl;
      element.preload = "auto";
      element.load();
      setStatus("blocked", "Tap to Play: browsers require a click before live audio can start.");
      return;
    }

    if (status !== "buffering") return;

    let failed = false;
    let cancelled = false;
    let attempt = 1;
    let bufferTimer: number | undefined;
    let startupTimer: number | undefined;
    let lastReadyState = element.readyState;
    let readyStatePatienceExtended = false;
    let verifiedNigerianHoldStartedAt: number | undefined;
    let verifiedNigerianHoldExtensions = 0;
    let waitingEvents = 0;
    let stalledEvents = 0;
    let loadedMetadata = false;
    let sawCanPlay = false;
    let sawProgress = false;
    let lastCurrentTime = element.currentTime || 0;
    const selectionSource = stationSelectionSource;
    const manualSelection = selectionSource === "manual";
    const policy = getAdaptiveBufferPolicy(current, manualSelection);
    const verifiedNigerianStation = isVerifiedNigerianStation(current);
    const maximumVerifiedNigerianHoldMs = 25_000;
    const maximumVerifiedNigerianHoldExtensions = 2;
    const audioEvents: string[] = [];
    const logAudioEvent = (event: string) => {
      audioEvents.push(event);
      debugPlayback("audio event", { station: current.name, country: current.country, source: current.curation_source || current.curation_tier || "radio_browser", stationSelectionSource: selectionSource, timeoutPolicy: policy, audioEvents: [...audioEvents], event, readyState: element.readyState });
    };
    debugPlayback("attempt", { station: current.name, country: current.country, source: current.curation_source || current.curation_tier || "radio_browser", stationSelectionSource: selectionSource, timeoutPolicy: policy, startupTimeoutMs: policy.startupTimeoutMs, bufferTimeoutMs: policy.bufferTimeoutMs, maxAttempts: policy.maxAttempts, healthPenaltyApplied: false });
    debugTeleport("playback attempt", { station: current.name, stationSelectionSource: selectionSource, startupTimeoutMs: policy.startupTimeoutMs, bufferTimeoutMs: policy.bufferTimeoutMs, maxAttempts: policy.maxAttempts });
    const clearBufferTimer = () => { if (bufferTimer) window.clearTimeout(bufferTimer); bufferTimer = undefined; };
    const clearStartupTimer = () => { if (startupTimer) window.clearTimeout(startupTimer); startupTimer = undefined; };
    const hasProgress = () => loadedMetadata || sawCanPlay || sawProgress || element.readyState > 0 || element.currentTime > lastCurrentTime;
    const scheduleStartupTimer = () => {
      clearStartupTimer();
      startupTimer = window.setTimeout(() => fail("startup_timeout", `No playback progress before ${policy.startupTimeoutMs}ms startup timeout.`), policy.startupTimeoutMs);
    };
    const scheduleBufferTimer = (reason: SignalFailureType = "buffer_timeout", timeoutMs = policy.bufferTimeoutMs) => {
      clearBufferTimer();
      debugPlayback("timer reset", { station: current.name, stationSelectionSource: selectionSource, reason, timeoutMs, failed, verifiedNigerianHoldExtensions });
      bufferTimer = window.setTimeout(() => fail(reason, `Buffering exceeded ${timeoutMs}ms without progress.`), timeoutMs);
    };
    const noteProgress = () => {
      const readyStateImproved = element.readyState > lastReadyState;
      const timeAdvanced = element.currentTime > lastCurrentTime;
      sawProgress = true;
      if (readyStateImproved) lastReadyState = element.readyState;
      if (timeAdvanced) lastCurrentTime = element.currentTime;
      if ((readyStateImproved || timeAdvanced) && !readyStatePatienceExtended) {
        readyStatePatienceExtended = true;
        debugPlayback("patience extended", { station: current.name, country: current.country, source: current.curation_source || current.curation_tier || "radio_browser", stationSelectionSource: selectionSource, timeoutPolicy: policy, audioEvents: [...audioEvents], readyState: element.readyState });
        scheduleStartupTimer();
        scheduleBufferTimer();
      } else if (readyStateImproved || timeAdvanced) {
        scheduleBufferTimer();
      }
    };
    const fail = (errorType: SignalFailureType, detail?: string) => {
      if (cancelled || failed) return;
      const holdSignal = verifiedNigerianStation && (errorType === "waiting" || errorType === "stalled" || errorType === "buffer_timeout" || errorType === "startup_timeout");
      if (holdSignal) {
        const now = Date.now();
        verifiedNigerianHoldStartedAt ??= now;
        const holdDurationMs = now - verifiedNigerianHoldStartedAt;
        if (holdDurationMs < maximumVerifiedNigerianHoldMs && verifiedNigerianHoldExtensions < maximumVerifiedNigerianHoldExtensions) {
          verifiedNigerianHoldExtensions += 1;
          setStatus("buffering", policy.timeoutMessage);
          debugPlayback("buffer patience extended", { station: current.name, stationSelectionSource: selectionSource, event: errorType, bufferExtensionCount: verifiedNigerianHoldExtensions, failed, holdDurationMs, maximumVerifiedNigerianHoldMs });
          scheduleBufferTimer(errorType === "stalled" ? "stalled" : "buffer_timeout", Math.min(policy.bufferTimeoutMs, maximumVerifiedNigerianHoldMs - holdDurationMs));
          return;
        }
      }
      if (manualSelection && (errorType === "waiting" || errorType === "stalled" || errorType === "abort")) {
        setStatus("buffering", policy.message);
        scheduleBufferTimer("buffer_timeout");
        return;
      }
      if ((errorType === "startup_timeout" || errorType === "buffer_timeout" || errorType === "waiting" || errorType === "stalled") && (manualSelection || hasProgress()) && attempt < policy.maxAttempts) {
        attempt += 1;
        clearStartupTimer();
        clearBufferTimer();
        debugPlayback("timer reset", { station: current.name, stationSelectionSource: selectionSource, reason: "retry", failed, attempt });
        setStatus("buffering", policy.message);
        void playSelectedStream();
        return;
      }
      failed = true;
      clearStartupTimer();
      clearBufferTimer();
      debugPlayback("abandoning stream", { station: current.name, stationSelectionSource: selectionSource, errorType, failed, bufferExtensionCount: verifiedNigerianHoldExtensions });
      if (policy.trusted && (errorType === "startup_timeout" || errorType === "buffer_timeout" || errorType === "waiting" || errorType === "stalled")) setStatus("buffering", policy.timeoutMessage);
      if (manualSelection && (errorType === "startup_timeout" || errorType === "buffer_timeout") && hasProgress()) {
        setStatus("buffering", policy.timeoutMessage);
        return;
      }
      skipToNextCandidate(current, errorType, detail);
    };
    const onLoadedMetadata = () => { logAudioEvent("loadedmetadata"); loadedMetadata = true; debugPlayback("recovery event", { station: current.name, stationSelectionSource: selectionSource, event: "loadedmetadata", failed }); noteProgress(); };
    const onCanPlay = () => { logAudioEvent("canplay"); sawCanPlay = true; debugPlayback("recovery event", { station: current.name, stationSelectionSource: selectionSource, event: "canplay", failed }); noteProgress(); clearStartupTimer(); scheduleBufferTimer(); };
    const onPlaying = () => {
      logAudioEvent("playing");
      debugPlayback("playing event", { station: current.name, stationSelectionSource: selectionSource, failed });
      if (cancelled || failed) return;
      clearStartupTimer();
      clearBufferTimer();
      markStationSuccess(current);
      rememberTeleport(current);
      const startupArrivalStation = usePlayer.getState().arrivalStation;
      if (startupArrivalStation && stationKey(startupArrivalStation) === stationKey(current)) markArrivalCompleted();
      usePlayer.getState().clearArrivalContext();
      debugTeleport("final station playing", { station: current.name, country: current.country_code, continent: stationContinent(current) });
      setStatus("playing");
    };
    const onWaiting = () => {
      logAudioEvent("waiting");
      waitingEvents += 1;
      noteProgress();
      scheduleBufferTimer("buffer_timeout");
    };
    const onStalled = () => {
      logAudioEvent("stalled");
      stalledEvents += 1;
      noteProgress();
      const readyStateAtEvent = element.readyState;
      scheduleBufferTimer(readyStateAtEvent <= lastReadyState && stalledEvents > 2 ? "stalled" : "buffer_timeout");
    };
    const onAbort = () => { logAudioEvent("abort"); fail("abort", "Audio request was aborted."); };
    scheduleStartupTimer();

    element.addEventListener("loadedmetadata", onLoadedMetadata);
    element.addEventListener("canplay", onCanPlay);
    element.addEventListener("playing", onPlaying);
    element.addEventListener("timeupdate", noteProgress);
    element.addEventListener("progress", noteProgress);
    element.addEventListener("waiting", onWaiting);
    element.addEventListener("stalled", onStalled);
    element.addEventListener("abort", onAbort);

    const playSelectedStream = async () => {
      try {
        setStatus("buffering", policy.message);
        element.pause();
        element.src = streamUrl;
        element.preload = "auto";
        element.volume = volume;
        element.muted = false;
        element.load();
        await element.play();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Playback was blocked or the stream failed.";
        const isAutoplay = /user|gesture|allowed|interact/i.test(message);
        if (isAutoplay) {
          markStationFailure(current, "autoplay_blocked", message);
          setStatus("blocked", "Tap to Play: browsers require a click before live audio can start.");
        } else {
          fail(/network/i.test(message) ? "network_error" : "playback_error", message);
        }
      }
    };

    void playSelectedStream();

    return () => {
      cancelled = true;
      clearStartupTimer();
      clearBufferTimer();
      element.removeEventListener("loadedmetadata", onLoadedMetadata);
      element.removeEventListener("canplay", onCanPlay);
      element.removeEventListener("playing", onPlaying);
      element.removeEventListener("timeupdate", noteProgress);
      element.removeEventListener("progress", noteProgress);
      element.removeEventListener("waiting", onWaiting);
      element.removeEventListener("stalled", onStalled);
      element.removeEventListener("abort", onAbort);
    };
  }, [current, currentKey, status, userActivated, stationSelectionSource, setStatus, volume, stations, skipToNextCandidate]);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    if (status === "paused" || status === "idle") {
      element.pause();
    }
  }, [status]);

  return null;
}

function SignalMeter({ score }: { score: number }) {
  return (
    <div className="flex h-14 items-end gap-1">
      {[28, 42, 56, 70, 84].map((h, i) => (
        <motion.span
          key={h}
          className="w-2 rounded-full bg-radio"
          animate={{
            height: score / 20 > i ? h : 12,
            opacity: score / 20 > i ? 0.95 : 0.28,
          }}
          transition={{
            repeat: Infinity,
            repeatType: "mirror",
            duration: 0.7 + i * 0.08,
          }}
        />
      ))}
    </div>
  );
}
type BasemapKey = "atlasStreets" | "atlas" | "satellite" | "terrain" | "streets" | "night" | "blueMarble";
type GlobeBasemapKey = "blueMarble" | "night" | "signal";
type DefaultMapView = { center: [number, number]; zoom: number; bearing: number; pitch: number; duration: number };
const DEFAULT_MAP_VIEW: Record<"desktop" | "mobile", DefaultMapView> = {
  desktop: { center: [0, 20], zoom: 1.6, bearing: 0, pitch: 0, duration: 2500 },
  mobile: { center: [8.6753, 9.082], zoom: 1.35, bearing: 0, pitch: 0, duration: 2500 },
};
const DEFAULT_BASEMAP: BasemapKey = "atlasStreets";
const BASEMAP_STORAGE_KEY = "waveatlas:basemap";
const GLOBE_BASEMAP_STORAGE_KEY = "waveatlas:globe-basemap";
const ATLAS_VIEW_STORAGE_KEY = "waveatlas:atlas-view";
type AtlasViewMode = "globe" | "map";
const basemapStyles: Record<BasemapKey, { label: string; name: string; description: string; style: string | maplibregl.StyleSpecification }> = {
  atlasStreets: { label: "🛣 Atlas Streets", name: "Atlas Streets", description: "Free vector streets for arrival zoom, powered by OpenStreetMap/OpenFreeMap.", style: "https://tiles.openfreemap.org/styles/liberty" },
  atlas: { label: "🌎 Atlas", name: "Atlas", description: "Premium dark vector map", style: { version: 8, sources: { carto: { type: "raster", tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors © CARTO" } }, layers: [{ id: "carto-dark-matter", type: "raster", source: "carto" }] } },
  satellite: { label: "🛰 Satellite", name: "Satellite", description: "Realistic Earth imagery", style: { version: 8, sources: { esri: { type: "raster", tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" } }, layers: [{ id: "esri-world-imagery", type: "raster", source: "esri" }] } },
  terrain: { label: "🏔 Terrain", name: "Terrain", description: "Topographic terrain", style: { version: 8, sources: { terrain: { type: "raster", tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap (CC-BY-SA)" } }, layers: [{ id: "opentopomap-terrain", type: "raster", source: "terrain" }] } },
  streets: { label: "🗺 OSM Streets", name: "OSM Streets", description: "Classic OpenStreetMap vector style", style: "https://tiles.openfreemap.org/styles/liberty" },
  night: { label: "🌃 Night", name: "Night Lights", description: "Earth at night", style: { version: 8, sources: { nasa: { type: "raster", tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg"], tileSize: 256, attribution: "NASA GIBS / VIIRS City Lights" } }, layers: [{ id: "viirs-night-lights", type: "raster", source: "nasa" }] } },
  blueMarble: { label: "🌊 Blue Marble", name: "Blue Marble", description: "Clean global Earth aesthetic", style: { version: 8, sources: { marble: { type: "raster", tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg"], tileSize: 256, attribution: "NASA GIBS / Blue Marble" } }, layers: [{ id: "blue-marble", type: "raster", source: "marble" }] } },
};
function getInitialBasemap(mobile: boolean): BasemapKey { if (typeof window === "undefined") return DEFAULT_BASEMAP; const saved = window.localStorage.getItem(BASEMAP_STORAGE_KEY) as BasemapKey | null; return saved && saved in basemapStyles ? saved : DEFAULT_BASEMAP; }
const globeBasemapStyles: Record<GlobeBasemapKey, { label: string; name: string; description: string }> = {
  blueMarble: { label: "🌊 Blue Marble Globe", name: "Blue Marble Globe", description: "Procedural oceans, landmasses, borders, labels, and live beacon." },
  night: { label: "🌃 Night Globe", name: "Night Globe", description: "Dark Earth with country outlines, city-light style points, and live beacon." },
  signal: { label: "📡 Signal Globe", name: "Signal Globe", description: "Minimal navy globe with grid, country outlines, and live beacon." },
};
function getInitialGlobeBasemap(): GlobeBasemapKey { if (typeof window === "undefined") return "blueMarble"; const saved = window.localStorage.getItem(GLOBE_BASEMAP_STORAGE_KEY) as GlobeBasemapKey | null; return saved && saved in globeBasemapStyles ? saved : "blueMarble"; }
function getInitialAtlasView(): AtlasViewMode {
  if (typeof window === "undefined") return "globe";
  const saved = window.localStorage.getItem(ATLAS_VIEW_STORAGE_KEY);
  if (saved === "map" || saved === "globe") return saved;
  if (saved) window.localStorage.removeItem(ATLAS_VIEW_STORAGE_KEY);
  return "globe";
}
function persistAtlasView(view: AtlasViewMode) {
  try { window.localStorage.setItem(ATLAS_VIEW_STORAGE_KEY, view); } catch { /* Atlas view is safe to reset when storage is unavailable. */ }
}
function debugAtlasDecision(details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
  console.info("[WaveAtlas atlas-view]", { viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent, ...details });
}
function BasemapControl({ value, onChange, mobile = false }: { value: BasemapKey; onChange: (value: BasemapKey) => void; mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  return (
    <div ref={rootRef} className={`${mobile ? "right-4 top-[148px]" : "right-6 top-24 xl:right-8"} pointer-events-auto absolute z-50`}>
      <button
        type="button"
        aria-label="Change map style"
        aria-expanded={open}
        onClick={() => setOpen((show) => !show)}
        className="grid size-11 place-items-center rounded-full border border-white/15 bg-slate-950/55 text-ivory shadow-2xl backdrop-blur-xl transition hover:border-gold/40 hover:bg-slate-900/75 hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        <Layers className="size-5" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            className="absolute right-0 mt-2 w-[min(280px,calc(100vw-2rem))] rounded-3xl border border-white/12 bg-slate-950/82 p-2 shadow-2xl backdrop-blur-2xl"
            role="menu"
            aria-label="Map style options"
          >
            <p className="px-2 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.2em] text-gold/80">Map Style</p>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(basemapStyles) as BasemapKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === key}
                  aria-label={`Switch basemap to ${basemapStyles[key].name}`}
                  onClick={() => { onChange(key); setOpen(false); }}
                  className={`rounded-2xl px-3 py-2 text-left text-[11px] font-semibold transition ${value === key ? "bg-gold text-midnight shadow-lg" : "text-ivory/78 hover:bg-white/10 hover:text-white"}`}
                  title={basemapStyles[key].description}
                >
                  {basemapStyles[key].label}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
function GlobeBasemapControl({ value, onChange, mobile = false }: { value: GlobeBasemapKey; onChange: (value: GlobeBasemapKey) => void; mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown); document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  const choose = (key: GlobeBasemapKey) => { onChange(key); try { window.localStorage.setItem(GLOBE_BASEMAP_STORAGE_KEY, key); } catch { /* Non-critical preference. */ } setOpen(false); };
  return <div ref={rootRef} className={`${mobile ? "left-4 top-[calc(env(safe-area-inset-top)+136px)]" : "right-6 top-24 xl:right-8"} pointer-events-auto absolute z-50`}>
    <button type="button" aria-label="Change globe style" aria-expanded={open} onClick={() => setOpen((show) => !show)} className="grid size-11 place-items-center rounded-full border border-white/15 bg-slate-950/55 text-ivory shadow-2xl backdrop-blur-xl transition hover:border-radio/40 hover:bg-slate-900/75 hover:text-radio focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"><Globe2 className="size-5" /></button>
    <AnimatePresence>{open ? <motion.div initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }} className="absolute left-0 mt-2 w-[min(300px,calc(100vw-2rem))] rounded-3xl border border-white/12 bg-slate-950/82 p-2 shadow-2xl backdrop-blur-2xl md:left-auto md:right-0" role="menu" aria-label="Globe style options">
      <p className="px-2 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.2em] text-radio/80">Globe Style</p>
      <div className="grid gap-1">{(Object.keys(globeBasemapStyles) as GlobeBasemapKey[]).map((key) => <button key={key} type="button" role="menuitemradio" aria-checked={value === key} aria-label={`Switch globe basemap to ${globeBasemapStyles[key].name}`} onClick={() => choose(key)} className={`rounded-2xl px-3 py-2 text-left text-[11px] font-semibold transition ${value === key ? "bg-radio text-midnight shadow-lg" : "text-ivory/78 hover:bg-white/10 hover:text-white"}`} title={globeBasemapStyles[key].description}>{globeBasemapStyles[key].label}</button>)}</div>
    </motion.div> : null}</AnimatePresence>
  </div>;
}
function MapStyleController({ map, basemap, onResize }: { map: Map | null; basemap: BasemapKey; onResize?: () => void }) { useEffect(() => { if (!map) return; map.setStyle(basemapStyles[basemap].style); try { window.localStorage.setItem(BASEMAP_STORAGE_KEY, basemap); } catch { /* Basemap preference is non-critical. */ } const resize = () => requestAnimationFrame(() => { map.resize(); onResize?.(); }); map.once("styledata", resize); resize(); return () => { map.off("styledata", resize); }; }, [map, basemap, onResize]); return null; }


function escapeMarkerText(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

function markerHtml(geo: GeoPoint, status: PlaybackStatus, label?: { place: string; mood: string; station: string }) {
  const labelHtml = label ? `<span class="station-living-label"><b>${escapeMarkerText(label.place)}</b><span>${escapeMarkerText(label.mood)}</span><em>${escapeMarkerText(label.station)}</em></span>` : "";
  return `<span class="station-pulse-ring"></span><span class="station-pulse-ring two"></span><span class="station-pin" aria-hidden="true"><svg viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 40C16 40 29 25.6 29 14.8C29 7.73 23.18 2 16 2C8.82 2 3 7.73 3 14.8C3 25.6 16 40 16 40Z" fill="currentColor" stroke="rgba(255,255,255,.9)" stroke-width="2.2" /></svg></span><span class="station-pulse-dot"></span>${labelHtml}`;
}

function StationPulseMarker({
  geo,
  status,
}: {
  geo: GeoPoint;
  status: PlaybackStatus;
}) {
  return (
    <div
      className={`station-pulse-marker tone-${geo.tone} status-${status}`}
      aria-label={`${geo.label} station pulse`}
    >
      <span className="station-pulse-ring" />
      <span className="station-pulse-ring two" />
      <span className="station-pin" aria-hidden="true">
        <svg viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 40C16 40 29 25.6 29 14.8C29 7.73 23.18 2 16 2C8.82 2 3 7.73 3 14.8C3 25.6 16 40 16 40Z" fill="currentColor" stroke="rgba(255,255,255,.9)" strokeWidth="2.2" />
        </svg>
      </span>
      <span className="station-pulse-dot" />
    </div>
  );
}
function MapMarkerController({
  marker,
  geo,
  status,
  label,
}: {
  marker: Marker | null;
  geo: GeoPoint;
  status: PlaybackStatus;
  label?: { place: string; mood: string; station: string };
}) {
  useEffect(() => {
    if (geo.lat === null || geo.lng === null) return;
    marker?.setLngLat([geo.lng, geo.lat]);
  }, [geo, marker]);
  useEffect(() => {
    const element = marker?.getElement();
    if (!element) return;
    element.className = `station-pulse-marker tone-${geo.tone} status-${status}`;
    element.innerHTML = markerHtml(geo, status, label);
  }, [geo, label, marker, status]);
  return null;
}


type MapTeleportContext = { lat: number; lng: number; zoom: number; countryCode?: string; countryName?: string };

function stationStreetViewLinks(station: Station) {
  const geo = resolveStationGeo(station);
  if (geo.lat === null || geo.lng === null) return [];
  const label = encodeURIComponent([station.name, station.city || station.state, station.country].filter(Boolean).join(", "));
  const lat = geo.lat.toFixed(6);
  const lng = geo.lng.toFixed(6);
  return [
    { name: "Google Street View", href: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}` },
    { name: "Apple Look Around", href: `https://maps.apple.com/?ll=${lat},${lng}&q=${label}` },
    { name: "Mapillary", href: `https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=17` },
  ];
}

function OpenStreetViewButton({ station, mobile = false }: { station: Station; mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const links = useMemo(() => stationStreetViewLinks(station), [station]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown); document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  if (!links.length) return null;
  return <div ref={rootRef} className={`${mobile ? "right-4 top-[calc(env(safe-area-inset-top)+204px)]" : "right-6 top-40 xl:right-8"} pointer-events-auto absolute z-50`}>
    <button type="button" aria-label="Open street view options" aria-expanded={open} onClick={() => setOpen((show) => !show)} className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-slate-950/60 px-3 text-xs font-bold text-ivory shadow-2xl backdrop-blur-xl transition hover:border-radio/40 hover:bg-slate-900/80 hover:text-radio focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"><Link className="size-4" />{mobile ? "Street" : "Open Street View"}</button>
    <AnimatePresence>{open ? <motion.div initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }} className="absolute right-0 mt-2 w-[min(280px,calc(100vw-2rem))] rounded-3xl border border-white/12 bg-slate-950/86 p-2 text-left shadow-2xl backdrop-blur-2xl" role="menu" aria-label="External street view portals">
      <p className="px-2 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.2em] text-radio/80">External portals</p>
      {links.map((item) => <a key={item.name} href={item.href} target="_blank" rel="noreferrer" role="menuitem" className="block rounded-2xl px-3 py-2 text-[11px] font-semibold text-ivory/80 transition hover:bg-white/10 hover:text-white">{item.name}</a>)}
      <p className="px-2 pt-2 text-[10px] leading-snug text-ivory/45">Uses free external links only; no Street View basemap or paid API key.</p>
    </motion.div> : null}</AnimatePresence>
  </div>;
}

function countryNameForCode(code: string) {
  try {
    return new Intl.DisplayNames([navigator.language || "en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}


const ISO3_TO_A2: Record<string, string> = { USA: "US", GBR: "GB", NGA: "NG", GHA: "GH", JPN: "JP", DEU: "DE", FRA: "FR", ARE: "AE", BRA: "BR", ZAF: "ZA", CAN: "CA", IND: "IN", AUS: "AU", MEX: "MX", ESP: "ES", ITA: "IT", CHN: "CN", KOR: "KR", IDN: "ID", PHL: "PH", THA: "TH", MYS: "MY", SGP: "SG", SAU: "SA", QAT: "QA", ISR: "IL", TUR: "TR", NZL: "NZ", FJI: "FJ", PNG: "PG", KEN: "KE", EGY: "EG", MAR: "MA", TZA: "TZ", UGA: "UG", CMR: "CM", SEN: "SN", NLD: "NL", SWE: "SE", NOR: "NO", IRL: "IE", CHE: "CH", BEL: "BE", PRT: "PT", ARG: "AR", CHL: "CL", COL: "CO", PER: "PE" };
const COUNTRY_CODE_FIELDS = ["ISO_A2", "iso_a2", "countryCode", "COUNTRY_CODE", "country_code"] as const;
const COUNTRY_CODE3_FIELDS = ["ISO_A3", "iso_a3", "ADM0_A3", "adm0_a3"] as const;
const COUNTRY_NAME_FIELDS = ["ADMIN", "admin", "NAME", "name", "COUNTRY", "country"] as const;

function titleCaseCountry(name: string) {
  return name.trim().replace(/\s+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function countryResultFromFeatureProperties(properties: Record<string, unknown> | undefined, fallbackLat: number, fallbackLng: number): CountryResult | null {
  const props = properties ?? {};
  const read = (fields: readonly string[]) => fields.map((field) => props[field]).find((value): value is string | number => typeof value === "string" || typeof value === "number");
  const rawA2 = String(read(COUNTRY_CODE_FIELDS) ?? "").trim().toUpperCase();
  const rawA3 = String(read(COUNTRY_CODE3_FIELDS) ?? "").trim().toUpperCase();
  const rawName = String(read(COUNTRY_NAME_FIELDS) ?? "").trim();
  const aliasCode = rawName ? countryAliases[rawName.toLowerCase()] : undefined;
  const code = (/^[A-Z]{2}$/.test(rawA2) && rawA2 !== "-99" ? rawA2 : undefined) ?? ISO3_TO_A2[rawA3] ?? aliasCode;
  if (code) return { name: rawName || countryNameForCode(code), code, flag: flagFor(code), centroid: isoCountryCentroids[code] ?? { lat: fallbackLat, lng: fallbackLng }, station_count: 0 };
  if (rawName) {
    const nearest = nearestCountryResult(fallbackLat, fallbackLng);
    return nearest ? { ...nearest, name: titleCaseCountry(rawName) } : null;
  }
  return nearestCountryResult(fallbackLat, fallbackLng);
}

function countryResultFromMapClick(map: Map, event: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent): CountryResult | null {
  const point = event.point;
  const features = map.queryRenderedFeatures(point).filter((feature) => feature.properties);
  const feature = features.find((item) => countryResultFromFeatureProperties(item.properties as Record<string, unknown>, event.lngLat.lat, event.lngLat.lng)) ?? features[0];
  const country = countryResultFromFeatureProperties(feature?.properties as Record<string, unknown> | undefined, event.lngLat.lat, event.lngLat.lng);
  debugCountryClick("resolved", { featureProperties: feature?.properties ?? null, resolvedCountryName: country?.name, resolvedCountryCode: country?.code, lngLat: event.lngLat });
  return country;
}

function nearestCountryResult(lat: number, lng: number): CountryResult | null {
  let best: { code: string; distance: number } | null = null;
  for (const [code, point] of Object.entries(isoCountryCentroids)) {
    const distance = haversineKm({ lat, lng }, point);
    if (!best || distance < best.distance) best = { code, distance };
  }
  if (!best || best.distance > 1400) return null;
  const name = countryNameForCode(best.code);
  return { name, code: best.code, flag: flagFor(best.code), centroid: isoCountryCentroids[best.code], station_count: 0 };
}



function WaveAtlasMap({ station, mobile = false, resetSignal = 0, basemap: controlledBasemap, onBasemapChange, onMapContextChange, onCountrySelect, searchActive = false, keyboardOpen = false }: { station: Station; mobile?: boolean; resetSignal?: number; basemap?: BasemapKey; onBasemapChange?: (value: BasemapKey) => void; onMapContextChange?: (context: MapTeleportContext) => void; onCountrySelect?: (country: CountryResult) => void; searchActive?: boolean; keyboardOpen?: boolean }) {
  const status = usePlayer((s) => s.status);
  const container = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<Map | null>(null);
  const [marker, setMarker] = useState<Marker | null>(null);
  const [internalBasemap, setInternalBasemap] = useState<BasemapKey>(() => getInitialBasemap(mobile));
  const basemap = controlledBasemap ?? internalBasemap;
  const setBasemap = onBasemapChange ?? setInternalBasemap;
  const initialBasemap = useRef(basemap);
  const viewMode = useRef<"desktop" | "mobile">(mobile ? "mobile" : "desktop");
  const geo = useMemo(() => geotruth(station), [station]);
  const { visibleWorldContext } = useStationWorldContext(station);
  const livingLabel = useMemo(() => ({ place: visibleWorldContext ? buildPlaceLabel(visibleWorldContext) : [station.city || station.state, station.country].filter(Boolean).join(", ") || geo.label, mood: climateOrMood(visibleWorldContext), station: station.name }), [geo.label, station.city, station.country, station.name, station.state, visibleWorldContext]);
  const initialGeo = useRef(geo);
  const onCountrySelectRef = useRef(onCountrySelect);
  useEffect(() => { onCountrySelectRef.current = onCountrySelect; }, [onCountrySelect]);

  const cameraPadding = useMemo(() => mobile ? { top: 160, right: 24, bottom: 180, left: 24 } : { top: 28, right: 28, bottom: 28, left: 28 }, [mobile]);
  const camera = useMapCameraController(map, cameraPadding);
  const lastStationId = useRef(station.id);
  const pendingStationGeo = useRef<GeoPoint | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const start = initialGeo.current;
    const m = new maplibregl.Map({
      container: container.current,
      style: basemapStyles[initialBasemap.current].style,
      center: DEFAULT_MAP_VIEW[viewMode.current].center,
      zoom: DEFAULT_MAP_VIEW[viewMode.current].zoom,
      bearing: DEFAULT_MAP_VIEW[viewMode.current].bearing,
      pitch: DEFAULT_MAP_VIEW[viewMode.current].pitch,
      attributionControl: false,
    });
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    let mk: Marker | null = null;
    if (start.lat !== null && start.lng !== null) {
      const markerRoot = document.createElement("div");
      markerRoot.className = `station-pulse-marker tone-${start.tone} status-playing`;
      markerRoot.innerHTML = markerHtml(start, "playing");
      mk = new maplibregl.Marker({ element: markerRoot, anchor: "center" })
        .setLngLat([start.lng, start.lat])
        .addTo(m);
    }
    setMap(m);
    setMarker(mk);
    const resize = () => requestAnimationFrame(() => m.resize());
    resize();
    m.once("load", resize);
    window.addEventListener("orientationchange", resize);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", resize);
    const clickCountry = (event: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      const country = countryResultFromMapClick(m, event);
      if (country) onCountrySelectRef.current?.(country);
    };
    m.on("click", clickCountry);
    m.on("touchend", clickCountry);
    return () => {
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resize);
      m.off("click", clickCountry);
      m.off("touchend", clickCountry);
      mk?.remove();
      m.remove();
    };
  }, []);


  useEffect(() => {
    if (!map || !onMapContextChange) return;
    const publishContext = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      onMapContextChange({ lat: center.lat, lng: center.lng, zoom });
    };
    publishContext();
    map.on("moveend", publishContext);
    map.on("zoomend", publishContext);
    return () => {
      map.off("moveend", publishContext);
      map.off("zoomend", publishContext);
    };
  }, [map, onMapContextChange]);

  useEffect(() => {
    if (!map || !resetSignal) return;
    const view = DEFAULT_MAP_VIEW[viewMode.current];
    camera.reset({ center: view.center, zoom: view.zoom, bearing: view.bearing, pitch: view.pitch });
    window.setTimeout(() => camera.resizeThenReapplyIntended(), view.duration + 80);
  }, [camera, map, resetSignal]);
  useEffect(() => {
    if (!map) return;
    if (lastStationId.current !== station.id) {
      lastStationId.current = station.id;
      if (mobile && keyboardOpen) {
        pendingStationGeo.current = geo;
        return;
      }
      const settleDelay = mobile ? 250 : 0;
      window.setTimeout(() => {
        map.resize();
        camera.selectStation(geo);
        window.setTimeout(() => map.resize(), 1000);
      }, settleDelay);
      return;
    }
    camera.remember();
  }, [camera, geo, keyboardOpen, map, mobile, station.id]);

  useEffect(() => {
    if (!map || !mobile || keyboardOpen || !pendingStationGeo.current) return;
    const nextGeo = pendingStationGeo.current;
    pendingStationGeo.current = null;
    const timer = window.setTimeout(() => {
      map.resize();
      camera.selectStation(nextGeo);
      window.setTimeout(() => map.resize(), 1000);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [camera, keyboardOpen, map, mobile]);

  useEffect(() => {
    if (!map) return;
    if (searchActive) {
      camera.beginSearch();
      camera.openResults();
      return;
    }
    camera.closeSearchWithoutSelection();
  }, [camera, map, searchActive]);
  if (mobile) {
    return (
      <div className="fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden bg-slate-950">
        <div ref={container} className="pointer-events-auto absolute inset-0 h-full w-full" />
        <MapMarkerController marker={marker} geo={geo} status={status} label={livingLabel} />
        <MapStyleController map={map} basemap={basemap} onResize={camera.resizeThenReapplyIntended} />
        <div className={`map-atmosphere-overlay tone-${geo.tone} status-${status} pointer-events-none absolute inset-0`} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
        <div className="day-night-terminator pointer-events-none absolute inset-y-0 w-1/2 opacity-55" />
        <div className="cloud-layer pointer-events-none absolute inset-0 opacity-25" />
        <div className="pointer-events-none absolute left-1/2 top-[45%] z-10 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-radio/15 bg-radio/5 blur-sm shadow-[0_0_80px_rgba(88,225,132,.18)]" />
        <BasemapControl value={basemap} onChange={setBasemap} mobile />
        <OpenStreetViewButton station={station} mobile />

      </div>
    );
  }
  return (
    <div className="relative h-full min-h-[620px] w-full overflow-hidden bg-slate-950 shadow-2xl">
      <div ref={container} className="pointer-events-auto absolute inset-0 h-full w-full" />
      <MapMarkerController marker={marker} geo={geo} status={status} label={livingLabel} />
      <MapStyleController map={map} basemap={basemap} onResize={camera.resizeThenReapplyIntended} />
      <div className={`map-atmosphere-overlay tone-${geo.tone} status-${status} pointer-events-none absolute inset-0`} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40" />
      <BasemapControl value={basemap} onChange={setBasemap} />
      <OpenStreetViewButton station={station} />
      <div className="pointer-events-none absolute left-6 top-20 z-20 rounded-full border border-white/15 bg-slate-950/55 px-3 py-1.5 font-mono text-[10px] font-semibold text-emerald-300 shadow-lg backdrop-blur-xl xl:left-8">
        <Signal className="mr-1.5 inline size-3" />
        GIS · Tap Earth to tune a place
      </div>
      <div className="pointer-events-none absolute bottom-28 right-6 z-20 hidden rounded-full border border-white/10 bg-slate-950/65 px-4 py-2 text-xs text-ivory/70 shadow-2xl backdrop-blur-xl lg:block xl:right-8">
        Current: {station.city || station.state || station.country}
      </div>
    </div>
  );
}


type WandererExperience = {
  intent: string;
  mood: string;
  narration: string;
  earthMood: string;
  season: string;
  localTime: string;
  temperature: number;
  presenceIndex: number;
  memoryLine: string;
};


const CONTINENT_BY_COUNTRY: Record<string, string> = { NG:'Africa', GH:'Africa', ZA:'Africa', KE:'Africa', EG:'Africa', MA:'Africa', SN:'Africa', TZ:'Africa', UG:'Africa', CM:'Africa', CD:'Africa', CG:'Africa', AO:'Africa', DZ:'Africa', BJ:'Africa', TG:'Africa', CI:'Africa', BW:'Africa', ZW:'Africa', NA:'Africa', MZ:'Africa', SL:'Africa', LR:'Africa', GA:'Africa', CV:'Africa', GB:'Europe', FR:'Europe', DE:'Europe', NL:'Europe', ES:'Europe', IT:'Europe', SE:'Europe', IE:'Europe', CH:'Europe', BE:'Europe', PT:'Europe', JP:'Asia', IN:'Asia', SG:'Asia', KR:'Asia', ID:'Asia', PH:'Asia', AE:'Asia', CN:'Asia', TH:'Asia', MY:'Asia', SA:'Asia', QA:'Asia', IL:'Asia', TR:'Asia', AU:'Oceania', NZ:'Oceania', FJ:'Oceania', PG:'Oceania', US:'North America', CA:'North America', MX:'North America', BR:'South America', AR:'South America', CL:'South America', CO:'South America', PE:'South America' };
const WANDER_VISITED_COUNTRIES = new Set<string>();
const WANDER_VISITED_CONTINENTS = new Set<string>();

function stationContinent(station: Station) { return CONTINENT_BY_COUNTRY[station.country_code] ?? 'Global'; }
function interleaveByContinent(stations: Station[]) {
  const groups = new globalThis.Map<string, Station[]>();
  for (const station of stations.filter((item) => item.is_active && item.url).sort((a, b) => b.health_score - a.health_score || b.votes - a.votes)) {
    const continent = stationContinent(station);
    groups.set(continent, [...(groups.get(continent) ?? []), station]);
  }
  const orderedContinents = ["Africa", "Europe", "Asia", "Oceania", "North America", "South America", "Global"];
  const interleaved: Station[] = [];
  for (let i = 0; i < 12; i += 1) {
    for (const continent of orderedContinents) {
      const station = groups.get(continent)?.[i];
      if (station) interleaved.push(station);
    }
  }
  return interleaved;
}

function diverseGlobalPool(stations: Station[], current: Station) {
  return interleaveByContinent(stations).filter((station) => station.id !== current.id);
}

const ARRIVAL_COMPLETED_SESSION_KEY = "waveatlas:arrival-completed";
const ARRIVAL_COMPLETED_EVENT = "waveatlas:arrival-completed";
const TELEPORT_HINT_KEY = "waveatlas_seen_teleport_hint";
const TELEPORT_HISTORY_KEY = "waveatlas_teleport_history";
const TELEPORT_HISTORY_ALIAS_KEYS = ["waveatlas.teleport.history.v1"];
const TELEPORT_HISTORY_SLICE_KEYS = { stationIds: "last25Stations", cities: "last10Cities", countries: "last5Countries", continents: "last3Continents", genres: "last10Genres", languages: "last10Languages" } as const;
type TeleportHistory = { countries: string[]; continents: string[]; cities: string[]; languages: string[]; genres: string[]; tags: string[]; stationIds: string[] };
const emptyTeleportHistory = (): TeleportHistory => ({ countries: [], continents: [], cities: [], languages: [], genres: [], tags: [], stationIds: [] });
function readTeleportHistory(): TeleportHistory {
  if (typeof window === "undefined") return emptyTeleportHistory();
  try {
    const raw = window.localStorage.getItem(TELEPORT_HISTORY_KEY) || TELEPORT_HISTORY_ALIAS_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean) || "{}";
    const parsed = { ...emptyTeleportHistory(), ...JSON.parse(raw) };
    return {
      ...parsed,
      stationIds: parsed.stationIds.length ? parsed.stationIds : JSON.parse(window.localStorage.getItem(TELEPORT_HISTORY_SLICE_KEYS.stationIds) || "[]"),
      cities: parsed.cities.length ? parsed.cities : JSON.parse(window.localStorage.getItem(TELEPORT_HISTORY_SLICE_KEYS.cities) || "[]"),
      countries: parsed.countries.length ? parsed.countries : JSON.parse(window.localStorage.getItem(TELEPORT_HISTORY_SLICE_KEYS.countries) || "[]"),
      continents: parsed.continents.length ? parsed.continents : JSON.parse(window.localStorage.getItem(TELEPORT_HISTORY_SLICE_KEYS.continents) || "[]"),
      genres: parsed.genres.length ? parsed.genres : JSON.parse(window.localStorage.getItem(TELEPORT_HISTORY_SLICE_KEYS.genres) || "[]"),
      languages: parsed.languages.length ? parsed.languages : JSON.parse(window.localStorage.getItem(TELEPORT_HISTORY_SLICE_KEYS.languages) || "[]"),
    };
  } catch { return emptyTeleportHistory(); }
}
function rememberJourneyStop(station: Station) {
  rememberTeleport(station);
  persistArrival(station, stationContinent(station), window.localStorage);
}

function rememberTeleport(station: Station) {
  if (typeof window === "undefined") return;
  const history = readTeleportHistory();
  const keep = <T,>(items: T[], size = 100) => items.slice(-size);
  const next = {
    countries: keep([...history.countries, station.country_code]),
    continents: keep([...history.continents, stationContinent(station)]),
    cities: keep([...history.cities, stationRegion(station).toLowerCase()]),
    languages: keep([...history.languages, ...stationLanguages(station)]),
    genres: keep([...history.genres, getPrimaryGenre(station).toLowerCase()]),
    tags: keep([...history.tags, ...station.tags.map((tag) => tag.toLowerCase())]),
    stationIds: keep([...history.stationIds, station.station_uuid || station.id]),
  };
  try {
    window.localStorage.setItem(TELEPORT_HISTORY_KEY, JSON.stringify(next));
    window.localStorage.setItem(TELEPORT_HISTORY_SLICE_KEYS.stationIds, JSON.stringify(keep(next.stationIds, 25)));
    window.localStorage.setItem(TELEPORT_HISTORY_SLICE_KEYS.cities, JSON.stringify(keep(next.cities, 10)));
    window.localStorage.setItem(TELEPORT_HISTORY_SLICE_KEYS.countries, JSON.stringify(keep(next.countries, 5)));
    window.localStorage.setItem(TELEPORT_HISTORY_SLICE_KEYS.continents, JSON.stringify(keep(next.continents, 3)));
    window.localStorage.setItem(TELEPORT_HISTORY_SLICE_KEYS.genres, JSON.stringify(keep(next.genres, 10)));
    window.localStorage.setItem(TELEPORT_HISTORY_SLICE_KEYS.languages, JSON.stringify(keep(next.languages, 10)));
  } catch { /* Teleport history is best-effort. */ }
}


function sameCountryCandidatePool(stations: Station[], anchor: Station) {
  return stations
    .filter((station) => station.id !== anchor.id && station.country_code === anchor.country_code && isValidCandidateLockStation(station) && station.is_active && station.failure_count <= 2)
    .sort((a, b) => b.health_score - a.health_score || b.votes - a.votes || b.click_count - a.click_count)
    .map((station) => ({ station, distanceKm: stationDistanceKm(anchor, station) ?? undefined, signalStrength: Math.max(65, station.health_score), metadata: buildCandidateMetadata(station) }))
    .slice(0, 12);
}


function isValidCandidateLockStation(station?: Station | null) {
  return Boolean(station?.id && station.name?.trim() && getStationStreamUrl(station));
}

function getCandidateLockAnchor(currentStation: Station | null | undefined, fallbackStations: Station[]): Station | null {
  if (isValidCandidateLockStation(currentStation)) return currentStation ?? null;
  return [...fallbackStations]
    .filter((station) => isValidCandidateLockStation(station) && station.is_active && station.failure_count <= 2)
    .sort((a, b) => b.health_score - a.health_score || b.votes - a.votes || b.click_count - a.click_count)[0] ?? null;
}

function stationRegion(station: Station) {
  return station.city?.trim() || station.state?.trim() || station.country?.trim() || "Unknown region";
}

function stationLanguages(station: Station) {
  return station.language.toLowerCase().split(/[,/]/).map((language) => language.trim()).filter(Boolean);
}

function clampUnitInterval(value: number) {
  return Math.min(1, Math.max(0, value));
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const haversine = clampUnitInterval(Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2);
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

function stationDistanceKm(a: Station, b: Station) {
  const aGeo = geotruth(a);
  const bGeo = geotruth(b);
  if (aGeo.lat === null || aGeo.lng === null || bGeo.lat === null || bGeo.lng === null) return null;
  return haversineKm({ lat: aGeo.lat, lng: aGeo.lng }, { lat: bGeo.lat, lng: bGeo.lng });
}

function buildCandidateMetadata(station: Station) {
  const geo = geotruth(station);
  return {
    name: station.name,
    country: station.country,
    cityRegion: stationRegion(station),
    genre: getPrimaryGenre(station),
    language: station.language,
    streamUrl: getStationStreamUrl(station),
    continent: stationContinent(station),
    coordinates: geo.lat !== null && geo.lng !== null ? { lat: geo.lat, lng: geo.lng } : null,
  };
}

function generateCandidateRoutes(anchor: Station, fallbackStations: Station[], explorationMode = false): SignalCandidate[] {
  const anchorGenre = getPrimaryGenre(anchor).toLowerCase();
  const anchorLanguages = stationLanguages(anchor);
  const anchorRegion = stationRegion(anchor).toLowerCase();
  const anchorContinent = stationContinent(anchor);
  const neighborNames = neighboringCountries[anchor.country_code] ?? [];
  const neighborSet = new Set(neighborNames.map((country) => country.toLowerCase()));
  return fallbackStations
    .filter((station) => station.id !== anchor.id && isValidCandidateLockStation(station) && station.is_active && station.failure_count <= 2)
    .map((station) => {
      const distanceKm = stationDistanceKm(anchor, station);
      const metadata = buildCandidateMetadata(station);
      let score = Math.min(25, Math.max(0, station.health_score) / 4);
      const stationGenre = metadata.genre.toLowerCase();
      const languages = stationLanguages(station);
      const region = stationRegion(station).toLowerCase();
      if (region && region === anchorRegion) score += 34;
      if (station.country_code && station.country_code === anchor.country_code) score += 28;
      if (metadata.continent === anchorContinent) score += 16;
      if (stationGenre && stationGenre === anchorGenre) score += 18;
      if (anchorLanguages.some((language) => languages.includes(language))) score += 16;
      if (distanceKm !== null) score += distanceKm <= 75 ? 24 : distanceKm <= 300 ? 16 : distanceKm <= 900 ? 8 : 0;
      if (neighborSet.has(station.country.toLowerCase())) score += 14;
      if (explorationMode && stationGenre !== anchorGenre) score += 8;
      if (explorationMode && metadata.continent !== anchorContinent) score += 6;
      return { station, distanceKm: distanceKm ?? undefined, signalStrength: Math.min(99, Math.round(score)), metadata };
    })
    .sort((a, b) => (b.signalStrength ?? 0) - (a.signalStrength ?? 0) || (a.distanceKm ?? Number.MAX_SAFE_INTEGER) - (b.distanceKm ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 12);
}

const WANDERER_MIN_INTERVAL_MS = 8 * 60 * 1000;
const WANDERER_MAX_INTERVAL_MS = 15 * 60 * 1000;
function nextWandererIntervalMs() { return WANDERER_MIN_INTERVAL_MS + Math.floor(Math.random() * (WANDERER_MAX_INTERVAL_MS - WANDERER_MIN_INTERVAL_MS + 1)); }

const WANDERER_INTENTS = [
  "Take me somewhere peaceful",
  "Take me somewhere rainy",
  "Take me somewhere Christian",
  "Take me somewhere French-speaking",
  "Take me somewhere I’ve never been",
  "Take me somewhere where people are waking up",
  "Take me somewhere busy",
  "Take me somewhere quiet",
  "Take me somewhere joyful",
  "Take me somewhere surprising",
];

function getSeasonForLat(lat: number | null) {
  const month = new Date().getUTCMonth();
  if (lat !== null && lat < 0) {
    return month >= 2 && month <= 4 ? "Autumn" : month >= 5 && month <= 7 ? "Winter" : month >= 8 && month <= 10 ? "Spring" : "Summer";
  }
  return month >= 2 && month <= 4 ? "Spring" : month >= 5 && month <= 7 ? "Summer" : month >= 8 && month <= 10 ? "Autumn" : "Winter";
}

function hourFromLongitude(lng: number | null) {
  const now = new Date();
  const offset = lng === null ? 0 : Math.round(lng / 15);
  return (now.getUTCHours() + offset + 24) % 24;
}

function getEarthMood(hour: number, temperature: number) {
  if (hour >= 5 && hour < 9) return "waking up";
  if (hour >= 9 && hour < 17) return temperature > 82 ? "sunlit and busy" : "alive and moving";
  if (hour >= 17 && hour < 21) return "winding down";
  return "quiet under night skies";
}

function getHumanPresenceIndex(station: Station, geo: GeoPoint) {
  const hour = hourFromLongitude(geo.lng);
  const health = Math.min(40, Math.max(0, station.health_score) * 0.4);
  const activity = hour >= 7 && hour <= 22 ? 35 : 18;
  const metadata = (station.language ? 8 : 0) + Math.min(17, station.tags.length * 4 + Math.round(station.votes / 100));
  return Math.min(100, Math.round(health + activity + metadata));
}

function getWandererExperience(station: Station, intent = "Take me somewhere surprising"): WandererExperience {
  const geo = geotruth(station);
  const hour = hourFromLongitude(geo.lng);
  const temperature = estimatedTemperature(geo);
  const season = getSeasonForLat(geo.lat);
  const localTime = localTimeFor(geo.lng);
  const city = station.state || station.city || station.country;
  const genre = getPrimaryGenre(station);
  const presenceIndex = getHumanPresenceIndex(station, geo);
  const earthMood = getEarthMood(hour, temperature);
  const mood = hour >= 20 || hour < 5 ? "night signal" : hour < 11 ? "morning presence" : hour < 17 ? "daylight pulse" : "evening memory";
  return {
    intent,
    mood,
    localTime,
    season,
    temperature,
    presenceIndex,
    earthMood,
    narration: `${stationTimeCopy(station)} It is ${localTime}. The Earth mood is ${earthMood}. We’ll experience ${station.country} through ${station.name}.`,
    memoryLine: `${city} · ${station.country} · ${season} · ${temperature}°F · ${genre}`,
  };
}

function chooseWonderStation(stations: Station[], current: Station, intent: string) {
  const lower = intent.toLowerCase();
  const currentIndex = Math.max(0, stations.findIndex((station) => station.id === current.id));
  const rotated = [...stations.slice(currentIndex + 1), ...stations.slice(0, currentIndex + 1)].filter((station) => station.id !== current.id && station.is_active && station.url);
  const globalFallback = diverseGlobalPool(stations, current);
  const matches = rotated.filter((station) => {
    const haystack = `${station.name} ${station.country} ${station.country_code} ${station.language} ${station.tags.join(" ")}`.toLowerCase();
    const continent = stationContinent(station);
    const hour = hourFromLongitude(geotruth(station).lng);
    if (lower.includes("unvisited country")) return !WANDER_VISITED_COUNTRIES.has(station.country_code);
    if (lower.includes("unvisited continent")) return !WANDER_VISITED_CONTINENTS.has(continent);
    if (lower.includes("spiritual") || lower.includes("christian")) return /christian|gospel|worship|islamic|religious|sermon/.test(haystack) || ['NG','GH','CD','ZA','BR','PH','US'].includes(station.country_code);
    if (lower.includes("busy")) return /tokyo|london|paris|lagos|mumbai|delhi|são paulo|sao paulo|new york|johannesburg|news|hits/.test(haystack) || ['JP','GB','FR','NG','IN','BR','US','ZA'].includes(station.country_code) || station.click_count > 500 || station.votes > 100;
    if (lower.includes("peaceful") || lower.includes("quiet")) return /classical|ambient|jazz|easy|chill|calm|lounge|sleep|nature/.test(haystack);
    if (lower.includes("rainy")) return /rain|ambient|jazz|chill|lounge/.test(haystack) || ['GB','IE','NL','BE','BR','ID','JP'].includes(station.country_code);
    if (lower.includes("falling asleep")) return hour >= 21 || hour < 1;
    if (lower.includes("waking")) return hour >= 5 && hour < 9;
    if (lower.includes("joyful")) return /pop|dance|gospel|hits|salsa|afro|music/.test(haystack);
    return true;
  });
  const destination = matches[0] ?? globalFallback[0] ?? rotated[0] ?? current;
  WANDER_VISITED_COUNTRIES.add(destination.country_code);
  WANDER_VISITED_CONTINENTS.add(stationContinent(destination));
  return destination;
}

async function fetchTeleportPool(anchor: Station, recent: TeleportHistory, signal?: AbortSignal) {
  const params = new URLSearchParams({ global: "true", limit: "25", anchor: JSON.stringify(anchor), recent: JSON.stringify(recent), journey: "teleport" });
  const res = await fetch(`/api/stations/nearby?${params.toString()}`, { signal });
  const data = res.ok ? ((await res.json()) as { candidates?: SignalCandidate[] }) : { candidates: [] };
  return data.candidates?.map((item) => item.station).filter(Boolean) ?? [];
}

function refreshTeleportPoolInBackground(anchor: Station, recent: TeleportHistory) {
  void fetchTeleportPool(anchor, recent)
    .then((queue) => {
      if (queue.length) teleportPoolCache = { anchorKey: stationKey(anchor), stations: queue, expires: Date.now() + TELEPORT_POOL_TTL_MS };
    })
    .catch(() => {
      // Teleport prefetch is best-effort; local pools keep the UI responsive.
    });
}

async function resolveTeleportDestination(stations: Station[], current: Station) {
  const player = usePlayer.getState();
  const anchor = getCandidateLockAnchor(player.current ?? current, stations) ?? current;
  const arrivalStation = player.arrivalStation;
  const recent = readTeleportHistory();
  const anchorKey = stationKey(anchor);
  const cachedQueue = teleportPoolCache?.anchorKey === anchorKey && teleportPoolCache.expires > Date.now() ? teleportPoolCache.stations : [];
  debugTeleport("request", {
    anchor: { name: anchor.name, country: anchor.country_code, continent: stationContinent(anchor) },
    cachedPoolSize: cachedQueue.length,
    arrivalContextPresentAndIgnored: Boolean(arrivalStation),
    forbiddenDefaultsOmitted: ["countryCode", "continent", "arrivalStation", "mapFocus"],
  });
  if (cachedQueue.length) {
    refreshTeleportPoolInBackground(anchor, recent);
    return { station: cachedQueue[0], queue: cachedQueue };
  }
  activeTeleportController?.abort();
  const controller = new AbortController();
  activeTeleportController = controller;
  try {
    const queue = await fetchTeleportPool(anchor, recent, controller.signal);
    if (activeTeleportController === controller && queue.length) teleportPoolCache = { anchorKey, stations: queue, expires: Date.now() + TELEPORT_POOL_TTL_MS };
    debugTeleport("candidates", {
      poolSize: queue.length,
      byContinent: queue.reduce<Record<string, number>>((acc, station) => { const continent = stationContinent(station); acc[continent] = (acc[continent] ?? 0) + 1; return acc; }, {}),
      top10: queue.slice(0, 10).map((station) => ({ name: station.name, country: station.country_code, continent: stationContinent(station) })),
    });
    const selected = queue[0] ?? chooseWonderStation(stations, anchor, "Take me somewhere surprising");
    debugTeleport("selected", { station: selected.name, country: selected.country_code, continent: stationContinent(selected), queuedFallbacks: Math.max(0, queue.length - 1) });
    return { station: selected, queue };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const fallback = chooseWonderStation(stations, anchor, "Take me somewhere surprising");
    debugTeleport("fallback", { reason: error instanceof Error ? error.message : "request_failed", station: fallback.name, country: fallback.country_code, continent: stationContinent(fallback) });
    return { station: fallback, queue: diverseGlobalPool(stations, anchor) };
  }
}

async function resolveGlobalJourneyDestination(stations: Station[], current: Station, intent: string) {
  const anchor = getCandidateLockAnchor(usePlayer.getState().current ?? current, stations) ?? current;
  try {
    const params = new URLSearchParams({ global: "true", limit: "24", anchor: JSON.stringify(anchor), recent: JSON.stringify(readTeleportHistory()), journey: "wanderer" });
    const res = await fetch(`/api/stations/nearby?${params.toString()}`);
    const data = res.ok ? ((await res.json()) as { candidates?: SignalCandidate[] }) : { candidates: [] };
    const globalStations = data.candidates?.map((item) => item.station) ?? [];
    return chooseWonderStation([...globalStations, ...stations], current, intent);
  } catch {
    return chooseWonderStation(stations, current, intent);
  }
}

function TakeMeSomewhereButton({ stations, current, onTravel }: { stations: Station[]; current: Station; onTravel?: (intent: string) => void }) {
  const travel = () => {
    const intent = WANDERER_INTENTS[Math.floor(Math.random() * WANDERER_INTENTS.length)];
    void resolveGlobalJourneyDestination(stations, current, intent).then((destination) => {
      rememberJourneyStop(destination);
      setCurrentStationAndDestination(destination, "wanderer");
    });
    onTravel?.(intent);
  };
  return <button onClick={travel} className="group rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-sm font-medium text-ivory shadow-xl backdrop-blur-xl transition hover:border-gold/40"><Globe2 className="mr-2 inline size-5 transition group-hover:rotate-12" />🌎 Take Me Somewhere™</button>;
}

function NowPlaying({
  station,
  stations,
  setQuery,
}: {
  station: Station;
  stations: Station[];
  setQuery: (q: string) => void;
}) {
  const {
    current,
    playing,
    status,
    error,
    toggle,
    volume,
    setVolume,
    setStation,
  } = usePlayer();
  const handlePrimaryPlayback = () => {
    if (!current) setCurrentStationAndDestination(station);
    else toggle();
  };
  return (
    <aside className="glass rounded-[2rem] p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-[12px] font-semibold text-radio">
            Now playing
          </p>
          <h2 className="mt-2 font-display text-[28px] font-bold leading-tight">{station.name}</h2>
          <p className="mt-2 flex items-center gap-2 text-ivory/70">
            <MapPin size={16} />
            {station.country} · {station.language}
          </p>
        </div>
        <SignalMeter score={station.health_score} />
      </div>
      <div className="my-6 grid grid-cols-3 gap-3 text-center font-mono text-xs">
        <span className="rounded-2xl bg-white/5 p-3">{station.codec}</span>
        <span className="rounded-2xl bg-white/5 p-3">
          {station.bitrate || "Live"} kbps
        </span>
        <span className="rounded-2xl bg-white/5 p-3 text-radio">{status}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handlePrimaryPlayback}
          className="min-h-14 rounded-full bg-radio px-7 font-medium text-midnight"
        >
          {playing ? (
            <Pause className="mr-2 inline" />
          ) : (
            <Play className="mr-2 inline" />
          )}
          {playing ? "Pause" : status === "blocked" ? "Tap to Play" : "Play"}
        </button>
        <button className="rounded-full border border-white/15 p-4">
          <Heart />
        </button>
        <button className="rounded-full border border-white/15 p-4">
          <Link />
        </button>
        <Volume2 />
        <input
          aria-label="Volume"
          type="range"
          min="0"
          max="1"
          step=".01"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
      {error ? (
        <p className={`mt-4 rounded-2xl border p-3 text-sm ${status === "buffering" ? "border-sky/30 bg-sky/10 text-sky" : status === "blocked" ? "border-gold/30 bg-gold/10 text-gold" : "border-red-400/30 bg-red-950/40 text-red-100"}`}>
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2"><SaveStationButton station={station} /><ShareStationButton station={station} /></div>
    </aside>
  );
}

function MobileHeaderCard({ viewportOffsetTop = 0, onOpenSearch, onOpenSettings }: { viewportOffsetTop?: number; onOpenSearch: () => void; onOpenSettings: () => void }) {
  return (
    <div style={{ top: viewportOffsetTop }} className="pointer-events-none fixed inset-x-0 z-40 pt-[calc(env(safe-area-inset-top)+12px)]">
      <div className="mx-4 flex items-center justify-between gap-3">
        <b className="pointer-events-auto rounded-full border border-white/10 bg-slate-950/45 px-3 py-2 font-display text-[18px] font-bold leading-none text-ivory shadow-xl backdrop-blur-2xl">
          WaveAtlas™
        </b>
        <button type="button" onClick={onOpenSettings} className="pointer-events-auto grid size-11 place-items-center rounded-full border border-white/10 bg-slate-950/45 text-ivory shadow-xl backdrop-blur-2xl transition hover:border-radio/30 hover:text-radio" aria-label="Open settings">
          <Settings className="size-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={onOpenSearch}
        className="pointer-events-auto mx-auto mt-3 flex h-14 w-[min(700px,90vw)] items-center gap-3 rounded-full border border-white/15 bg-slate-950/45 px-5 text-left shadow-[0_18px_60px_rgba(0,0,0,.35)] backdrop-blur-2xl"
        aria-label="Open station search"
      >
        <Search className="size-4 shrink-0 text-sky" />
        <span className="min-w-0 flex-1 truncate text-sm text-ivory/60">Search country, city, destination...</span>
      </button>
    </div>
  );
}

function CountryAutocomplete({
  query,
  onSelect,
  compact = false,
}: {
  query: string;
  onSelect: (country: CountryResult) => void;
  compact?: boolean;
}) {
  const [countries, setCountries] = useState<CountryResult[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/countries/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as { countries: CountryResult[] };
        setCountries(data.countries);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);
  if (query.trim().length < 2 || !countries.length) return null;
  return (
    <div className={`${compact ? "fixed left-4 right-4 top-[132px] z-40" : "mt-3"} overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur-xl`}>
      {countries.slice(0, 6).map((country) => (
        <button key={country.code} onClick={() => onSelect(country)} className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-left last:border-b-0 hover:bg-white/10">
          <span className="flex items-center gap-3"><span className="font-display text-xl">{country.flag}</span><span><b className="block text-sm">{country.name}</b><span className="text-xs text-ivory/50">{country.code} · {country.station_count.toLocaleString()} stations</span></span></span>
          <MapPin className="size-4 text-gold" />
        </button>
      ))}
    </div>
  );
}


function SearchResultStationCard({ station, onSelect }: { station: Station; onSelect: (station: Station) => void }) {
  const health = getStreamHealth(station);
  const location = [station.state || station.city, station.country].filter(Boolean).join(" · ");
  return <button onClick={() => onSelect(station)} className="mb-3 w-full rounded-[18px] border border-white/[0.08] bg-[rgba(20,28,42,0.82)] p-4 text-left shadow-lg transition active:scale-[0.99] hover:border-gold/50 hover:bg-[rgba(28,38,58,0.9)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-base font-medium text-[#F8FAFC]">{station.name}</b><p className="mt-1 text-xs font-medium text-white/[0.72]">{location || "Global"} · {station.language || "Unknown language"}</p></div><span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-300"><span className={`mr-1 inline-block size-2 rounded-full ${health.dot}`} />{health.label}</span></div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-[#E5E7EB]">{station.codec || "Unknown codec"}</span><span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-[#E5E7EB]">{station.bitrate ? `${station.bitrate} kbps` : "Live stream"}</span><span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-[#E5E7EB]">{station.country_code}</span>{station.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-[#E5E7EB]">{tag}</span>)}</div></button>;
}
function GroupedSearchResults({ query, stations, onStationSelect, onCountrySelect, setQuery, compact = false }: { query: string; stations: Station[]; onStationSelect: (station: Station) => void; onCountrySelect: (country: CountryResult) => void; setQuery: (q: string) => void; compact?: boolean }) {
  const [remoteStations, setRemoteStations] = useState<Station[]>([]);
  const [countries, setCountries] = useState<CountryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultMeta, setResultMeta] = useState<{ query: string; intent?: string; countryCode?: string; countryName?: string; totalAvailable?: number; limit?: number; offset?: number } | null>(null);
  const [visibleSearchCount, setVisibleSearchCount] = useState(24);
  const activeSearchRequestId = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      activeSearchRequestId.current += 1;
      window.setTimeout(() => { setRemoteStations([]); setCountries([]); setResultMeta(null); setVisibleSearchCount(24); }, 0);
      return;
    }
    const requestId = ++activeSearchRequestId.current;
    window.setTimeout(() => {
      if (requestId === activeSearchRequestId.current) {
        setRemoteStations([]);
        setCountries([]);
        setResultMeta({ query: q.toLowerCase() });
      }
    }, 0);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const [stationRes, countryRes] = await Promise.all([
            fetch(`/api/stations/search?q=${encodeURIComponent(q)}&limit=500`, { signal: controller.signal }),
          fetch(`/api/countries/search?q=${encodeURIComponent(q)}`, { signal: controller.signal }),
        ]);
        if (requestId !== activeSearchRequestId.current) return;
        if (stationRes.ok) {
          const data = (await stationRes.json()) as { query?: string; intent?: string; countryCode?: string; countryName?: string; totalAvailable?: number; limit?: number; offset?: number; stations: Station[] };
          const currentQuery = query.trim().toLowerCase();
          if ((data.query ?? currentQuery) === currentQuery) {
            const scopedStations = data.intent === "country" && data.countryCode ? data.stations.filter((station) => station.country_code === data.countryCode) : data.stations;
            setResultMeta({ query: data.query ?? currentQuery, intent: data.intent, countryCode: data.countryCode, countryName: data.countryName, totalAvailable: data.totalAvailable ?? scopedStations.length, limit: data.limit, offset: data.offset });
            setRemoteStations(scopedStations);
            setVisibleSearchCount(24);
          }
        }
        if (countryRes.ok && requestId === activeSearchRequestId.current) setCountries(((await countryRes.json()) as { countries: CountryResult[] }).countries);
      } finally { if (!controller.signal.aborted && requestId === activeSearchRequestId.current) setLoading(false); }
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);
  const q = query.trim().toLowerCase();
  const localMatches = stations.filter((s) => `${s.name} ${s.country} ${s.language} ${s.tags.join(" ")}`.toLowerCase().includes(q));
  const countryIntentActive = resultMeta?.intent === "country" && resultMeta.query === q;
  const allStationResults = remoteStations.length || countryIntentActive ? remoteStations : localMatches;
  const stationResults = allStationResults.slice(0, visibleSearchCount);
  const canLoadMoreSearch = allStationResults.length > stationResults.length;
  const genres = Array.from(new Set(stations.flatMap((s) => s.tags).filter((tag) => tag.toLowerCase().includes(q)))).slice(0, 8);
  const languages = Array.from(new Set(stations.map((s) => s.language).filter((language) => language && language.toLowerCase().includes(q)))).slice(0, 8);
  if (query.trim().length < 2) return null;
  return <div className="rounded-3xl border border-white/[0.12] bg-[rgba(8,17,29,0.82)] p-3 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-[18px] [backdrop-filter:blur(18px)_saturate(1.15)]"><div className="mb-3 flex items-center justify-between px-1"><p className="font-display text-xs font-semibold text-gold">{countryIntentActive && resultMeta?.countryName ? `Stations in ${resultMeta.countryName}` : "Destination results"}{allStationResults.length ? ` · ${stationResults.length}/${resultMeta?.totalAvailable ?? allStationResults.length}` : ""}</p>{loading ? <span className="text-xs font-semibold text-sky">{countryIntentActive && resultMeta?.countryName ? `Acquiring ${resultMeta.countryName} signals…` : "Searching…"}</span> : null}</div><div className={`grid gap-3 ${compact ? "" : "lg:grid-cols-[1.25fr_.75fr]"}`}><div>{stationResults.length ? <>{stationResults.map((station) => <SearchResultStationCard key={station.id} station={station} onSelect={onStationSelect} />)}{canLoadMoreSearch ? <button type="button" onClick={() => setVisibleSearchCount((count) => count + 24)} className="mt-2 w-full rounded-full bg-radio px-5 py-3 font-medium text-midnight">Load More results</button> : null}</> : <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm font-medium text-slate-300">{countryIntentActive && resultMeta?.countryName ? `No active stations found for ${resultMeta.countryName} yet. Try Load More, check another genre, or let Station Steward Agent refresh this region.` : "No active station found. Try country or genre search."}</p>}</div><div className="grid content-start gap-3"><SearchGroup title="Countries" items={countries.slice(0, 6).map((c) => ({ key: c.code, label: `${c.flag} ${c.name}`, meta: `${c.station_count.toLocaleString()} stations`, action: () => onCountrySelect(c) }))} /><SearchGroup title="Genres" items={genres.map((g) => ({ key: g, label: g, meta: "Search format", action: () => setQuery(g) }))} /><SearchGroup title="Languages" items={languages.map((l) => ({ key: l, label: l, meta: "Search language", action: () => setQuery(l) }))} /></div></div></div>;
}
function SearchGroup({ title, items }: { title: string; items: { key: string; label: string; meta: string; action: () => void }[] }) {
  return <div className="rounded-3xl border border-white/[0.08] bg-[rgba(20,28,42,0.82)] p-4 shadow-lg"><p className="font-display text-xs font-semibold text-gold">{title}</p><div className="mt-3 space-y-2">{items.length ? items.map((item) => <button key={item.key} onClick={item.action} className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-left text-[#E5E7EB] hover:border-sky/40 hover:bg-white/[0.1]"><span><b className="block text-sm">{item.label}</b><span className="text-xs text-white/[0.72]">{item.meta}</span></span><MapPin className="size-4 text-gold" /></button>) : <p className="text-sm text-ivory/45">No matches yet.</p>}</div></div>;
}
type SignalCandidate = { station: Station; distanceKm?: number; signalStrength?: number; metadata?: ReturnType<typeof buildCandidateMetadata> };

type SignalDialProps = {
  mapContext: MapTeleportContext | null;
  selectedCountry?: CountryResult | null;
  stations: Station[];
  current: Station;
  mobile?: boolean;
  onStationResolved?: (station: Station) => void;
  compact?: boolean;
};

function SignalCandidatePreview({ candidate, state, anchor, onTune, onNext }: { candidate: SignalCandidate | null; state: "idle" | "teleporting" | "found" | "none"; anchor: Station | null; onTune: () => void; onNext: () => void }) {
  if (state === "idle") return null;
  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="fixed bottom-[166px] left-4 right-4 z-50 rounded-3xl border border-white/10 bg-slate-950/92 p-3 text-white shadow-2xl backdrop-blur-xl md:absolute md:bottom-4 md:left-auto md:right-4 md:w-80">
    <p className="font-display text-xs font-semibold text-gold">{state === "teleporting" ? "Teleporting" : state === "none" ? "No destination" : "Destination found"}</p>
    {anchor && state !== "none" ? <p className="mt-1 text-xs font-semibold text-ivory/80">Locked on {anchor.name}. Maximizing distance, culture, genre, and country diversity.</p> : null}
    {candidate ? <div className="mt-2 flex items-center justify-between gap-3"><div className="min-w-0"><b className="block truncate text-sm">{candidate.station.name}</b><p className="truncate text-xs text-ivory/65">{teleportCopy(candidate.station)} · {candidate.signalStrength ?? candidate.station.health_score}% confidence</p></div><div className="flex shrink-0 gap-2"><button onClick={onNext} className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-ivory">Next</button><button onClick={onTune} className="rounded-full bg-radio px-3 py-2 text-xs font-medium text-midnight">Lock</button></div></div> : <p className="mt-2 text-sm text-ivory/70">No verified destination matched this map focus. Try another country or long-press for Wander.</p>}
  </motion.div>;
}

function SignalDial({ mapContext, selectedCountry, stations, current, mobile = false, compact = false, onStationResolved, onWander }: SignalDialProps & { onWander?: () => void }) {
  const [state, setState] = useState<"idle" | "teleporting" | "found" | "none">("idle");
  const [candidates, setCandidates] = useState<SignalCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const [showTeleportHint, setShowTeleportHint] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const playbackStatus = usePlayer((player) => player.status);
  const timer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const candidate = candidates[index] ?? null;
  const pulseActive = !prefersReducedMotion && (playbackStatus === "idle" || playbackStatus === "playing") && state === "idle";
  const lockAnchor = useMemo(() => getCandidateLockAnchor(current, stations), [current, stations]);
  useEffect(() => {
    if (compact || !pulseActive || typeof window === "undefined" || window.localStorage.getItem(TELEPORT_HINT_KEY)) return;
    window.localStorage.setItem(TELEPORT_HINT_KEY, "true");
    const showTimer = window.setTimeout(() => setShowTeleportHint(true), 0);
    const hideTimer = window.setTimeout(() => setShowTeleportHint(false), 3500);
    return () => { window.clearTimeout(showTimer); window.clearTimeout(hideTimer); };
  }, [compact, pulseActive]);
  const fallbackCandidates = useCallback((anchor: Station | null, explorationMode = false) => {
    const globalPool = interleaveByContinent(stations).filter((station) => station.id !== anchor?.id);
    if (!anchor || !selectedCountry) {
      return globalPool.map((station) => ({ station, signalStrength: Math.max(70, station.health_score), metadata: buildCandidateMetadata(station) })).slice(0, 18);
    }
    const localRoutes = generateCandidateRoutes(anchor, stations, explorationMode);
    if (localRoutes.length) return localRoutes;
    const countryRoutes = sameCountryCandidatePool(stations, anchor);
    if (countryRoutes.length || !explorationMode) return countryRoutes;
    return globalPool.map((station) => ({ station, signalStrength: station.health_score, metadata: buildCandidateMetadata(station) })).slice(0, 18);
  }, [selectedCountry, stations]);
  const teleport = useCallback(async (wander = false) => {
    if (state === "teleporting") return;
    const anchor = getCandidateLockAnchor(usePlayer.getState().current ?? current, stations);
    setState("teleporting");
    let next = fallbackCandidates(anchor, wander);
    if (!selectedCountry) {
      try {
        const params = new URLSearchParams({ global: "true", limit: "25", anchor: JSON.stringify(anchor), recent: JSON.stringify(readTeleportHistory()) });
        const res = await fetch(`/api/stations/nearby?${params.toString()}`);
        const data = res.ok ? ((await res.json()) as { candidates?: SignalCandidate[] }) : { candidates: [] };
        next = data.candidates?.length ? data.candidates : next;
      } catch {
        // Local interleaved stations preserve global teleporting when Radio Browser is unavailable.
      }
    }
    setCandidates(next);
    setIndex(0);
    setState(next.length ? "found" : "none");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 8000);
  }, [current, fallbackCandidates, selectedCountry, stations, state]);
  const tune = () => {
    if (!candidate) return;
    commitTeleportStation(candidate.station, candidates.map((item) => item.station));
    onStationResolved?.(candidate.station);
    setState("idle");
  };
  return <>
    <motion.div animate={{ scale: compact ? 0.65 : 1 }} transition={{ type: "spring", damping: 24, stiffness: 260 }} className={`${mobile ? "fixed bottom-[172px] right-5 z-50 origin-bottom-right" : "absolute bottom-5 right-5 z-40 origin-bottom-right"}`}>
      <button type="button" aria-label="Take me somewhere unexpected." title="Take me somewhere unexpected." disabled={state === "teleporting"} onClick={() => { if (longPressTriggered.current) { longPressTriggered.current = false; return; } void teleport(false); }} onContextMenu={(e) => { e.preventDefault(); onWander?.(); }} onPointerDown={() => { if (timer.current) window.clearTimeout(timer.current); longPressTriggered.current = false; timer.current = window.setTimeout(() => { longPressTriggered.current = true; onWander?.(); }, 650); }} onPointerUp={() => { if (timer.current) window.clearTimeout(timer.current); }} className="group relative grid size-20 place-items-center rounded-full border border-white/15 bg-slate-950/80 text-white shadow-[0_24px_80px_rgba(0,0,0,.45)] backdrop-blur-xl transition duration-300 hover:border-radio/40 hover:bg-slate-950/90">
        {pulseActive ? <motion.span aria-hidden className="pointer-events-none absolute inset-[-10px] rounded-full border border-[rgba(0,214,143,0.35)] shadow-[0_0_28px_rgba(0,214,143,0.22)]" initial={{ scale: 1, opacity: 0.45 }} animate={{ scale: [1, 1.08], opacity: [0.45, 0] }} transition={{ repeat: Infinity, duration: 2.8, ease: "easeOut" }} /> : null}
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_48%,rgba(88,225,132,.18),transparent_46%)]" />
        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 8, ease: "linear" }} className="absolute inset-1 rounded-full bg-[conic-gradient(from_90deg,rgba(88,225,132,.95),rgba(88,225,132,.25),rgba(255,255,255,.08),rgba(88,225,132,.95))] opacity-80" />
        <span className="absolute inset-[6px] rounded-full bg-slate-950/95 shadow-inner" />
        <Plane className="relative size-7 text-radio drop-shadow-[0_0_14px_rgba(88,225,132,.75)] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </button>
      <AnimatePresence>{showTeleportHint ? <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-3 rounded-full border border-radio/20 bg-slate-950/90 px-3 py-1.5 text-center text-xs font-medium text-radio shadow-xl backdrop-blur-xl">Tap Teleport to land somewhere new.</motion.p> : null}</AnimatePresence>
      <AnimatePresence>{!compact ? <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-3 flex flex-col items-center gap-2 font-sans">
        <span className="text-xs font-medium tracking-normal text-ivory/75">Teleport</span>
        <div className="flex justify-center gap-2 text-xs font-medium text-ivory/75">
          <button type="button" disabled={state === "teleporting"} onClick={() => void teleport(false)} className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 transition hover:border-radio/30 hover:bg-radio/10 hover:text-white">✈ Teleport</button>
          <button type="button" onClick={() => setIndex((n) => candidates.length ? (n + 1) % candidates.length : 0)} className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 transition hover:border-radio/30 hover:bg-radio/10 hover:text-white">⟳ Next</button>
          <button type="button" onClick={tune} className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 transition hover:border-radio/30 hover:bg-radio/10 hover:text-white">📍 Lock</button>
        </div>
      </motion.div> : null}</AnimatePresence>
    </motion.div>
    <AnimatePresence><SignalCandidatePreview candidate={candidate} state={state} anchor={lockAnchor} onTune={tune} onNext={() => setIndex((n) => candidates.length ? (n + 1) % candidates.length : 0)} /></AnimatePresence>
  </>;
}

function MobileSearchCommandOverlay({ open, query, setQuery, stations, onClose, onCountrySelect, onStationSelect }: { open: boolean; query: string; setQuery: (q: string) => void; stations: Station[]; onClose: () => void; onCountrySelect: (country: CountryResult) => void; onStationSelect: (station: Station) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        inputRef.current?.blur();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  const closeWithBlur = () => {
    inputRef.current?.blur();
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[9999] flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-[rgba(8,17,29,0.86)] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+14px)] text-white backdrop-blur-2xl md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Search stations"
        >
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-full border border-white/15 bg-white/[0.06] px-4 shadow-2xl">
              <Search className="size-4 shrink-0 text-sky" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search country, city, destination..."
                className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-ivory/45"
              />
            </label>
            <button type="button" onClick={closeWithBlur} className="grid size-12 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-ivory" aria-label="Close search">
              ×
            </button>
          </div>
          <button type="button" onClick={closeWithBlur} className="mt-3 self-end rounded-full px-3 py-1.5 text-sm font-medium text-sky">
            Cancel
          </button>
          <div className="atlas-drawer-scroll mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
            <GroupedSearchResults
              query={query}
              stations={stations}
              onStationSelect={(station) => {
                inputRef.current?.blur();
                onStationSelect(station);
              }}
              onCountrySelect={(country) => {
                inputRef.current?.blur();
                onCountrySelect(country);
              }}
              setQuery={setQuery}
            />
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}


type AtlasToastKind = "status" | "alert";
type AtlasToastEventDetail = { title: string; subtitle?: string; kind?: AtlasToastKind; id?: string };

const ATLAS_TOAST_EVENT = "waveatlas:atlas-toast";
const ATLAS_TOAST_DURATION_MS = 6000;

function uniqueToastParts(parts: Array<string | undefined>) {
  const seen = new Set<string>();
  return parts.map((part) => part?.trim()).filter((part): part is string => {
    if (!part) return false;
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titleCaseTag(tag: string) {
  return tag.replace(/[\-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function stationPlaceLabel(station: Station) {
  return [station.city || station.state, station.country].filter(Boolean).join(", ") || station.country || "Earth";
}

function buildAtlasToast(station: Station, override?: Partial<AtlasToastEventDetail>): AtlasToastEventDetail {
  const languages = uniqueToastParts((station.language || "").split(/[,/•]+/).map((language) => language.trim())).slice(0, 2);
  const languageLine = languages.length ? languages.join(" • ") : undefined;
  const soundTags = station.tags.filter((tag) => !["ariyo-ai-seed", "waveatlas-curated", "curators-picks", "verified"].includes(tag.toLowerCase())).slice(0, 2).map(titleCaseTag);
  const soundLine = soundTags.length ? soundTags.join(" • ") : getPrimaryGenre(station);
  const signalLine = station.tags.some((tag) => tag.toLowerCase() === "ariyo-ai-seed") || station.curation_source?.toLowerCase().includes("ariyo")
    ? "Ariyo AI Seed Atlas"
    : isCuratedStation(station)
      ? "Curator's Picks"
      : undefined;
  return {
    title: `You've landed in ${stationPlaceLabel(station)}.`,
    subtitle: uniqueToastParts([languageLine, soundLine, signalLine]).slice(0, 3).join(" • "),
    kind: "status",
    id: `station-${stationKey(station)}`,
    ...override,
  };
}

function dispatchAtlasToast(detail: AtlasToastEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AtlasToastEventDetail>(ATLAS_TOAST_EVENT, { detail }));
}

function AtlasToast({ station, mobile = false }: { station: Station; mobile?: boolean }) {
  const reducedMotion = useReducedMotion();
  const playerStatus = usePlayer((state) => state.status);
  const playerError = usePlayer((state) => state.error);
  const source = usePlayer((state) => state.stationSelectionSource);
  const [toast, setToast] = useState<AtlasToastEventDetail>(() => buildAtlasToast(station));
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const toastKey = toast.id ?? `${toast.title}-${toast.subtitle ?? ""}`;

  useEffect(() => {
    const titlePrefix = source === "fallback" ? "Signal unavailable. Trying another station." : undefined;
    window.queueMicrotask(() => {
      setToast(buildAtlasToast(station, titlePrefix ? { title: titlePrefix, kind: "alert", id: `fallback-${stationKey(station)}-${Date.now()}` } : undefined));
      setVisible(true);
      setPaused(false);
    });
  }, [source, station.station_uuid, station.id, station]);

  useEffect(() => {
    if (playerStatus !== "failed" || !playerError) return;
    window.queueMicrotask(() => {
      setToast({ title: playerError.includes("No live signal") || playerError.includes("Teleport could not") ? "Signal unavailable. Trying another station." : playerError, subtitle: playerError.includes("No live signal") ? "Try Teleport or Add Your Signal." : undefined, kind: "alert", id: `error-${Date.now()}` });
      setVisible(true);
      setPaused(false);
    });
  }, [playerError, playerStatus]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<AtlasToastEventDetail>).detail;
      if (!detail?.title) return;
      setToast({ kind: "status", id: `custom-${Date.now()}`, ...detail });
      setVisible(true);
      setPaused(false);
    };
    window.addEventListener(ATLAS_TOAST_EVENT, onToast);
    return () => window.removeEventListener(ATLAS_TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!visible || paused) return;
    const timer = window.setTimeout(() => setVisible(false), ATLAS_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [paused, toastKey, visible]);

  return (
    <AnimatePresence mode="wait">
      {visible ? (
        <motion.section
          key={toastKey}
          role={toast.kind === "alert" ? "alert" : "status"}
          aria-live={toast.kind === "alert" ? "assertive" : "polite"}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className={`${mobile ? "fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+174px)] z-[58] mx-auto w-[calc(100vw-32px)]" : "fixed bottom-28 left-1/2 z-[58] w-[min(380px,calc(100vw-32px))] -translate-x-1/2"} pointer-events-auto max-h-[92px] min-h-[52px] max-w-[380px] overflow-hidden rounded-[18px] border border-white/[0.10] bg-[rgba(8,17,29,0.88)] px-4 py-3 text-[#F8FAFC] shadow-[0_14px_42px_rgba(0,0,0,0.35)] backdrop-blur-[16px] [backdrop-filter:blur(16px)_saturate(1.15)]`}
          aria-label="Station notification"
        >
          <div className="flex items-start gap-3">
            <Compass className="mt-0.5 size-4 shrink-0 text-[#D4A64A]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-5 tracking-[-0.01em] text-[#F8FAFC]">{toast.title}</p>
              {toast.subtitle ? <p className="mt-0.5 truncate text-[11px] font-medium leading-4 text-white/[0.72]">{toast.subtitle}</p> : null}
            </div>
            <button type="button" onClick={() => setVisible(false)} className="-mr-1 grid size-7 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4A64A]" aria-label="Dismiss notification">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

function MobileNowPlayingMini({ station, onOpen }: { station: Station; onOpen: () => void }) {
  const { playing, status, toggle, setStation } = usePlayer();
  const play = () => { if (!usePlayer.getState().current) setCurrentStationAndDestination(station); else toggle(); };
  return <div onClick={onOpen} className="fixed bottom-[86px] left-4 right-4 z-40 min-h-[76px] rounded-3xl border border-white/10 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-xl">
    <div className="flex h-full items-center gap-3"><button onClick={(e) => { e.stopPropagation(); play(); }} className="grid size-11 shrink-0 place-items-center rounded-full bg-radio text-midnight">{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button><div className="min-w-0 flex-1"><p className="truncate font-display text-sm font-bold">{station.city || station.state || station.country} · {station.country}</p><p className="truncate text-xs text-ivory/60">{getPrimaryGenre(station)} · {station.name} · {status}</p></div><Volume2 className="size-4 text-ivory/60" /></div>
  </div>;
}

function MobileWanderSheet({ open, stations, current, onTravel, onClose }: { open: boolean; stations: Station[]; current: Station; onTravel: (intent: string) => void; onClose: () => void }) {
  const options = ["Surprise Me", "Unvisited Country", "Unvisited Continent", "Somewhere Waking Up", "Somewhere Falling Asleep", "Somewhere Rainy", "Somewhere Spiritual", "Somewhere Busy", "Somewhere Peaceful", "Global Shuffle"];
  const travel = (option: string) => {
    const intent = option === "Surprise Me" ? "Take me somewhere surprising" : option === "Global Shuffle" ? "Take me somewhere global" : option;
    fetch(`/api/stations/nearby?global=true&limit=18`).then(async (res) => {
      const data = res.ok ? ((await res.json()) as { candidates?: SignalCandidate[] }) : { candidates: [] };
      setCurrentStationAndDestination(chooseWonderStation([...(data.candidates?.map((item) => item.station) ?? []), ...stations], current, intent), "wanderer");
    }).catch(() => setCurrentStationAndDestination(chooseWonderStation(stations, current, intent), "wanderer"));
    onTravel(intent);
    onClose();
  };
  return <AnimatePresence>{open ? <motion.section initial={{ y: 360, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 360, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-50 rounded-[2rem] border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
    <button onClick={onClose} className="mx-auto mb-4 block h-1.5 w-14 rounded-full bg-white/30" aria-label="Close Wander" />
    <p className="mb-1 font-display text-xs font-semibold text-gold">Wander</p><h2 className="mb-3 font-display text-xl font-bold">Live discovery is ready.</h2>
    <div className="grid grid-cols-2 gap-2">{options.map((option) => <button key={option} onClick={() => travel(option)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm font-medium text-ivory active:scale-[.98]">{option}</button>)}</div>
  </motion.section> : null}</AnimatePresence>;
}


function MobileStationSheet({ station, stations, setQuery, open, setOpen }: { station: Station; stations: Station[]; setQuery: (q: string) => void; open: boolean; setOpen: (v: boolean) => void }) {
  return <motion.section drag="y" dragConstraints={{ top: 0, bottom: 0 }} onDragEnd={(_, info) => setOpen(info.offset.y < -40 ? true : info.offset.y > 40 ? false : open)} initial={{ y: 680 }} animate={{ y: open ? 64 : 680 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-white/[0.12] bg-[rgba(8,17,29,0.86)] px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-3 shadow-2xl backdrop-blur-xl">
    <button onClick={() => setOpen(!open)} className="mx-auto block h-1.5 w-14 rounded-full bg-white/30" aria-label="Toggle Destination Intelligence" />
    <StationIntelligencePanel station={station} stations={stations} setQuery={setQuery} />
  </motion.section>;
}

function MobileCommandDock({ mode, setMode, onTeleport, onToggleWanderer, wandererActive }: { mode: string; setMode: (m: string) => void; onTeleport: () => void; onToggleWanderer: () => void; wandererActive: boolean }) {
  const reducedMotion = useReducedMotion();
  const status = usePlayer((state) => state.status);
  const pulseTeleport = !reducedMotion && (status === "idle" || status === "playing") && mode !== "Brief" && mode !== "Add Signal";
  const commands = [[Heart,"Favorites"],[Globe2,"Explore"],[Signal,"Add Signal"],[Plane,"Teleport"],[Newspaper,"Brief"],[Compass,wandererActive ? "Exit Wanderer" : "Wanderer"],[Radio,"History"]] as const;
  return <nav className="pointer-events-none fixed bottom-0 left-4 right-4 z-[70] max-w-full pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2"><div className="pointer-events-auto grid grid-cols-7 gap-1 rounded-[1.75rem] border border-white/10 bg-slate-950/92 p-1.5 shadow-2xl backdrop-blur-xl">{commands.map(([Icon,label]) => { const I = Icon as typeof Compass; const value = label as string; const isTeleport = value === "Teleport"; const isWanderer = value === "Wanderer" || value === "Exit Wanderer"; return <div key={value} className={isTeleport ? "relative" : undefined}>{isTeleport && pulseTeleport ? <span className="pointer-events-none absolute inset-0 rounded-full border border-[rgba(0,214,143,0.35)] shadow-[0_0_24px_rgba(0,214,143,0.22)] animate-[teleportPulse_2.8s_ease-out_infinite]" /> : null}<button type="button" onClick={() => { if (isTeleport) onTeleport(); else if (isWanderer) onToggleWanderer(); setMode(isWanderer ? "Wanderer" : value); }} className={`pointer-events-auto relative z-[1] min-h-14 w-full rounded-2xl px-1 py-2 text-[9px] font-medium leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${mode === value || (isWanderer && wandererActive) ? "bg-radio text-midnight" : isTeleport ? "border border-radio/20 bg-radio/10 text-radio hover:bg-radio/15" : "text-ivory/70 hover:bg-white/10"}`} aria-label={isTeleport ? "Teleport to one new destination" : isWanderer ? (wandererActive ? "Exit Wanderer" : "Start continuous Wanderer Mode") : value}><I className="mx-auto mb-1 size-4" />{isTeleport ? "✈ Teleport" : value}</button></div>; })}</div></nav>;
}

function MobileAtlasShell({ stations, current, query, setQuery, onCountrySelect, setWandererIntent, onQueryComplete }: { stations: Station[]; current: Station; query: string; setQuery: (q: string) => void; onCountrySelect: (country: CountryResult) => void; setWandererIntent: (intent: string) => void; onQueryComplete: () => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState("Atlas");
  const [atlasView, setAtlasView] = useState<AtlasViewMode>(getInitialAtlasView);
  const [resetSignal, setResetSignal] = useState(0);
  const [basemap, setBasemap] = useState<BasemapKey>(() => getInitialBasemap(true));
  const [globeBasemap, setGlobeBasemap] = useState<GlobeBasemapKey>(getInitialGlobeBasemap);
  const [mobileGlobeFallbackReason, setMobileGlobeFallbackReason] = useState("");
  const [wanderOpen, setWanderOpen] = useState(false);
  const [mobileTeleporting, setMobileTeleporting] = useState(false);
  const [wandererActive, setWandererActive] = useState(false);
  const wandererTimer = useRef<number | null>(null);
  const [mapContext, setMapContext] = useState<MapTeleportContext | null>(null);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const handleTravel = useCallback((intent: string) => {
    setWandererIntent(intent);
  }, [setWandererIntent]);
  const makeWandererHop = useCallback(() => {
    const intent = "Wanderer Mode";
    setWandererIntent(intent);
    void resolveGlobalJourneyDestination(stations, usePlayer.getState().current ?? current, intent).then((destination) => {
      rememberJourneyStop(destination);
      setCurrentStationAndDestination(destination, "wanderer");
      handleTravel(intent);
    });
  }, [current, handleTravel, stations, setWandererIntent]);
  useEffect(() => {
    if (!wandererActive) { if (wandererTimer.current) window.clearTimeout(wandererTimer.current); return; }
    wandererTimer.current = window.setTimeout(makeWandererHop, 0);
    const schedule = () => { wandererTimer.current = window.setTimeout(() => { makeWandererHop(); schedule(); }, nextWandererIntervalMs()); };
    schedule();
    return () => { if (wandererTimer.current) window.clearTimeout(wandererTimer.current); };
  }, [makeWandererHop, wandererActive]);
  const visualViewport = useIOSVisualViewport();
  const selectedView: AtlasViewMode = mobileGlobeFallbackReason ? "map" : atlasView;
  useEffect(() => {
    debugAtlasDecision({ device: "mobile", selectedView, webglSupport: "probed-in-globe", fallbackReason: mobileGlobeFallbackReason || null });
  }, [mobileGlobeFallbackReason, selectedView]);
  const handleMobileGlobeFallback = useCallback((reason?: string) => {
    const fallbackReason = reason || "Globe unavailable; map is ready.";
    setMobileGlobeFallbackReason(fallbackReason);
    setAtlasView("map");
    dispatchAtlasToast({
      title: "Globe view is optimized for this device using map mode.",
      subtitle: fallbackReason,
      kind: "alert",
      id: `mobile-globe-fallback-${Date.now()}`,
    });
  }, []);
  const chooseAtlasView = (view: AtlasViewMode) => {
    setMobileGlobeFallbackReason("");
    setAtlasView(view);
    persistAtlasView(view);
  };
  const enterMobileStreets = useCallback(() => {
    setMobileGlobeFallbackReason("");
    setBasemap("atlasStreets");
    setAtlasView("map");
    persistAtlasView("map");
  }, [setBasemap]);
  return <section className="fixed inset-0 h-[100dvh] w-screen max-w-full overflow-hidden bg-transparent text-white md:hidden">
    {selectedView === "map" ? (
      <WaveAtlasMap station={current} mobile resetSignal={resetSignal} basemap={basemap} onBasemapChange={setBasemap} onMapContextChange={setMapContext} onCountrySelect={onCountrySelect} searchActive={false} keyboardOpen={searchOverlayOpen && visualViewport.keyboardOpen} />
    ) : (
      <BlueMarbleGlobe station={current} teleporting={mobileTeleporting} mobile basemap={globeBasemap} onCountrySelect={onCountrySelect} onFallback={handleMobileGlobeFallback} onStreetZoomRequest={enterMobileStreets} />
    )}
    {selectedView === "globe" ? <GlobeBasemapControl value={globeBasemap} onChange={setGlobeBasemap} mobile /> : null}
    {selectedView === "globe" ? <OpenStreetViewButton station={current} mobile /> : null}
    <div className="pointer-events-auto fixed right-4 top-[calc(env(safe-area-inset-top)+92px)] z-[58] flex rounded-full border border-white/10 bg-slate-950/75 p-1 text-[11px] font-semibold shadow-xl backdrop-blur-xl">
      <button type="button" onClick={() => chooseAtlasView("globe")} className={`rounded-full px-3 py-1.5 ${selectedView === "globe" ? "bg-radio text-midnight" : "text-ivory/70"}`}>Globe</button>
      <button type="button" onClick={() => chooseAtlasView("map")} className={`rounded-full px-3 py-1.5 ${selectedView === "map" ? "bg-radio text-midnight" : "text-ivory/70"}`}>Map</button>
    </div>
    {mobileGlobeFallbackReason ? <div className="pointer-events-none fixed left-4 top-[calc(env(safe-area-inset-top)+92px)] z-40 max-w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gold/20 bg-slate-950/70 px-3 py-2 text-[11px] text-ivory/70 shadow-xl backdrop-blur-xl"><b className="block text-gold">2D atlas fallback active</b>{mobileGlobeFallbackReason}</div> : null}
    {mode !== "Dial" ? <MobileHeaderCard viewportOffsetTop={visualViewport.viewportOffsetTop} onOpenSearch={() => setSearchOverlayOpen(true)} onOpenSettings={() => setMode("Settings")} /> : null}
    <MobileSearchCommandOverlay open={searchOverlayOpen} query={query} setQuery={setQuery} stations={stations} onClose={() => { setSearchOverlayOpen(false); setQuery(""); }} onCountrySelect={(country) => { setSearchOverlayOpen(false); window.setTimeout(() => { onCountrySelect(country); onQueryComplete(); }, 250); }} onStationSelect={(station) => { setSearchOverlayOpen(false); setQuery(""); window.setTimeout(() => { onQueryComplete(); setCurrentStationAndDestination(station); }, 250); }} />
    <SelectedStationTheater station={current} />
    {wandererActive ? <button onClick={() => setWandererActive(false)} className="fixed bottom-[176px] left-4 z-[56] rounded-full border border-radio/30 bg-slate-950/90 px-4 py-2 text-xs font-medium text-radio shadow-xl backdrop-blur-xl">Wanderer Mode · Exit Wanderer</button> : null}
    <MobileWanderSheet open={wanderOpen} stations={stations} current={current} onTravel={handleTravel} onClose={() => setWanderOpen(false)} />
    {mode === "Settings" ? <div className="pointer-events-auto fixed inset-0 z-[998] overflow-y-auto bg-black/35 pb-28 backdrop-blur-[8px]"><UtilityLinksPanel compact /></div> : null}
    {mode === "Add Signal" ? (
      <div className="pointer-events-auto fixed inset-0 z-[999] flex h-[100dvh] items-start justify-center overflow-y-auto overscroll-contain bg-black/45 px-3 pb-[calc(140px_+_env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] backdrop-blur-[10px]">
        <AddYourSignalPanel compact onCancel={() => setMode("Atlas")} />
      </div>
    ) : null}
    <AtlasToast station={current} mobile />
    <MobileNowPlayingMini station={current} onOpen={() => setSheetOpen(true)} />
    <MobileStationSheet station={current} stations={stations} setQuery={setQuery} open={sheetOpen || mode === "Library"} setOpen={setSheetOpen} />
    <NewspaperBrief station={current} open={mode === "Brief"} onClose={() => setMode("Atlas")} />
    <MobileCommandDock mode={mode} wandererActive={wandererActive} onToggleWanderer={() => setWandererActive((active) => !active)} onTeleport={() => { if (mobileTeleporting) return; setMobileTeleporting(true); setWandererActive(false); const intent = "Take me somewhere surprising"; const selectionVersion = ++stationSelectionVersion; usePlayer.getState().setStatus("buffering", "Teleporting…"); void resolveTeleportDestination(stations, usePlayer.getState().current ?? current).then(({ station, queue }) => { if (isCurrentStationSelection(selectionVersion)) { commitTeleportStation(station, queue); handleTravel(intent); } }).catch((error) => { if (!(error instanceof DOMException && error.name === "AbortError")) usePlayer.getState().setStatus("failed", "Signal unavailable. Trying another station."); }).finally(() => setMobileTeleporting(false)); }} setMode={(m) => { setMode(m); if (m === "Passport" || m === "History" || m === "Favorites") setSheetOpen(true); else setSheetOpen(false); }} />
  </section>;
}


type SignalSubmissionResponse = {
  message: string;
  review?: { status: string; quality_score: number; recommendation: string };
  error?: string;
};

function UtilityLinksPanel({ compact = false }: { compact?: boolean }) {
  const links = [
    ["Demo", "/demo", "Learn the product in minutes."],
    ["About", "/about", "Mission, indexing, and ownership."],
    ["Legal", "/legal", "Terms, privacy, copyright, and signals."],
    ["Press", "/press", "Tagline, mission, and brand colors."],
  ] as const;
  return <section className={`rounded-[2rem] border border-white/10 bg-slate-950/85 p-5 shadow-2xl backdrop-blur-2xl ${compact ? "mx-4 mt-24" : ""}`}>
    <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-radio">Settings</p>
    <h2 className="mt-2 font-display text-2xl font-bold text-white">Trust & launch center</h2>
    <p className="mt-2 text-sm leading-6 text-ivory/65">Quick links for onboarding, company context, legal policies, and press-ready brand language.</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {links.map(([label, href, description]) => <NextLink key={href} href={href} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 transition hover:border-radio/30 hover:bg-radio/10">
        <b className="block text-sm text-white">{label}</b>
        <span className="mt-1 block text-xs leading-5 text-ivory/58">{description}</span>
      </NextLink>)}
    </div>
  </section>;
}

function AddYourSignalPanel({ compact = false, onCancel }: { compact?: boolean; onCancel?: () => void }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const fields = [
    ["station_name", "Station name", "BBC World Service", true],
    ["stream_url", "Working stream URL", "https://example.com/live.mp3", true],
    ["city", "City", "Accra", false],
    ["country", "Country", "Ghana", false],
    ["genre", "Genre", "News, jazz, amapiano…", false],
    ["language", "Language", "English", false],
    ["station_website", "Station website", "https://station.example", false],
    ["submitted_by", "Submitted by", "Your name", false],
    ["submitter_email_optional", "Email (optional)", "you@example.com", false],
  ] as const;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const res = await fetch("/api/signals/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as SignalSubmissionResponse;
    if (!res.ok) {
      setStatus("error");
      setMessage(data.error || "Signal submission failed. Please check the stream URL and try again.");
      dispatchAtlasToast({ title: data.error || "Signal submission failed. Please check the stream URL and try again.", kind: "alert" });
      return;
    }
    event.currentTarget.reset();
    setStatus("success");
    setMessage(data.message || "Your signal has been received. Once verified, it may join the WaveAtlas™ global map.");
    dispatchAtlasToast({ title: "Your signal has been received.", subtitle: "Once verified, it may join the WaveAtlas™ global map." });
  }

  return <section className={`flex w-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(7,17,31,0.92)] shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-[24px] ${compact ? "max-h-[calc(100dvh_-_48px_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] max-w-[94vw]" : "max-h-[86dvh] max-w-[720px]"}`}>
    <div className="sticky top-0 z-[2] shrink-0 border-b border-white/[0.08] bg-[rgba(7,17,31,0.96)] p-4 backdrop-blur-[16px] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-radio">Add Your Signal</p>
          <h2 className={`${compact ? "mt-2 text-2xl" : "mt-3 text-[32px]"} font-display font-bold leading-tight text-white`}>Help us map the sound of Earth.</h2>
        </div>
        {onCancel ? <button type="button" onClick={onCancel} className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-lg leading-none text-ivory transition hover:bg-white/10" aria-label="Close Add Signal">×</button> : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-ivory/80">Have a favorite radio station anywhere in the world? Send us the working stream URL and help WaveAtlas™ grow.</p>
      <p className="mt-2 text-xs font-semibold text-gold">If it is broadcasting on Earth, it belongs here.</p>
    </div>
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-6 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([name, label, placeholder, required]) => <label key={name} className="rounded-2xl border border-white/[0.08] bg-[rgba(12,26,42,0.92)] p-3 text-xs font-medium text-ivory/80">
            {label}{required ? <span className="text-radio"> *</span> : null}
            <input name={name} required={required} placeholder={placeholder} className="mt-1 w-full rounded-2xl border border-white/10 bg-[rgba(5,10,20,0.85)] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/[0.55] focus:border-[#00D68F] focus:ring-2 focus:ring-[#00D68F]/20" />
          </label>)}
        </div>
        <label className="mt-3 block rounded-2xl border border-white/[0.08] bg-[rgba(12,26,42,0.92)] p-3 text-xs font-medium text-ivory/80">Notes (optional)
          <textarea name="notes_optional" rows={3} placeholder="Tell the review agent anything useful about this stream." className="mt-1 w-full rounded-2xl border border-white/10 bg-[rgba(5,10,20,0.85)] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/[0.55] focus:border-[#00D68F] focus:ring-2 focus:ring-[#00D68F]/20" />
        </label>
        {message ? <p className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${status === "error" ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-radio/30 bg-radio/10 text-radio"}`}>{message}</p> : null}
        <p className="mt-3 text-[11px] leading-5 text-ivory/60">Signal Review Agent validates, enriches, deduplicates, and creates an admin review record. It never auto-publishes to production.</p>
      </div>
      <div className="sticky bottom-0 z-[2] flex shrink-0 flex-col gap-2 border-t border-white/[0.08] bg-[rgba(7,17,31,0.96)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-[16px] sm:flex-row sm:items-center sm:justify-end sm:p-5">
        {onCancel ? <button type="button" onClick={onCancel} className="rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-ivory transition hover:bg-white/10">Cancel</button> : null}
        <button disabled={status === "submitting"} className="rounded-full bg-gradient-to-r from-[#00D68F] via-radio to-emerald-300 px-5 py-3 text-sm font-semibold text-midnight shadow-[0_14px_34px_rgba(0,214,143,0.24)] transition hover:shadow-[0_18px_42px_rgba(0,214,143,0.34)] disabled:cursor-wait disabled:opacity-70"><Signal className="mr-2 inline size-4" />{status === "submitting" ? "Reviewing signal…" : "Submit Signal for Review"}</button>
      </div>
    </form>
  </section>;
}

function RecentlyVisitedPanel() {
  const [history, setHistory] = useState(() => readArrivalHistory());
  useEffect(() => {
    const refresh = () => setHistory(readArrivalHistory());
    window.addEventListener("storage", refresh);
    const timer = window.setInterval(refresh, 2500);
    return () => { window.removeEventListener("storage", refresh); window.clearInterval(timer); };
  }, []);
  const destinations = history.last50Cities.slice(0, 5);
  return <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
    <p className="font-display text-xs font-semibold text-gold">Recently Visited</p>
    <div className="mt-4 space-y-3">{destinations.length ? destinations.map((place, index) => <div key={place} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3"><b className="block text-sm text-ivory">{place}</b><span className="text-xs text-ivory/55">{history.last15Genres[index] ?? "Global Sound"}</span></div>) : <p className="text-sm text-ivory/55">Your destination trail will appear after your first flight.</p>}</div>
  </section>;
}

function WorldPassportPanel() {
  const [history, setHistory] = useState(() => readArrivalHistory());
  useEffect(() => {
    const timer = window.setInterval(() => setHistory(readArrivalHistory()), 2500);
    return () => window.clearInterval(timer);
  }, []);
  const countries = history.last30Countries.length;
  const cities = history.last50Cities.length;
  const continents = ["Africa", "Europe", "Asia", "North America", "South America", "Oceania", "Caribbean"];
  const achievements = [
    ["First Country", countries >= 1], ["10 Countries", countries >= 10], ["25 Countries", countries >= 25], ["50 Countries", countries >= 50],
    ["100 Countries", countries >= 100], ["200 Countries", countries >= 200], ["500 Countries", countries >= 500], ["1000 Cities", cities >= 1000],
  ] as const;
  return <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
    <p className="font-display text-xs font-semibold text-gold">World Passport™</p>
    <h3 className="mt-2 font-display text-[28px] font-bold leading-tight">{countries} Countries Explored</h3>
    <div className="mt-4 grid grid-cols-2 gap-2">{continents.map((continent) => <div key={continent} className={`rounded-2xl border px-3 py-2 text-sm ${history.last10Continents.includes(continent) ? "border-radio/40 bg-radio/10 text-radio" : "border-white/10 bg-slate-950/35 text-ivory/55"}`}>{continent}</div>)}</div>
    <div className="mt-4 flex flex-wrap gap-2">{achievements.map(([label, unlocked]) => <span key={label} className={`rounded-full border px-3 py-1 text-xs font-medium ${unlocked ? "border-gold/50 bg-gold/15 text-gold" : "border-white/10 text-ivory/45"}`}>{label}</span>)}</div>
  </section>;
}

function DailyFlightPanel({ stations }: { stations: Station[] }) {
  const daily = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const seed = [...today].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return stations[seed % Math.max(1, stations.length)];
  }, [stations]);
  if (!daily) return null;
  return <section className="rounded-[2rem] border border-gold/20 bg-gold/10 p-5">
    <p className="font-display text-xs font-semibold text-gold">Daily Flight™</p>
    <h3 className="mt-2 font-display text-[28px] font-bold leading-tight">Today’s Destination</h3>
    <p className="mt-2 text-lg text-ivory">{destinationLabel(daily)} {flagFor(daily.country_code)}</p>
    <p className="text-sm text-ivory/60">{getPrimaryGenre(daily)}</p>
    <button onClick={() => setCurrentStationAndDestination(daily)} className="mt-4 rounded-full bg-radio px-5 py-3 text-sm font-medium text-midnight"><Plane className="mr-2 inline size-4" />Board Flight</button>
  </section>;
}

export default function WaveAtlasApp({ stations }: { stations: Station[] }) {
  const reducedMotion = useReducedMotion();
  const playerStatus = usePlayer((state) => state.status);
  const [stationPool, setStationPool] = useState(stations);
  const [arrival, setArrival] = useState<ArrivalDestination | undefined>();
  const [arrivalVisible, setArrivalVisible] = useState(false);
  const [hasCompletedArrival, setHasCompletedArrival] = useState(readHasCompletedArrival);
  const arrivalStation = usePlayer((s) => s.arrivalStation);
  const replacementReason = usePlayer((s) => s.replacementReason);
  const [splashVisible, setSplashVisible] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem(SIGNAL_SPLASH_KEY) !== "true");
  const [splashComplete, setSplashComplete] = useState(() => typeof window === "undefined" || window.sessionStorage.getItem(SIGNAL_SPLASH_KEY) === "true");
  const [startupPreview] = useState(() => stations[Math.floor(Math.random() * Math.max(1, stations.length))]);
  const current = usePlayer((s) => s.current) ?? arrival?.station ?? startupPreview ?? stationPool[0] ?? stations[0];
  const [query, setQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<CountryResult | null>(null);
  const [activeTag, setActiveTag] = useState("");
  const [offset, setOffset] = useState(stations.length);
  const [loadingCountry, setLoadingCountry] = useState(false);
  const [countrySignalMessage, setCountrySignalMessage] = useState("");
  const [desktopResetSignal, setDesktopResetSignal] = useState(0);
  const [deepLinkStatus, setDeepLinkStatus] = useState<"idle" | "loading" | "unavailable">("idle");
  const [wandererIntent, setWandererIntent] = useState("Take me somewhere surprising");
  const [desktopMode, setDesktopMode] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "add-signal" ? "Add Signal" : "Teleport");
  const [desktopDrawerCollapsed, setDesktopDrawerCollapsed] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [wandererActive, setWandererActive] = useState(false);
  const wandererTimer = useRef<number | null>(null);
  const [desktopMapContext, setDesktopMapContext] = useState<MapTeleportContext | null>(null);
  const [desktopTeleporting, setDesktopTeleporting] = useState(false);
  const [desktopGlobeBasemap, setDesktopGlobeBasemap] = useState<GlobeBasemapKey>(getInitialGlobeBasemap);
  const [desktopAtlasView, setDesktopAtlasView] = useState<AtlasViewMode>("globe");
  const [desktopBasemap, setDesktopBasemap] = useState<BasemapKey>("atlasStreets");
  const [globeFallbackReason, setGlobeFallbackReason] = useState("");
  const [previousDesktopStation, setPreviousDesktopStation] = useState<Station | undefined>();
  const lastDesktopStationRef = useRef<Station | undefined>(undefined);
  const [deepLinkUuid] = useState(() => {
    if (typeof window === "undefined") return "";
    const value = new URLSearchParams(window.location.search).get("station")?.trim() || "";
    return /^[a-z0-9-]{8,80}$/i.test(value) ? value : "";
  });
  const initialStationPoolRef = useRef(stationPool);

  const completeArrivalFlow = useCallback(() => {
    markArrivalCompleted();
    setHasCompletedArrival(true);
    setArrivalVisible(false);
    usePlayer.getState().clearArrivalContext();
  }, []);

  useEffect(() => {
    const syncArrivalCompletion = () => {
      setHasCompletedArrival(true);
      setArrivalVisible(false);
    };
    window.addEventListener(ARRIVAL_COMPLETED_EVENT, syncArrivalCompletion);
    return () => window.removeEventListener(ARRIVAL_COMPLETED_EVENT, syncArrivalCompletion);
  }, []);

  useEffect(() => {
    if (hasCompletedArrival || !arrival || !arrivalStation || stationKey(arrival.station) === stationKey(arrivalStation)) return;
    window.queueMicrotask(() => {
      if (readHasCompletedArrival()) return;
      setArrival({ ...arrival, station: arrivalStation, city: arrivalStation.city || arrivalStation.state || arrivalStation.country, country: arrivalStation.country || arrivalStation.country_code, genre: stationGenre(arrivalStation), localTime: localTimeForStation(arrivalStation) });
      setArrivalVisible(true);
    });
  }, [arrival, arrivalStation, hasCompletedArrival]);

  useEffect(() => {
    if (!current || typeof window === "undefined") return;
    persistArrival(current, stationContinent(current), window.localStorage);
  }, [current]);


  useEffect(() => {
    if (!current || !stationPool.length) return;
    const anchor = getCandidateLockAnchor(current, stationPool) ?? current;
    if (teleportPoolCache?.anchorKey === stationKey(anchor) && teleportPoolCache.expires > Date.now()) return;
    refreshTeleportPoolInBackground(anchor, readTeleportHistory());
  }, [current, stationPool]);

  useEffect(() => {
    if (hasCompletedArrival || !splashComplete || deepLinkUuid || arrival || !stationPool.length) return;
    const destination = createArrivalDestination(stationPool, window.localStorage);
    if (!destination) return;
    const startupQueue = buildFastConnectQueue(stationPool, destination.station, FAST_CONNECT_PARALLEL_CANDIDATES - 1);
    usePlayer.getState().setArrivalStation(destination.station, startupQueue);
    usePlayer.getState().prepareStation(destination.station);
    let timer: number | undefined;
    window.queueMicrotask(() => {
      if (readHasCompletedArrival()) return;
      setArrival(destination);
      setArrivalVisible(true);
      timer = window.setTimeout(completeArrivalFlow, 3000);
    });
    return () => { if (timer) window.clearTimeout(timer); };
  }, [arrival, completeArrivalFlow, deepLinkUuid, hasCompletedArrival, splashComplete, stationPool]);

  useEffect(() => {
    const stationUuid = deepLinkUuid;
    if (!stationUuid) return;
    const existing = initialStationPoolRef.current.find((station) => station.station_uuid === stationUuid);
    if (existing) {
      setCurrentStationAndDestination(existing, "deeplink");
      setDeepLinkStatus("idle");
      return;
    }
    const controller = new AbortController();
    setDeepLinkStatus("loading");
    fetch(`/api/stations/by-uuid?station_uuid=${encodeURIComponent(stationUuid)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Station unavailable or moved");
        return (await res.json()) as { station: Station };
      })
      .then(({ station }) => {
        if (station.station_uuid !== stationUuid) throw new Error("Station identity mismatch");
        setStationPool((prev) => prev.some((item) => item.station_uuid === stationUuid) ? prev : [station, ...prev]);
        setCurrentStationAndDestination(station, "deeplink");
        setDeepLinkStatus("idle");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const fallback = initialStationPoolRef.current[0];
        if (fallback) usePlayer.getState().prepareStation(fallback, "deeplink");
        setDeepLinkStatus("unavailable");
      });
    return () => controller.abort();
  }, [deepLinkUuid]);

  const loadCountryStations = async (country: CountryResult, nextOffset = 0, tag = activeTag) => {
    setLoadingCountry(true);
    setCountrySignalMessage(nextOffset ? "Finding more live signals…" : `Tuning into ${country.name}…`);
    if (!nextOffset) setStationPool([]);
    const params = new URLSearchParams({ country: country.name, countryCode: country.code, limit: "500", offset: String(nextOffset) });
    if (tag) params.set("tag", tag);
    const requestUrl = `/api/stations/by-country?${params}`;
    debugCountryClick("request", { apiRequestUrl: requestUrl, resolvedCountryName: country.name, resolvedCountryCode: country.code });
    try {
      const res = await fetch(requestUrl);
      if (!res.ok) throw new Error(`Country station request failed: ${res.status}`);
      const data = (await res.json()) as { stations: Station[] };
      const sameCountryStations = data.stations.filter((station) => station.country_code === country.code);
      debugCountryClick("candidates", { apiRequestUrl: requestUrl, candidateCount: sameCountryStations.length, selectedStation: sameCountryStations[0]?.name ?? null });
      setStationPool((prev) => nextOffset ? [...prev, ...sameCountryStations] : sameCountryStations);
      setOffset(nextOffset + sameCountryStations.length);
      if (!nextOffset && sameCountryStations[0]) {
        setCurrentStationAndDestination(sameCountryStations[0], "auto", sameCountryStations.slice(1));
        setCountrySignalMessage(`Loading ${sameCountryStations[0].name} from ${country.name}…`);
        debugCountryClick("playback", { selectedStation: sameCountryStations[0], playbackResult: "station-loaded" });
      } else if (!nextOffset) {
        setCountrySignalMessage("No live signal found here yet. Try Teleport or Add Your Signal.");
        usePlayer.getState().setStatus("failed", "Signal unavailable. Trying another station.");
        debugCountryClick("playback", { selectedStation: null, playbackResult: "no-candidates" });
      }
    } catch (error) {
      setCountrySignalMessage("No live signal found here yet. Try Teleport or Add Your Signal.");
      usePlayer.getState().setStatus("failed", "Signal unavailable. Trying another station.");
      debugCountryClick("playback", { selectedStation: null, playbackResult: "request-failed", error: error instanceof Error ? error.message : "unknown" });
    } finally {
      setLoadingCountry(false);
    }
  };
  const centerAppAfterQuery = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('input[placeholder="Search country, city, destination..."]')?.blur();
    });
  }, []);

  const selectCountry = (country: CountryResult) => {
    setDesktopDrawerCollapsed(false);
    setSelectedCountry(country);
    setQuery("");
    setActiveTag("");
    void loadCountryStations(country, 0, "").finally(centerAppAfterQuery);
  };
  const selectTag = (tag: string) => {
    setActiveTag(tag);
    if (selectedCountry) void loadCountryStations(selectedCountry, 0, tag);
  };
  const runWandererHop = useCallback(() => {
    const intent = "Wanderer Mode";
    setWandererIntent(intent);
    void resolveGlobalJourneyDestination(stationPool, usePlayer.getState().current ?? current, intent).then((destination) => {
      rememberJourneyStop(destination);
      setStationPool((prev) => prev.some((station) => station.id === destination.id) ? prev : [destination, ...prev]);
      setCurrentStationAndDestination(destination, "wanderer");
    });
  }, [current, stationPool]);
  useEffect(() => {
    if (!wandererActive) { if (wandererTimer.current) window.clearTimeout(wandererTimer.current); return; }
    wandererTimer.current = window.setTimeout(runWandererHop, 0);
    const schedule = () => { wandererTimer.current = window.setTimeout(() => { runWandererHop(); schedule(); }, nextWandererIntervalMs()); };
    schedule();
    return () => { if (wandererTimer.current) window.clearTimeout(wandererTimer.current); };
  }, [runWandererHop, wandererActive]);

  useEffect(() => {
    if (!current) return;
    const last = lastDesktopStationRef.current;
    if (last && stationKey(last) !== stationKey(current)) setPreviousDesktopStation(last);
    lastDesktopStationRef.current = current;
  }, [current]);

  const enterDesktopStreets = useCallback(() => {
    setGlobeFallbackReason("");
    setDesktopBasemap("atlasStreets");
    setDesktopAtlasView("map");
    setDesktopResetSignal((signal) => signal + 1);
  }, []);

  const pulseDesktopTeleport = !reducedMotion && (playerStatus === "idle" || playerStatus === "playing") && !briefOpen && desktopMode !== "Add Signal";

  const desktopDrawerActive = query.trim().length > 0 || Boolean(selectedCountry) || desktopMode !== "Atlas";
  const desktopDrawerOpen = desktopDrawerActive && !desktopDrawerCollapsed;
  const closeDesktopDrawer = useCallback(() => {
    setQuery("");
    setSelectedCountry(null);
    setDesktopMode("Atlas");
    setDesktopDrawerCollapsed(false);
  }, []);

  const visible = stationPool
    .slice(0, selectedCountry ? stationPool.length : 9)
    .filter(
      (s) =>
        !query ||
        selectedCountry ||
        `${s.name} ${s.country} ${s.state} ${s.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  return (
    <>
      <style jsx global>{`@keyframes teleportPulse { 0% { transform: scale(1); opacity: .45; } 100% { transform: scale(1.08); opacity: 0; } } @media (prefers-reduced-motion: reduce) { .animate-\[teleportPulse_2\.8s_ease-out_infinite\] { animation: none !important; } }`}</style>
      <AudioEngine stations={stationPool} />
      {splashVisible ? <SignalInitializationSequence onComplete={() => { setSplashVisible(false); setSplashComplete(true); }} /> : null}
      <AnimatePresence>{arrivalVisible && !hasCompletedArrival ? <ArrivalCard arrival={arrival} replacementReason={replacementReason} onEnter={completeArrivalFlow} /> : null}</AnimatePresence>
      {deepLinkStatus !== "idle" ? <div className="fixed left-1/2 top-4 z-[80] w-[min(92vw,34rem)] -translate-x-1/2 rounded-3xl border border-white/10 bg-slate-950/90 p-4 text-sm text-ivory shadow-2xl backdrop-blur-xl"><b className="block text-base text-white">{deepLinkStatus === "loading" ? "Resolving shared station…" : "Station unavailable or moved"}</b><p className="mt-1 text-ivory/70">{deepLinkStatus === "loading" ? `Looking up exact station UUID ${deepLinkUuid}.` : `No station matched UUID ${deepLinkUuid}. Opening the main player with a live fallback instead.`}</p></div> : null}
      <MobileAtlasShell stations={stationPool} current={current} query={query} setQuery={setQuery} onCountrySelect={selectCountry} setWandererIntent={setWandererIntent} onQueryComplete={centerAppAfterQuery} />
    <main className="hidden h-screen min-h-[720px] w-full overflow-hidden bg-slate-950 md:block">
      <div className="pointer-events-none fixed left-6 right-6 top-6 z-40 flex items-start justify-between xl:left-8 xl:right-8">
        <b className="pointer-events-auto rounded-full border border-white/10 bg-slate-950/40 px-4 py-2 font-display text-[18px] font-bold leading-none text-ivory shadow-2xl backdrop-blur-2xl">
          WaveAtlas™
        </b>
        <button type="button" onClick={() => { setDesktopDrawerCollapsed(false); setBriefOpen(false); setDesktopMode("Settings"); }} className="pointer-events-auto mr-24 grid size-11 place-items-center rounded-full border border-white/10 bg-slate-950/40 text-ivory shadow-2xl backdrop-blur-2xl transition hover:border-radio/30 hover:text-radio" aria-label="Open settings">
          <Settings className="size-4" />
        </button>
      </div>
      <div className="absolute inset-0 z-0">
        <div className="hidden"><DailyFlightPanel stations={stationPool} /></div>
        {wandererActive ? <button onClick={() => setWandererActive(false)} className="absolute left-6 top-28 z-40 rounded-[2rem] border border-radio/30 bg-slate-950/75 p-4 text-left font-medium text-radio shadow-2xl backdrop-blur-xl xl:left-8">Wanderer Mode · continuous global exploration active · Exit Wanderer</button> : null}
        <div id="atlas-map" className="h-full w-full scroll-mt-0" onMouseDown={() => { if (desktopDrawerOpen) setDesktopDrawerCollapsed(true); }}>
          {globeFallbackReason || desktopAtlasView === "map" ? (
            <WaveAtlasMap station={current} resetSignal={desktopResetSignal} basemap={desktopBasemap} onBasemapChange={setDesktopBasemap} onMapContextChange={setDesktopMapContext} onCountrySelect={selectCountry} searchActive={query.trim().length > 0} />
          ) : (
            <BlueMarbleGlobe station={current} previousStation={previousDesktopStation} teleporting={desktopTeleporting} basemap={desktopGlobeBasemap} onCountrySelect={selectCountry} onFallback={setGlobeFallbackReason} onStreetZoomRequest={enterDesktopStreets} />
          )}
        </div>
        {!globeFallbackReason && desktopAtlasView === "globe" ? <GlobeBasemapControl value={desktopGlobeBasemap} onChange={setDesktopGlobeBasemap} /> : null}
        {!globeFallbackReason && desktopAtlasView === "globe" ? <OpenStreetViewButton station={current} /> : null}
        {desktopAtlasView === "map" ? <button type="button" onClick={() => setDesktopAtlasView("globe")} className="pointer-events-auto absolute right-6 top-24 z-50 rounded-full border border-white/15 bg-slate-950/60 px-4 py-3 text-xs font-bold text-ivory shadow-2xl backdrop-blur-xl transition hover:border-radio/40 hover:text-radio xl:right-8">Return to Globe</button> : null}
        {globeFallbackReason ? <div className="pointer-events-none absolute left-6 top-[8.5rem] z-40 max-w-sm rounded-2xl border border-gold/20 bg-slate-950/75 px-4 py-3 text-xs text-ivory/70 shadow-2xl backdrop-blur-xl xl:left-8"><b className="block text-gold">2D atlas fallback active</b>{globeFallbackReason}</div> : null}
        <SelectedStationTheater station={current} />
      </div>
      <section className="pointer-events-none fixed left-1/2 top-6 z-50 w-[min(560px,calc(100vw-3rem))] -translate-x-1/2">
        <div className="pointer-events-auto rounded-full border border-white/15 bg-slate-950/40 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,.35)] backdrop-blur-2xl">
          <div className="flex gap-3">
            <Search className="shrink-0 text-sky" />
            <input
              value={query}
              onChange={(e) => { setDesktopDrawerCollapsed(false); setQuery(e.target.value); }}
              onFocus={() => { if (desktopDrawerActive) setDesktopDrawerCollapsed(false); }}
              placeholder="Search country, city, destination..."
              className="w-full bg-transparent outline-none placeholder:text-ivory/45"
            />
          </div>
        </div>
      </section>
      {desktopDrawerActive ? <aside className={`${desktopDrawerOpen ? "translate-x-0 opacity-100" : "-translate-x-[calc(100%-3.5rem)] opacity-95"} pointer-events-auto fixed bottom-28 left-6 top-28 z-40 flex w-[min(420px,calc(100vw-3rem))] flex-col rounded-[2rem] border border-white/10 bg-[rgba(8,17,29,0.78)] p-4 text-ivory shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-[18px] [backdrop-filter:blur(18px)_saturate(1.15)] transition duration-300 xl:left-8`} aria-label="Search and discovery drawer">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-gold">Atlas drawer</p>
            <p className="truncate text-sm text-ivory/60">Search, destinations, and discovery stay off the map center.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setDesktopDrawerCollapsed((collapsed) => !collapsed)} className="grid size-10 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] text-ivory/80 transition hover:border-radio/40 hover:text-radio" aria-label={desktopDrawerOpen ? "Collapse search drawer" : "Expand search drawer"}>
              <Search className="size-4" />
            </button>
            <button type="button" onClick={closeDesktopDrawer} className="grid size-10 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] text-ivory/80 transition hover:border-gold/40 hover:text-gold" aria-label="Close search drawer">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className={`${desktopDrawerOpen ? "block" : "hidden"} atlas-drawer-scroll min-h-0 flex-1 overflow-y-auto pr-1`}>
          {query.trim() ? <CountryAutocomplete query={query} onSelect={selectCountry} /> : null}
          {desktopMode === "Settings" ? <div className="mt-5"><UtilityLinksPanel /></div> : null}
          {desktopMode === "Add Signal" ? <div className="mt-5"><AddYourSignalPanel /></div> : null}
          {query.trim() ? <GroupedSearchResults query={query} stations={stationPool} onStationSelect={(station) => { setCurrentStationAndDestination(station); setStationPool((prev) => prev.some((s) => s.id === station.id) ? prev : [station, ...prev]); setSelectedCountry(null); setQuery(""); setDesktopDrawerCollapsed(true); centerAppAfterQuery(); }} onCountrySelect={selectCountry} setQuery={setQuery} compact /> : null}
          {selectedCountry ? (
            <div className="mt-4 rounded-3xl border border-gold/20 bg-gold/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{selectedCountry.flag} {selectedCountry.name} · {stationPool.length.toLocaleString()} loaded of {selectedCountry.station_count.toLocaleString()} known stations</p>
                {loadingCountry ? <span className="text-sm text-gold">Acquiring {selectedCountry.name} signals…</span> : null}
                {countrySignalMessage ? <span className="text-sm text-ivory/70">{countrySignalMessage}</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["", "news", "music", "talk", "gospel", "sports", "local"].map((tag) => (
                  <button key={tag || "all"} onClick={() => selectTag(tag)} className={`rounded-full px-4 py-2 text-sm font-medium ${activeTag === tag ? "bg-radio text-midnight" : "border border-white/10 text-ivory/70"}`}>{tag || "All"}</button>
                ))}
              </div>
            </div>
          ) : null}
          {desktopMode !== "Atlas" || query.trim() ? <div className="mt-5 flex flex-wrap gap-2">
            {["Nigeria", "Dubai", "France", "Afrobeat", "Amapiano", "Jazz"].map((chip) => (
              <button key={chip} onClick={() => { setDesktopDrawerCollapsed(false); setQuery(chip); }} className="rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/70 hover:border-gold/60"><Sparkles className="mr-1 inline size-3" />{chip}</button>
            ))}
          </div> : null}
          {desktopMode !== "Atlas" || query.trim() || selectedCountry ? <div className="mt-5 grid gap-3">
            {visible.map((s) => (
              <button key={s.id} onClick={() => { setCurrentStationAndDestination(s); setQuery(""); setDesktopDrawerCollapsed(true); centerAppAfterQuery(); }} className="rounded-[18px] border border-white/[0.08] bg-[rgba(20,28,42,0.82)] px-4 py-3 text-left transition hover:border-gold/45 hover:bg-[rgba(28,38,58,0.9)]"><b className="block truncate font-display text-[15px] tracking-[-0.015em] text-[#F8FAFC]">{s.name}</b><p className="mt-1 truncate text-xs leading-5 text-white/[0.72]">{[s.city || s.state, s.country].filter(Boolean).join(" · ")} · {s.tags.slice(0, 2).join(", ") || "live radio"}</p></button>
            ))}
          </div> : null}
          {selectedCountry && !visible.length && !loadingCountry ? <p className="mt-5 rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm font-medium text-slate-300">No live signal found here yet. Try Teleport or Add Your Signal.</p> : null}
          {selectedCountry ? <button disabled={loadingCountry} onClick={() => loadCountryStations(selectedCountry, offset)} className="mt-5 w-full rounded-full bg-radio px-5 py-3 font-medium text-midnight disabled:opacity-50">{loadingCountry ? `Acquiring ${selectedCountry.name} signals…` : "Load More stations"}</button> : null}
        </div>
      </aside> : null}
      <NewspaperBrief station={current} open={briefOpen} onClose={() => { setBriefOpen(false); setDesktopMode("Atlas"); }} />
      <AtlasToast station={current} />
      <div className="fixed inset-x-6 bottom-6 z-[70] mx-auto grid max-w-6xl pointer-events-auto grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[2rem] border border-white/15 bg-midnight/90 p-2 shadow-glow backdrop-blur-xl xl:bottom-8">
        <div className="flex min-w-0 items-center gap-3 px-3">
          <button
            onClick={() => {
              const player = usePlayer.getState();
              if (!player.current) setCurrentStationAndDestination(current);
              else player.toggle();
            }}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-radio text-midnight"
            aria-label="Play or pause current station"
          >
            {usePlayer.getState().playing ? <Pause /> : <Play />}
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ivory">{current.city || current.state || current.country} · {current.country}</p>
            <p className="truncate text-xs text-ivory/60">{getPrimaryGenre(current)} · {current.name}</p>
          </div>
          <Volume2 className="ml-auto size-4 shrink-0 text-ivory/50" />
        </div>
        <nav className="pointer-events-auto grid grid-cols-7 gap-1 rounded-full border border-white/10 bg-slate-950/80 p-1">
          {([[Heart,"Favorites"],[Globe2,"Explore"],[Signal,"Add Signal"],[Plane,"Teleport"],[Newspaper,"Brief"],[Compass,wandererActive ? "Exit Wanderer" : "Wanderer"],[Radio,"History"]] as const).map(([Icon,label]) => { const I = Icon as typeof Compass; const value = label as string; const isTeleport = value === "Teleport"; return <div key={value} className={isTeleport ? "relative" : undefined}>{isTeleport && pulseDesktopTeleport ? <span className="pointer-events-none absolute inset-0 rounded-full border border-[rgba(0,214,143,0.35)] shadow-[0_0_24px_rgba(0,214,143,0.22)] animate-[teleportPulse_2.8s_ease-out_infinite]" /> : null}<button type="button" onClick={() => { if (value === "Teleport") { if (desktopTeleporting) return; setDesktopTeleporting(true); setDesktopDrawerCollapsed(false); setWandererActive(false); setDesktopMode(value); const selectionVersion = ++stationSelectionVersion; usePlayer.getState().setStatus("buffering", "Teleporting…"); void resolveTeleportDestination(stationPool, usePlayer.getState().current ?? current).then(({ station, queue }) => { if (isCurrentStationSelection(selectionVersion)) commitTeleportStation(station, queue); }).catch((error) => { if (!(error instanceof DOMException && error.name === "AbortError")) usePlayer.getState().setStatus("failed", "Signal unavailable. Trying another station."); }).finally(() => setDesktopTeleporting(false)); } else if (value === "Brief") { setDesktopDrawerCollapsed(false); setDesktopMode(value); setBriefOpen((open) => !open); } else if (value === "Wanderer" || value === "Exit Wanderer") { setDesktopDrawerCollapsed(false); setDesktopMode("Wanderer"); setWandererActive((active) => !active); } else { setDesktopDrawerCollapsed(false); setBriefOpen(false); setDesktopMode(value); } }} className={`pointer-events-auto relative z-[1] w-full rounded-full px-3 py-2 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${(desktopMode === label || ((label === "Wanderer" || label === "Exit Wanderer") && wandererActive)) ? "bg-radio text-midnight" : isTeleport ? "border border-radio/20 bg-radio/10 text-radio hover:bg-radio/15" : "text-ivory/70 hover:bg-white/10"}`} aria-label={`${label as string} command`}><I className="mx-auto mb-0.5 size-4" />{isTeleport && desktopTeleporting ? "Teleporting…" : label as string}</button></div>; })}
        </nav>
      </div>
    </main>
    </>
  );
}
