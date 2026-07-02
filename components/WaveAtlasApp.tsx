"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import dynamic from "next/dynamic";
import Image from "next/image";
import NextLink from "next/link";
import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Compass,
  Gauge,
  Globe2,
  Heart,
  Languages,
  MapPin,
  Mic,
  Navigation,
  Pause,
  Play,
  Radio,
  Plane,
  Search,
  Link,
  Signal,
  Trophy,
  Settings,
  Newspaper,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { isoCountryCentroids, type ResolvedStationGeo } from "@/lib/geotruth-resolver";
import { BRAND, WAVEATLAS_LOGO_PATH } from "@/lib/branding";
import { useMapCameraController } from "@/hooks/useMapCameraController";
import type { GlobeBasemapKey } from "@/lib/globe-renderer-types";
import { globeBasemapStyles, getSelectableGlobeBasemapKeys } from "@/lib/globe-style-options";
import { useIOSVisualViewport } from "@/hooks/useIOSVisualViewport";
import { countryAliases, flagFor, isCuratedStation, isVerifiedNigerianStation, type Station, type StationInventoryStats } from "@/lib/stations";
import { ArrivalCard } from "@/components/arrival-card";
import { PlaceHero } from "@/components/PlaceHero";
import { NewspaperBrief } from "@/components/NewspaperBrief";
import { ActiveStationBeacon } from "@/components/ActiveStationBeacon";
import { RadioDNA } from "@/components/RadioDNA";
import { WorldContextPanel } from "@/components/WorldContextPanel";
import type { WorldContext } from "@/lib/world-engine/types";

function selectGeoAudioQueueItem(channel: Station, itemIndex: number) {
  const selected = buildGeoAudioTrackStation(channel, itemIndex);
  if (!selected) return false;
  setCurrentStationAndDestination(selected, "manual", [channel]);
  return true;
}

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
import type { ArrivalDestination } from "@/lib/discovery/arrival-engine";
import { DEBUG_SIGNALS, buildSignalFeatures, getActiveBeaconFeature, resolveStationGeo, type SignalFeature } from "@/lib/signal-constellations";

import { destinationLabel, persistArrival, readArrivalHistory, stationGenre } from "@/lib/discovery/history";
import { FAST_CONNECT_COPY, FAST_CONNECT_PARALLEL_CANDIDATES, buildFastConnectQueue, getAdaptiveBufferPolicy, getStationStreamUrl, markStationFailure, markStationSuccess, stationKey, type SignalFailureType } from "@/lib/fast-connect-engine";
import { localTimeForStation, stationTimeCopy, teleportCopy } from "@/lib/smart-time-copy";
import { useNavigationEngine, type NavigationSelectionSource } from "@/lib/navigation-engine";
import { getSpeechRecognitionConstructor, parseVoiceCommand, type BrowserSpeechRecognition, type VoiceCommandIntent } from "@/lib/voice-command-engine";
import { LiveTrackMetadataEngine, type LiveTrackMetadataState } from "@/lib/live-track-metadata-engine";


type BrowserAudioContextConstructor = typeof AudioContext;

function OverflowMarquee({ text, className = "" }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textNode = textRef.current;
    if (!container || !textNode) return;
    const measure = () => { const overflow = Math.max(0, textNode.scrollWidth - container.clientWidth); setOverflowing(overflow > 1); setDistance(overflow); };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    observer?.observe(container);
    observer?.observe(textNode);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  return <div ref={containerRef} className={`waveatlas-marquee ${overflowing ? "is-overflowing" : ""} ${className}`} style={{ "--marquee-distance": `${distance}px` } as React.CSSProperties} title={text} aria-label={text}><span ref={textRef} className="waveatlas-marquee__content">{text}</span></div>;
}

function geoAudioTrackId(station: Station, itemIndex: number) {
  return `${station.station_uuid}-track-${itemIndex + 1}`;
}

function buildGeoAudioTrackStation(channel: Station, itemIndex: number): Station | undefined {
  const item = channel.geoAudio?.tracks[itemIndex];
  if (!item?.url) return undefined;
  const journeyId = channel.geoAudio?.queueId ?? channel.channel?.queue.id ?? `${channel.station_uuid}-journey`;
  const trackId = geoAudioTrackId(channel, itemIndex);
  const nextTrack = channel.geoAudio?.tracks.slice(itemIndex + 1).find((track) => Boolean(track.url));
  const nextIndex = nextTrack && channel.geoAudio ? channel.geoAudio.tracks.indexOf(nextTrack) : -1;
  return {
    ...channel,
    id: trackId,
    url: item.url,
    url_resolved: item.url,
    name: channel.geoAudio?.albumTitle ?? channel.name,
    geoAudio: channel.geoAudio ? {
      ...channel.geoAudio,
      currentJourneyId: journeyId,
      currentTrackId: trackId,
      currentTrackTitle: item.title,
      trackIndex: itemIndex,
      nextTrackId: nextIndex >= 0 ? geoAudioTrackId(channel, nextIndex) : undefined,
      queueLength: channel.geoAudio.tracks.length,
      highlightedQueueItemId: trackId,
    } : channel.geoAudio,
  };
}

function playPremiumTeleportClick() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: BrowserAudioContextConstructor }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const now = context.currentTime;
    const duration = 0.07;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.055, now + 0.006);
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    master.connect(context.destination);

    const body = context.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(1180, now);
    body.frequency.exponentialRampToValueAtTime(760, now + 0.032);
    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(0.18, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    body.connect(bodyGain).connect(master);

    const samples = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, samples, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < samples; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.setValueAtTime(9, now);
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.09, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
    noise.connect(filter).connect(noiseGain).connect(master);

    body.start(now);
    noise.start(now);
    body.stop(now + duration);
    noise.stop(now + duration);
    window.setTimeout(() => void context.close().catch(() => undefined), Math.ceil(duration * 1000) + 40);
  } catch {
    // Tactile audio is best-effort; teleporting must never depend on sound playback.
  }
}

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
type StationSelectionSource = NavigationSelectionSource;

type StartupPreferences = {
  resumeLastStation: boolean;
  homeStationStartup: boolean;
  homeStationId: string | null;
  autoplayAfterSearch: boolean;
  autoplayNearbyOnLaunch: boolean;
};

const STARTUP_PREFERENCES_KEY = "waveatlas:startup-preferences";
const LAST_STATION_ID_KEY = "waveatlas:last-station-id";
const defaultStartupPreferences: StartupPreferences = { resumeLastStation: false, homeStationStartup: false, homeStationId: null, autoplayAfterSearch: false, autoplayNearbyOnLaunch: false };

function readStartupPreferences(): StartupPreferences {
  if (typeof window === "undefined") return defaultStartupPreferences;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STARTUP_PREFERENCES_KEY) || "{}");
    return { ...defaultStartupPreferences, ...parsed, homeStationId: typeof parsed.homeStationId === "string" ? parsed.homeStationId : null };
  } catch {
    return defaultStartupPreferences;
  }
}

function persistStartupPreferences(preferences: StartupPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STARTUP_PREFERENCES_KEY, JSON.stringify(preferences));
}

function stationPersistentId(station: Station) {
  return station.station_uuid || station.id;
}

function findStationByPersistentId(stations: Station[], id?: string | null) {
  if (!id) return undefined;
  return stations.find((station) => station.station_uuid === id || station.id === id);
}

function useWaveAtlasLayoutDebug(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const root = document.documentElement;
    root.dataset.waveatlasDebugLayout = "true";
    let frame = 0;
    const describeViewport = () => ({
      visualViewport: window.visualViewport
        ? {
            width: window.visualViewport.width,
            height: window.visualViewport.height,
            offsetLeft: window.visualViewport.offsetLeft,
            offsetTop: window.visualViewport.offsetTop,
            scale: window.visualViewport.scale,
          }
        : null,
      layoutViewport: { width: window.innerWidth, height: window.innerHeight },
      documentElement: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth },
      body: document.body ? { clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth } : null,
      devicePixelRatio: window.devicePixelRatio,
      orientation: screen.orientation?.type ?? window.orientation ?? "unknown",
    });
    const selectorFor = (element: Element) => {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : "";
      const className = typeof element.className === "string" && element.className.trim() ? `.${element.className.trim().split(/\s+/).slice(0, 4).join(".")}` : "";
      return `${tag}${id}${className}`;
    };
    const scan = () => {
      frame = 0;
      const viewportWidth = root.clientWidth || window.innerWidth;
      const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const overflows = element.scrollWidth > element.clientWidth + 1 || rect.left < -1 || rect.right > viewportWidth + 1;
          return overflows ? { selector: selectorFor(element), width: element.clientWidth, scrollWidth: element.scrollWidth, rect: { left: rect.left, right: rect.right, width: rect.width, top: rect.top, bottom: rect.bottom }, position: style.position, transform: style.transform } : null;
        })
        .filter(Boolean);
      console.info("[WaveAtlas layout viewport]", describeViewport());
      if (offenders.length) console.warn("[WaveAtlas layout overflow]", offenders);
    };
    const scheduleScan = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(scan);
    };
    scheduleScan();
    window.addEventListener("resize", scheduleScan, { passive: true });
    window.addEventListener("orientationchange", scheduleScan, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleScan, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleScan, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      delete root.dataset.waveatlasDebugLayout;
      window.removeEventListener("resize", scheduleScan);
      window.removeEventListener("orientationchange", scheduleScan);
      window.visualViewport?.removeEventListener("resize", scheduleScan);
      window.visualViewport?.removeEventListener("scroll", scheduleScan);
    };
  }, [enabled]);
}

type PlayerState = {
  current?: Station;
  stationSelectionSource: StationSelectionSource;
  selectionVersion: number;
  playing: boolean;
  status: PlaybackStatus;
  volume: number;
  error?: string;
  userActivated: boolean;
  arrivalStation?: Station;
  startupQueue: Station[];
  replacementReason?: string;
  teleportQueue: Station[];
  scopedSearchSessionId: number;
  scopedSearchLabel?: string;
  setTeleportQueue: (stations: Station[]) => void;
  startScopedSearchSession: (label: string) => number;
  clearScopedSearchSession: () => void;
  clearArrivalContext: () => void;
  setArrivalStation: (station: Station, queue?: Station[]) => void;
  replaceStartupStation: (previous: Station, next: Station, reason: string) => void;
  setStation: (s: Station, source?: StationSelectionSource, selectionVersion?: number) => void;
  prepareStation: (s: Station, source?: StationSelectionSource) => void;
  toggle: () => void;
  setVolume: (n: number) => void;
  setStatus: (s: PlaybackStatus, error?: string) => void;
  stopPlayback: (message?: string) => void;
};

const usePlayer = create<PlayerState>((set) => ({
  playing: false,
  status: "idle",
  stationSelectionSource: "startup",
  selectionVersion: 0,
  volume: 1,
  userActivated: false,
  startupQueue: [],
  teleportQueue: [],
  scopedSearchSessionId: 0,
  setTeleportQueue: (teleportQueue) => set({ teleportQueue }),
  startScopedSearchSession: (scopedSearchLabel) => { const scopedSearchSessionId = Date.now() + Math.random(); set({ scopedSearchSessionId, scopedSearchLabel }); return scopedSearchSessionId; },
  clearScopedSearchSession: () => set({ scopedSearchSessionId: 0, scopedSearchLabel: undefined, teleportQueue: [] }),
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
  setStation: (current, stationSelectionSource = "manual", selectionVersion = stationSelectionVersion) =>
    set({
      current,
      stationSelectionSource,
      selectionVersion,
      playing: false,
      status: "buffering",
      error: undefined,
      userActivated: true,
    }),
  prepareStation: (current, stationSelectionSource = "startup") => {
    useNavigationEngine.getState().setActiveStation(current, stationSelectionSource);
    set((state) => ({
      current,
      stationSelectionSource,
      startupQueue: state.arrivalStation && stationKey(state.arrivalStation) === stationKey(current) ? [current, ...state.startupQueue.filter((station) => stationKey(station) !== stationKey(current))] : state.startupQueue,
      playing: false,
      status: state.userActivated ? "buffering" : "idle",
      error: undefined,
    }));
  },
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
  stopPlayback: (message) => set({ playing: false, status: "paused", error: message }),
  setStatus: (status, error) =>
    set({ status, error, playing: status === "playing" }),
}));

function stationTone(countryCode?: string): GeoPoint["tone"] {
  return countryCode === "NG" || countryCode === "GH" || countryCode === "ZA" ? "green-gold" : countryCode === "AE" || countryCode === "SG" ? "blue-gold" : "radio-gold";
}

function geotruth(station: Station): GeoPoint {
  const beacon = getActiveBeaconFeature(station);
  const resolved = resolveStationGeo(station);
  if (DEBUG_SIGNALS && beacon) console.debug("[WaveAtlas signals] active beacon coordinates", { view: "map", station: station.name, lat: beacon.geometry.coordinates[1], lng: beacon.geometry.coordinates[0], source: beacon.properties.source, precision: beacon.properties.precision });
  return { ...resolved, label: beacon?.properties.label || station.state || station.city || station.country || "Unknown location", tone: stationTone(station.country_code) };
}

const countryFallbacks: Record<string, { lat: number; lng: number; tone: GeoPoint["tone"] }> = Object.fromEntries(
  Object.entries(isoCountryCentroids).map(([code, point]) => [code, { ...point, tone: stationTone(code) }]),
);

function teleportDebugEnabled() {
  return typeof window !== "undefined" && process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_TELEPORT === "true";
}

function globeDebugEnabled() {
  return typeof window !== "undefined" && process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_GLOBE === "true";
}

function debugGlobeStationSelection(station: Station, source: StationSelectionSource, selectionVersion: number) {
  if (!globeDebugEnabled()) return;
  const geo = resolveStationGeo(station);
  console.debug("[WaveAtlas globe selection]", {
    station: station.name,
    city: station.city,
    country: station.country,
    latitude: geo.lat,
    longitude: geo.lng,
    source,
    selectionVersion,
    geoSource: geo.source,
    geoPrecision: geo.precision,
    timestamp: new Date().toISOString(),
  });
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

function debugWanderer(label: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
  console.debug(`[WaveAtlas Wanderer] ${label}`, payload);
}


let stationSelectionVersion = 0;
let wandererResolving = false;
type PlaybackRequestSource = StationSelectionSource | "search" | "discovery";
type PlaybackRequest = { id: number; source: PlaybackRequestSource; controller: AbortController; startedAt: number };
class PlaybackRequestManager {
  private active: PlaybackRequest | null = null;
  begin(source: PlaybackRequestSource) {
    this.active?.controller.abort();
    const request: PlaybackRequest = { id: (this.active?.id ?? 0) + 1, source, controller: new AbortController(), startedAt: Date.now() };
    this.active = request;
    debugPlayback("request started", { requestId: request.id, source });
    return request;
  }
  isActive(request?: Pick<PlaybackRequest, "id"> | number | null) {
    const id = typeof request === "number" ? request : request?.id;
    return Boolean(id && this.active?.id === id && !this.active.controller.signal.aborted);
  }
  signal(request: PlaybackRequest) { return request.controller.signal; }
  ignoreStale(request: Pick<PlaybackRequest, "id" | "source">, detail: Record<string, unknown> = {}) {
    debugPlayback("ignored stale request", { requestId: request.id, source: request.source, activeRequestId: this.active?.id ?? null, ...detail });
  }
}
const playbackRequests = new PlaybackRequestManager();
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

function setCurrentStationAndDestination(station: Station, source: StationSelectionSource = "manual", queue: Station[] = [], request?: PlaybackRequest) {
  if (request && !playbackRequests.isActive(request)) { playbackRequests.ignoreStale(request, { station: station.name, mutation: "setCurrentStationAndDestination" }); return undefined; }
  const version = ++stationSelectionVersion;
  debugGlobeStationSelection(station, source, version);
  warnIfStationGeoConflicts(station, geotruth(station));
  const player = usePlayer.getState();
  useNavigationEngine.getState().setActiveStation(station, source, version);
  useAtlasContext.getState().setActiveStationDestinationFromStation(station, source);
  player.setStation(station, source, version);
  if (queue.length) {
    player.setTeleportQueue(queue.filter((candidate) => stationKey(candidate) !== stationKey(station)));
  } else {
    player.clearScopedSearchSession();
  }
  return version;
}

function isCurrentStationSelection(version: number) {
  return version === stationSelectionVersion;
}


const CLOSER_STATION_PROMPT_COOLDOWN_MS = 15 * 60_000;
const CLOSER_STATION_PROMPT_DISMISS_MS = 9_000;
const SIGNIFICANT_LOCATION_CHANGE_KM = 25;
const MEANINGFULLY_CLOSER_MIN_DELTA_KM = 35;
const MEANINGFULLY_CLOSER_RATIO = 0.72;

type NearbyDiscoveryScope = "Current Location" | "City" | "County" | "State/Province" | "Country" | "Continent" | "Worldwide";
type UserGeoPoint = { lat: number; lng: number };
type NearbyDiscoveryResult = { station: Station; queue: Station[]; scope: NearbyDiscoveryScope; userLocation?: UserGeoPoint };
type CloserStationPromptState = { station: Station; queue: Station[]; message: string; userLocation: UserGeoPoint; createdAt: number };

type NearbyApiCandidate = { station: Station; distanceKm?: number };

function clampUnit(value: number) { return Math.min(1, Math.max(0, value)); }

function locationDistanceKm(a: UserGeoPoint, b: UserGeoPoint) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = clampUnit(Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function stationDistanceFromUser(station: Station, userLocation: UserGeoPoint) {
  const geo = geotruth(station);
  if (!Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return Number.POSITIVE_INFINITY;
  return locationDistanceKm(userLocation, { lat: geo.lat as number, lng: geo.lng as number });
}

function isMeaningfullyCloserStation(candidate: Station, current: Station, userLocation: UserGeoPoint) {
  if (stationKey(candidate) === stationKey(current) || !getStationStreamUrl(candidate)) return false;
  if (candidate.sourceType === "geoaudio" || current.sourceType === "geoaudio") return false;
  const currentKm = stationDistanceFromUser(current, userLocation);
  const candidateKm = stationDistanceFromUser(candidate, userLocation);
  if (!Number.isFinite(currentKm) || !Number.isFinite(candidateKm)) return false;
  if (candidateKm < 15 && currentKm - candidateKm >= 5) return true;
  return currentKm - candidateKm >= MEANINGFULLY_CLOSER_MIN_DELTA_KM && candidateKm <= currentKm * MEANINGFULLY_CLOSER_RATIO;
}

function closerStationPromptMessage(station: Station) {
  const place = station.city || station.state || station.country;
  return place ? `Found a verified station in ${place}. Switch?` : "A closer local station is available. Switch?";
}

function getBrowserLocation(timeoutMs = 2500): Promise<UserGeoPoint | undefined> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let settled = false;
    const done = (point?: UserGeoPoint) => { if (!settled) { settled = true; resolve(point); } };
    const timer = window.setTimeout(() => done(undefined), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => { window.clearTimeout(timer); done({ lat: position.coords.latitude, lng: position.coords.longitude }); },
      () => { window.clearTimeout(timer); done(undefined); },
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: timeoutMs },
    );
  });
}

async function fetchNearbyScope(scope: NearbyDiscoveryScope, userLocation?: UserGeoPoint, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: scope === "Worldwide" ? "24" : "12" });
  const zoomByScope: Record<Exclude<NearbyDiscoveryScope, "Worldwide">, string> = {
    "Current Location": "10",
    City: "8",
    County: "6",
    "State/Province": "4",
    Country: "3",
    Continent: "2",
  };
  if (scope === "Worldwide" || !userLocation) params.set("global", "true");
  else { params.set("lat", String(userLocation.lat)); params.set("lng", String(userLocation.lng)); params.set("zoom", zoomByScope[scope]); }
  const timeoutSignal = AbortSignal.timeout(4500);
  const signals = [timeoutSignal, ...(signal ? [signal] : [])];
  const response = await fetch(`/api/stations/nearby?${params.toString()}`, { signal: AbortSignal.any(signals) });
  if (!response.ok) throw new Error(`Nearby ${scope} failed`);
  const data = await response.json() as { candidates?: NearbyApiCandidate[] };
  return uniqueStationCandidates((data.candidates ?? []).map((candidate) => candidate.station).filter((station) => getStationStreamUrl(station) && station.sourceType !== "geoaudio"));
}

async function startNearbyTimeToFirstAudioDiscovery(seedStations: Station[], anchor: Station | undefined, request: PlaybackRequest): Promise<NearbyDiscoveryResult> {
  const userLocation = await getBrowserLocation();
  if (!playbackRequests.isActive(request)) { playbackRequests.ignoreStale(request, { stage: "geolocation" }); throw new DOMException("Stale playback request", "AbortError"); }
  const scopes: NearbyDiscoveryScope[] = userLocation ? ["Current Location", "City", "County", "State/Province", "Country", "Continent", "Worldwide"] : ["Worldwide"];
  for (const scope of scopes) {
    const scoped = scope === "Worldwide" && seedStations.length
      ? uniqueStationCandidates([...await fetchNearbyScope(scope, userLocation, playbackRequests.signal(request)).catch(() => []), ...seedStations]).filter((station) => getStationStreamUrl(station) && station.sourceType !== "geoaudio")
      : await fetchNearbyScope(scope, userLocation, playbackRequests.signal(request)).catch(() => []);
    const queue = uniqueStationCandidates(scoped.filter((station) => !anchor || stationKey(station) !== stationKey(anchor)));
    if (queue.length) return { station: queue[0], queue, scope, userLocation };
  }
  throw new Error("No nearby playable candidates found");
}

function readHasCompletedArrival() {
  return typeof window !== "undefined" && window.sessionStorage.getItem(ARRIVAL_COMPLETED_SESSION_KEY) === "true";
}

function markArrivalCompleted() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ARRIVAL_COMPLETED_SESSION_KEY, "true");
  window.dispatchEvent(new Event(ARRIVAL_COMPLETED_EVENT));
}

function commitTeleportStation(station: Station, queue: Station[] = [], request?: PlaybackRequest) {
  setCurrentStationAndDestination(station, "teleport", queue, request);
}

function stationLocalQueueLabel(station: Station) {
  return station.city || station.state || station.country || station.tags[0] || station.language || "these results";
}

function scopedQueueLabel(station: Station) {
  return usePlayer.getState().scopedSearchLabel || stationLocalQueueLabel(station);
}

function uniqueStationCandidates(candidates: Station[]) {
  return candidates.filter((candidate, index, all) => all.findIndex((item) => stationKey(item) === stationKey(candidate)) === index);
}

function isValidWandererCandidate(station: Station) {
  const streamUrl = getStationStreamUrl(station)?.trim();
  const geo = geotruth(station);
  return Boolean(
    station.name?.trim() &&
    streamUrl &&
    /^https?:\/\//i.test(streamUrl) &&
    station.is_active &&
    Number.isFinite(geo.lat) &&
    Number.isFinite(geo.lng),
  );
}

function deterministicWandererShuffle(stations: Station[], seed: number) {
  const keyed = stations.map((station, index) => {
    let hash = seed + index * 2654435761;
    const key = `${stationKey(station)}:${getStationStreamUrl(station)}`;
    for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    return { station, score: hash >>> 0 };
  });
  return keyed.sort((a, b) => a.score - b.score).map((item) => item.station);
}

function buildWandererCandidateQueue(stations: Station[], seed = Date.now()) {
  return deterministicWandererShuffle(uniqueStationCandidates(stations).filter(isValidWandererCandidate), seed);
}

function startWandererDiscovery(stations: Station[], seed = Date.now(), request = playbackRequests.begin("wanderer")) {
  if (wandererResolving) {
    debugWanderer("duplicate suppressed", { finalPlaybackState: usePlayer.getState().status });
    return undefined;
  }
  wandererResolving = true;
  const queue = buildWandererCandidateQueue(stations, seed);
  debugWanderer("candidates", { candidateCount: queue.length, seed });
  if (!queue.length) {
    usePlayer.getState().setStatus("failed", "No playable station found on this journey. Try again.");
    debugWanderer("final", { finalPlaybackState: "no-candidates" });
    wandererResolving = false;
    return undefined;
  }
  const [selected, ...fallbacks] = queue;
  usePlayer.getState().setStatus("buffering", "Finding a playable station...");
  debugWanderer("selected", { selectedStation: selected.name, queuedFallbacks: fallbacks.length });
  return setCurrentStationAndDestination(selected, "wanderer", fallbacks, request);
}

function playFirstSearchCandidate(candidates: Station[], source: StationSelectionSource, label: string, request = playbackRequests.begin(source)) {
  const scopedCandidates = uniqueStationCandidates(candidates).filter((station) => getStationStreamUrl(station));
  if (!scopedCandidates.length) {
    usePlayer.getState().setStatus("failed", `No playable stations found for ${label}.`);
    return undefined;
  }
  usePlayer.getState().startScopedSearchSession(label);
  return setCurrentStationAndDestination(scopedCandidates[0], source, scopedCandidates, request);
}

function setScopedStationAndDestination(station: Station, source: StationSelectionSource, candidates: Station[], label?: string, request = playbackRequests.begin(source)) {
  const scopedCandidates = uniqueStationCandidates([station, ...candidates]).filter((candidate) => getStationStreamUrl(candidate));
  const scopedLabel = label?.trim() || stationLocalQueueLabel(station);
  if (!scopedCandidates.length) {
    usePlayer.getState().setStatus("failed", `No playable stations found for ${scopedLabel}.`);
    return undefined;
  }
  const selected = scopedCandidates.find((candidate) => stationKey(candidate) === stationKey(station)) ?? scopedCandidates[0];
  usePlayer.getState().startScopedSearchSession(scopedLabel);
  return setCurrentStationAndDestination(selected, source, scopedCandidates, request);
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


type AtlasLocationState = {
  status: "idle" | "requesting" | "ready" | "denied" | "error";
  coords?: { lat: number; lng: number; accuracy: number };
  placeLabel: string;
  country?: string;
  countryCode?: string;
  city?: string;
  weather?: string;
  localTime?: string;
  error?: string;
};

type AtlasUserLocationState = AtlasLocationState & { context: "current-location" };
type ActiveStationDestinationState = {
  context: "station-destination";
  stationId?: string;
  stationName?: string;
  placeLabel: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  coords?: { lat: number; lng: number };
  updatedBy: StationSelectionSource | "startup";
};
type AtlasIntelligenceScope = "current-location" | "station-destination";

type AtlasContextState = {
  userLocation: AtlasUserLocationState;
  activeStationDestination: ActiveStationDestinationState;
  setUserLocation: (location: AtlasLocationState | ((current: AtlasUserLocationState) => AtlasLocationState)) => void;
  setActiveStationDestinationFromStation: (station: Station, source?: StationSelectionSource) => void;
};

type AtlasDestination = { label: string; city?: string; country?: string; lat: number; lng: number };
type AtlasRouteSummary = { distanceKm: number; durationMin: number; provider: string };

const initialAtlasLocationState: AtlasLocationState = {
  status: "idle",
  placeLabel: "Location off",
};

const initialActiveStationDestinationState: ActiveStationDestinationState = {
  context: "station-destination",
  placeLabel: "No station destination yet",
  updatedBy: "startup",
};

function stationDestinationState(station: Station, source: StationSelectionSource = "manual"): ActiveStationDestinationState {
  const geo = geotruth(station);
  return {
    context: "station-destination",
    stationId: station.station_uuid || station.id,
    stationName: station.name,
    placeLabel: [station.city || station.state, station.country || countryNameForCode(station.country_code)].filter(Boolean).join(", ") || destinationLabel(station),
    city: station.city || undefined,
    state: station.state || undefined,
    country: station.country || countryNameForCode(station.country_code),
    countryCode: station.country_code || undefined,
    coords: geo.lat !== null && geo.lng !== null ? { lat: geo.lat, lng: geo.lng } : undefined,
    updatedBy: source,
  };
}

const useAtlasContext = create<AtlasContextState>((set) => ({
  userLocation: { ...initialAtlasLocationState, context: "current-location" },
  activeStationDestination: initialActiveStationDestinationState,
  setUserLocation: (location) => set((state) => {
    const next = typeof location === "function" ? location(state.userLocation) : location;
    return { userLocation: { ...next, context: "current-location" } };
  }),
  setActiveStationDestinationFromStation: (station, source = "manual") => set({ activeStationDestination: stationDestinationState(station, source) }),
}));

function formatOpenMeteoWeather(code?: number) {
  if (code === undefined) return "Live weather pending";
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog nearby";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Changing skies";
}

function formatBrowserLocalTime(timeZone?: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date());
  }
}

async function enrichAtlasLocation(lat: number, lng: number, signal?: AbortSignal): Promise<Partial<AtlasLocationState>> {
  const reverseUrl = `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "10", addressdetails: "1" })}`;
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({ latitude: String(lat), longitude: String(lng), current: "temperature_2m,weather_code", timezone: "auto" })}`;
  const [reverseSettled, weatherSettled] = await Promise.allSettled([
    fetch(reverseUrl, { signal, headers: { Accept: "application/json" } }).then((response) => response.ok ? response.json() : null),
    fetch(weatherUrl, { signal }).then((response) => response.ok ? response.json() : null),
  ]);
  const reverse = reverseSettled.status === "fulfilled" ? reverseSettled.value as { address?: Record<string, string> } | null : null;
  const weather = weatherSettled.status === "fulfilled" ? weatherSettled.value as { current?: { temperature_2m?: number; weather_code?: number }; timezone?: string } | null : null;
  const address = reverse?.address ?? {};
  const city = address.city || address.town || address.village || address.hamlet || address.county;
  const country = address.country;
  const countryCode = address.country_code?.toUpperCase();
  const temperature = typeof weather?.current?.temperature_2m === "number" ? `${Math.round(weather.current.temperature_2m)}°C` : null;
  return {
    city,
    country,
    countryCode,
    placeLabel: [city, country].filter(Boolean).join(", ") || "Current location",
    weather: [temperature, formatOpenMeteoWeather(weather?.current?.weather_code)].filter(Boolean).join(" · "),
    localTime: formatBrowserLocalTime(weather?.timezone),
  };
}

function useAtlasLocation() {
  const location = useAtlasContext((state) => state.userLocation);
  const setLocation = useAtlasContext((state) => state.setUserLocation);
  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocation({ status: "error", placeLabel: "Location unavailable", error: "This browser does not support location." });
      return;
    }
    setLocation((current) => ({ ...current, status: "requesting", error: undefined, placeLabel: current.placeLabel === "Location off" ? "Locating…" : current.placeLabel }));
    const controller = new AbortController();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
        setLocation((current) => ({ ...current, status: "ready", coords, placeLabel: "Current location", localTime: formatBrowserLocalTime() }));
        void enrichAtlasLocation(coords.lat, coords.lng, controller.signal)
          .then((enrichment) => setLocation((current) => current.coords?.lat === coords.lat && current.coords?.lng === coords.lng ? { ...current, ...enrichment, status: "ready", coords } : current))
          .catch((error) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            setLocation((current) => ({ ...current, status: "ready", coords, error: "Open location context is temporarily unavailable." }));
          });
      },
      (error) => setLocation({ status: error.code === error.PERMISSION_DENIED ? "denied" : "error", placeLabel: error.code === error.PERMISSION_DENIED ? "Location blocked" : "Location unavailable", error: error.message || "Unable to read browser location." }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
    );
    return () => controller.abort();
  }, [setLocation]);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return;
    let cancelled = false;
    navigator.permissions.query({ name: "geolocation" as PermissionName }).then((permission) => {
      if (!cancelled && permission.state === "granted") requestLocation();
      permission.onchange = () => { if (permission.state === "granted") requestLocation(); };
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [requestLocation]);
  return { location, requestLocation };
}

async function searchAtlasDestinations(query: string, signal?: AbortSignal): Promise<AtlasDestination[]> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: "jsonv2", q: query, limit: "5", addressdetails: "1" })}`;
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) return [];
  const rows = await response.json() as Array<{ display_name: string; lat: string; lon: string; address?: Record<string, string> }>;
  return rows.map((row) => ({ label: row.display_name, city: row.address?.city || row.address?.town || row.address?.village || row.address?.county, country: row.address?.country, lat: Number(row.lat), lng: Number(row.lon) })).filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
}

async function routeAtlasDrive(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }, signal?: AbortSignal): Promise<AtlasRouteSummary | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false&alternatives=false&steps=false`;
  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  const data = await response.json() as { routes?: Array<{ distance: number; duration: number }> };
  const route = data.routes?.[0];
  return route ? { distanceKm: Math.round(route.distance / 100) / 10, durationMin: Math.max(1, Math.round(route.duration / 60)), provider: "OSRM / OpenStreetMap" } : null;
}

function nearbyStationsForLocation(stations: Station[], coords?: { lat: number; lng: number }, countryCode?: string) {
  if (!coords) return [];
  return stations
    .map((station) => {
      const geo = geotruth(station);
      const distance = geo.lat === null || geo.lng === null ? null : haversineKm(coords, { lat: geo.lat, lng: geo.lng });
      const countryBoost = countryCode && station.country_code === countryCode ? -250 : 0;
      return { station, distance, score: (distance ?? 25000) + countryBoost - station.health_score };
    })
    .filter((item) => item.distance !== null || (countryCode && item.station.country_code === countryCode))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
}

function AtlasLocationPill({ stations, current, mobile = false }: { stations: Station[]; current: Station; mobile?: boolean }) {
  const { location, requestLocation } = useAtlasLocation();
  const activeStationDestination = useAtlasContext((state) => state.activeStationDestination);
  const [collapsed, setCollapsed] = useState(false);
  const [intelligenceScope, setIntelligenceScope] = useState<AtlasIntelligenceScope>("current-location");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationResults, setDestinationResults] = useState<AtlasDestination[]>([]);
  const [destination, setDestination] = useState<AtlasDestination | null>(null);
  const [route, setRoute] = useState<AtlasRouteSummary | null>(null);
  const [routeStatus, setRouteStatus] = useState<"idle" | "searching" | "routing" | "fallback">("idle");
  const nearby = useMemo(() => nearbyStationsForLocation(stations, location.coords, location.countryCode), [location.coords, location.countryCode, stations]);
  const destinationStations = useMemo(() => nearbyStationsForLocation(stations, destination ? { lat: destination.lat, lng: destination.lng } : activeStationDestination.coords, destination ? undefined : activeStationDestination.countryCode), [activeStationDestination.coords, activeStationDestination.countryCode, destination, stations]);
  const isReady = location.status === "ready";
  const canCollapse = isReady || location.status === "denied" || location.status === "error";
  useEffect(() => { if (!canCollapse) return; const timeout = window.setTimeout(() => setCollapsed(true), 1800); return () => window.clearTimeout(timeout); }, [canCollapse, location.placeLabel]);
  useEffect(() => {
    if (destinationQuery.trim().length < 3) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { setRouteStatus("searching"); void searchAtlasDestinations(destinationQuery, controller.signal).then(setDestinationResults).finally(() => setRouteStatus("idle")); }, 350);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [destinationQuery]);
  useEffect(() => {
    if (!location.coords || !destination) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setRouteStatus("routing");
      void routeAtlasDrive(location.coords!, destination, controller.signal).then((summary) => { setRoute(summary); setRouteStatus(summary ? "idle" : "fallback"); }).catch(() => setRouteStatus("fallback"));
    }, 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [destination, location.coords]);
  const originLabel = isReady ? `My Location · ${location.placeLabel}` : location.status === "denied" ? "Manual origin · location blocked" : "My Location";
  const chipLabel = isReady ? `Atlas Drive · ${location.city || location.placeLabel}` : "Atlas Drive · Use my location";
  const scopeLabel = intelligenceScope === "current-location" ? "Current Location Intelligence" : "Station Destination Intelligence";
  const scopeDetail = intelligenceScope === "current-location" ? (isReady ? location.placeLabel : "Location permission not available; station destination is preserved.") : activeStationDestination.placeLabel;
  const visibleStations = intelligenceScope === "current-location" && !destination ? nearby : destinationStations;
  const tuneDestination = () => { const station = destinationStations[0]?.station; if (station) setCurrentStationAndDestination(station, "atlas-drive"); };
  return (
    <div className={`pointer-events-auto border border-white/10 bg-slate-950/72 text-ivory shadow-2xl backdrop-blur-2xl transition-all ${mobile ? "fixed bottom-[calc(env(safe-area-inset-bottom)+104px)] left-3 z-[57] w-[min(23rem,calc(100vw-1.5rem))] rounded-[1.35rem] p-2.5" : "w-[min(380px,calc(100vw-3rem))] rounded-[1.5rem] p-3"}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => canCollapse ? setCollapsed((value) => !value) : requestLocation()} className="min-w-0 flex-1 text-left" aria-expanded={!collapsed}>
          <p className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-radio/85">Atlas Drive</p>
          <h2 className="mt-0.5 truncate text-xs font-semibold text-white">{collapsed ? chipLabel : originLabel}</h2>
          {!collapsed ? <p className="mt-1 truncate text-[11px] text-ivory/55">{location.weather || "Free OSM destination search and station routing."}</p> : null}
        </button>
        <button type="button" onClick={requestLocation} className="grid size-8 shrink-0 place-items-center rounded-full border border-radio/25 bg-radio/10 text-radio transition hover:bg-radio hover:text-midnight" aria-label="Use current location"><Navigation className={`size-3.5 ${location.status === "requesting" ? "animate-pulse" : ""}`} /></button>
      </div>
      {location.error && !collapsed ? <p className="mt-2 text-xs text-gold/85">{location.error} {location.status === "denied" ? "Enable location in browser settings or search a destination manually. Station destination will not be overwritten." : null}</p> : null}
      {!collapsed ? <div className="mt-2 grid gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/8 bg-white/[0.04] p-1" role="tablist" aria-label="Intelligence context">
          {(["current-location", "station-destination"] as const).map((scope) => <button key={scope} type="button" onClick={() => setIntelligenceScope(scope)} role="tab" className={`rounded-xl px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${intelligenceScope === scope ? "bg-radio text-midnight" : "text-ivory/55 hover:bg-white/8"}`} aria-selected={intelligenceScope === scope}>{scope === "current-location" ? "Current Location" : "Station Destination"}</button>)}
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.045] px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-radio/80">{scopeLabel}</p><p className="mt-1 text-[11px] text-ivory/70">{scopeDetail}</p></div>
        <label className="rounded-2xl border border-white/8 bg-white/[0.05] px-3 py-2 text-left"><span className="block text-[9px] uppercase tracking-[0.18em] text-ivory/45">Manual destination search</span><input value={destinationQuery} onChange={(event) => { setDestinationQuery(event.target.value); setDestination(null); setRoute(null); if (event.target.value.trim().length < 3) setDestinationResults([]); }} onFocus={() => setCollapsed(false)} placeholder="Where are you going?" className="mt-1 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-ivory/35" /></label>
        {destinationResults.length && !destination ? <div className="grid max-h-36 gap-1 overflow-y-auto">{destinationResults.map((result) => <button key={`${result.lat}-${result.lng}`} type="button" onClick={() => { setDestination(result); setDestinationQuery(result.city || result.label); setDestinationResults([]); }} className="rounded-xl bg-white/[0.06] px-3 py-2 text-left text-[11px] text-ivory/75 hover:bg-radio/10"><b className="block truncate text-white">{result.city || result.country || "Destination"}</b><span className="line-clamp-1">{result.label}</span></button>)}</div> : null}
        {destination ? <div className="rounded-2xl border border-radio/15 bg-radio/10 p-3 text-[11px]"><b className="block text-white">{destination.city || destination.country || "Destination selected"}</b><span className="text-ivory/65">{route ? `${route.distanceKm.toLocaleString()} km · ${route.durationMin} min · ${route.provider}` : routeStatus === "routing" ? "Calculating free route…" : "Route unavailable; tuning destination signals."}</span><div className="mt-2 flex gap-2"><button type="button" onClick={tuneDestination} disabled={!destinationStations.length} className="rounded-full bg-radio px-3 py-1.5 font-semibold text-midnight disabled:opacity-45">Tune destination</button><button type="button" className="rounded-full border border-white/10 px-3 py-1.5 text-ivory/75">Preview route</button></div></div> : null}
        {visibleStations.map(({ station, distance }) => <button key={station.id} type="button" onClick={() => setCurrentStationAndDestination(station, destination || intelligenceScope === "station-destination" ? "atlas-drive" : "auto")} className="flex items-center justify-between gap-2 rounded-2xl border border-white/8 bg-white/[0.05] px-2.5 py-1.5 text-left transition hover:border-radio/35 hover:bg-radio/10"><span className="min-w-0"><b className="block truncate text-[11px] text-white">{station.name}</b><span className="block truncate text-[10px] text-ivory/55">{[station.city || station.state, station.country].filter(Boolean).join(" · ")} {distance !== null ? `· ${distance.toLocaleString()} km` : "· regional signal"}</span></span><Radio className="size-3.5 shrink-0 text-gold" /></button>)}
      </div> : null}
    </div>
  );
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


function useLiveTrackMetadata(station: Station) {
  const { status } = usePlayer();
  const [state, setState] = useState<LiveTrackMetadataState>({ status: "idle" });
  const engineRef = useRef<LiveTrackMetadataEngine | null>(null);

  useEffect(() => {
    engineRef.current ??= new LiveTrackMetadataEngine(setState);
    engineRef.current.start(station, status);
    return () => engineRef.current?.stop(false);
  }, [station, status]);

  return state;
}

function NowPlayingEnrichmentCard({ station }: { station: Station }) {
  const state = useLiveTrackMetadata(station);
  const track = state.metadata;
  if (state.status === "disabled" || state.status === "idle" || state.status === "unsupported") return null;
  if (!track && (state.status === "unrecognized" || state.status === "error")) return null;
  return (
    <div className="rounded-3xl border border-radio/20 bg-radio/[0.07] p-4 shadow-[0_18px_45px_rgba(0,0,0,.18)]">
      <div className="flex items-start gap-3">
        {track?.coverArtUrl ? <Image src={track.coverArtUrl} alt="Song cover art" width={64} height={64} className="size-16 rounded-2xl object-cover" /> : <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]"><Mic className="size-6 text-radio" /></div>}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-radio">Song metadata · optional enrichment</p>
          {track ? (
            <>
              <h3 className="mt-1 truncate text-lg font-semibold text-white">{track.title}</h3>
              <p className="truncate text-sm text-ivory/72">{track.artist}</p>
              <p className="mt-1 text-xs text-ivory/48">{[track.album, track.releaseYear].filter(Boolean).join(" · ") || "Album details unavailable"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium text-ivory/58">
                <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1">Source: {track.provider}</span>
                <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1">Confidence: {Math.round(track.confidence * 100)}%</span>
                {track.isrc ? <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1">ISRC: {track.isrc}</span> : null}
              </div>
            </>
          ) : <p className="mt-2 text-sm text-ivory/65">Identifying the current song without interrupting playback…</p>}
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-ivory/45">Station identity stays separate: {station.name} remains the live radio source. If recognition fails, WaveAtlas shows station info only.</p>
    </div>
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

function StationIntelligencePanel({ station, stations, inventoryStats, setQuery }: { station: Station; stations: Station[]; inventoryStats?: StationInventoryStats; setQuery: (q: string) => void }) {
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
      <DailyFlightPanel stations={stations} inventoryStats={inventoryStats} activeStation={station} />
      <PlaceHero context={visibleWorldContext} stationName={station.name} fallbackPlace={[station.city || station.state, station.country].filter(Boolean).join(", ")} isPlaying={playing || status === "buffering"} />
      <NowPlayingEnrichmentCard station={station} />
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
const SIGNAL_SPLASH_PHASE_MS = 1000;
const SIGNAL_SPLASH_DONE_MS = 4800;

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
    const phaseTimer = window.setInterval(() => setPhase((p) => (p + 1) % signalInitializationPhases.length), SIGNAL_SPLASH_PHASE_MS);
    const doneTimer = window.setTimeout(dismiss, SIGNAL_SPLASH_DONE_MS);
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
      <div className="mt-8 rounded-full border border-white/10 bg-white/[0.035] px-5 py-3 shadow-[0_12px_40px_rgba(0,0,0,.18)] backdrop-blur-md">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-ivory/65">Built by ETL GIS Consulting LLC</p>
        <p className="mt-1 text-[11px] font-medium tracking-[0.18em] text-gold/65">GIS • AI • Automation • Digital Modernization</p>
      </div>
    </div>
    <p className="absolute bottom-8 left-1/2 w-full max-w-sm -translate-x-1/2 px-6 text-center text-[11px] font-medium tracking-wide text-ivory/35 sm:bottom-10">Initializing the global radio atlas</p>
  </motion.div> : null}</AnimatePresence>;
}

type EmptyAtlasActionHandler = () => void | string | Promise<void | string>;

function EmptyAtlasState({ onExploreNearby, onWander, onSearch, onVoiceSearch, onEditorialPicks }: { onExploreNearby: EmptyAtlasActionHandler; onWander: EmptyAtlasActionHandler; onSearch: EmptyAtlasActionHandler; onVoiceSearch: EmptyAtlasActionHandler; onEditorialPicks: EmptyAtlasActionHandler }) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const loadingTimer = useRef<number | null>(null);
  const actions = [
    [Navigation, "Explore Nearby", onExploreNearby],
    [Compass, "Wander", onWander],
    [Search, "Search", onSearch],
    [Mic, "Voice Search", onVoiceSearch],
    [Newspaper, "Editorial Picks", onEditorialPicks],
  ] as const;
  const actionPendingRef = useRef(false);
  const runAction = useCallback((label: string, action: EmptyAtlasActionHandler) => {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    if (process.env.NODE_ENV === "development") console.debug(`[EmptyAtlas] ${label} CTA tapped`);
    setActionMessage(`${label} requested…`);
    if (loadingTimer.current) window.clearTimeout(loadingTimer.current);
    loadingTimer.current = window.setTimeout(() => setPendingAction(label), 200);
    Promise.resolve()
      .then(action)
      .then((message) => {
        setActionMessage(message || `${label} is ready. If nothing changed, try again or use Search to start exploring.`);
      })
      .catch((error) => {
        setActionMessage(`${label} is temporarily unavailable. Please try Search or Wander instead.`);
        if (process.env.NODE_ENV === "development") console.error(`[EmptyAtlas] ${label} action failed`, error);
      })
      .finally(() => {
        if (loadingTimer.current) { window.clearTimeout(loadingTimer.current); loadingTimer.current = null; }
        actionPendingRef.current = false;
        setPendingAction(null);
      });
  }, []);
  useEffect(() => () => { if (loadingTimer.current) window.clearTimeout(loadingTimer.current); }, []);
  return <div className="grid h-full min-h-[100dvh] place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(0,214,143,.16),transparent_24%),linear-gradient(135deg,#020617,#07111f_52%,#031713)] px-5 text-center text-ivory">
    <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:56px_56px]" />
    <div className="relative max-w-3xl rounded-[2rem] border border-white/10 bg-slate-950/45 p-6 shadow-[0_28px_90px_rgba(0,0,0,.45)] backdrop-blur-2xl sm:p-8">
      <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-radio">Empty Atlas</p>
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-[-0.04em] text-white sm:text-6xl">The world is waiting.</h1>
      <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-ivory/68">Search, wander, or explore nearby to begin your next listening journey.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {actions.map(([Icon, label, action], index) => { const I = Icon as typeof Search; const busy = pendingAction === label; return <button key={label} type="button" onClick={() => runAction(label, action)} disabled={Boolean(pendingAction)} aria-busy={busy} className={`pointer-events-auto relative z-[2] touch-manipulation rounded-full px-5 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-wait disabled:opacity-70 ${index === 0 ? "bg-radio text-midnight shadow-[0_0_26px_rgba(54,245,162,.28)]" : "border border-white/12 bg-white/[0.05] text-ivory/78 hover:border-radio/35 hover:text-radio"}`}><I className="mr-2 inline size-4" />{busy ? `${label}…` : label}</button>; })}
      </div>
      {actionMessage ? <p role="status" className="mx-auto mt-4 max-w-lg rounded-2xl border border-radio/20 bg-radio/10 px-4 py-3 text-sm font-medium text-radio">{actionMessage}</p> : null}
    </div>
  </div>;
}

function AudioEngine({ stations }: { stations: Station[] }) {
  const { current, status, volume, userActivated, stationSelectionSource, scopedSearchSessionId, setStatus, stopPlayback } = usePlayer();
  const audio = useRef<HTMLAudioElement | null>(null);
  const attempted = useRef<string[]>([]);
  const skipTimestamps = useRef<number[]>([]);
  const currentKey = current ? stationKey(current) : "";
  const scopedAttemptSession = useRef(0);
  const failedGeoAudioUrls = useRef<Record<string, Set<string>>>({});
  const playNextGeoAudioTrack = useCallback((albumStation: Station, reason = "next_track") => {
    if (albumStation.sourceType !== "geoaudio") return false;
    const journeyKey = albumStation.station_uuid;
    const currentUrl = getStationStreamUrl(albumStation);
    if (reason === "failed_track" && currentUrl) {
      failedGeoAudioUrls.current[journeyKey] ??= new Set<string>();
      failedGeoAudioUrls.current[journeyKey].add(currentUrl);
    }
    const failedUrls = failedGeoAudioUrls.current[journeyKey] ?? new Set<string>();
    const tracks = albumStation.geoAudio?.tracks.map((track, index) => ({ ...track, index })).filter((track) => Boolean(track.url) && !failedUrls.has(track.url)) ?? [];
    if (tracks.length < 1) {
      setStatus("failed", "This GeoAudio Journey is temporarily unavailable.");
      return true;
    }
    const currentIndex = tracks.findIndex((track) => track.url === currentUrl || track.url === albumStation.url || geoAudioTrackId(albumStation, track.index) === albumStation.geoAudio?.currentTrackId);
    const nextTrack = reason === "failed_track" ? tracks.find((track) => track.index > (currentIndex >= 0 ? tracks[currentIndex].index : -1)) ?? tracks.find((track) => track.url !== currentUrl) : tracks.find((track) => track.index > (currentIndex >= 0 ? tracks[currentIndex].index : -1));
    if (!nextTrack) {
      stopPlayback(`${albumStation.geoAudio?.albumTitle ?? "GeoAudio"} journey complete.`);
      return true;
    }
    const nextStation = buildGeoAudioTrackStation(albumStation, nextTrack.index);
    if (!nextStation) {
      setStatus("failed", "This GeoAudio Journey is temporarily unavailable.");
      return true;
    }
    setStatus("buffering", reason === "ended" ? `Advancing ${albumStation.geoAudio?.albumTitle ?? "GeoAudio"} journey…` : "Skipping to the next GeoAudio journey track…");
    setCurrentStationAndDestination(nextStation, "manual", [albumStation]);
    return true;
  }, [setStatus, stopPlayback]);

  const skipToNextCandidate = useCallback((failed: Station, errorType: SignalFailureType, detail?: string) => {
    const hardFailure = ["audio_error", "network_error", "unsupported_media", "autoplay_blocked", "missing_url", "abort", "playback_error"].includes(errorType);
    const state = usePlayer.getState();
    const hasScopedQueue = state.scopedSearchSessionId > 0;
    if (failed.sourceType === "geoaudio") return playNextGeoAudioTrack(failed, "failed_track");
    const now = Date.now();
    skipTimestamps.current = skipTimestamps.current.filter((timestamp) => now - timestamp < 20000);
    if (!hasScopedQueue && !hardFailure && skipTimestamps.current.length >= 2) {
      setStatus("buffering", "Finding a stronger live signal…");
      return false;
    }
    skipTimestamps.current = [...skipTimestamps.current, now];
    if (!(state.stationSelectionSource === "manual" && isCuratedStation(failed))) markStationFailure(failed, errorType, detail);
    attempted.current = [...new Set([...attempted.current, stationKey(failed), getStationStreamUrl(failed)])];
    const manualSelection = state.stationSelectionSource === "manual";
    debugPlayback("fallback check", { station: failed.name, country: failed.country, source: failed.curation_source || failed.curation_tier || "radio_browser", stationSelectionSource: state.stationSelectionSource, failed: failed.name, errorType, detail, healthPenaltyApplied: !(state.stationSelectionSource === "manual" && isCuratedStation(failed)) });
    debugTeleport("playback fallback check", { stationSelectionSource: state.stationSelectionSource, failed: failed.name, errorType, detail });
    if (manualSelection && !hasScopedQueue && !hardFailure) {
      setStatus("buffering", "Holding the selected signal…");
      return false;
    }
    if (isCuratedStation(failed) && failed.country_code === "NG" && (errorType === "waiting" || errorType === "stalled")) {
      setStatus("buffering", "Holding the Nigerian signal…");
      return false;
    }
    const failedContinent = stationContinent(failed);
    const isUnattempted = (station: Station) => !attempted.current.includes(stationKey(station)) && !attempted.current.includes(getStationStreamUrl(station));
    const queueFallback = state.teleportQueue.find(isUnattempted);
    const fallback = queueFallback;
    if (fallback) {
      const reason = errorType === "startup_timeout" || errorType === "waiting" || errorType === "stalled" ? "weak_signal" : "fallback";
      debugPlayback("fallback selected", { station: failed.name, country: failed.country, source: failed.curation_source || failed.curation_tier || "radio_browser", stationSelectionSource: state.stationSelectionSource, skipReason: errorType, fallbackStation: fallback.name });
      debugTeleport("fast-connect fallback", { failed: failed.name, failedContinent, replacement: fallback.name, replacementContinent: stationContinent(fallback), reason, usedTeleportQueue: Boolean(queueFallback), ignoredArrivalContext: Boolean(state.arrivalStation) });
      setStatus("buffering", state.stationSelectionSource === "wanderer" ? "Finding a playable station..." : queueFallback ? `Trying next station in ${scopedQueueLabel(fallback)}…` : FAST_CONNECT_COPY.retrying);
      if (state.stationSelectionSource === "wanderer") debugWanderer("failed candidate", { failedCandidate: failed.name, errorType, detail, nextCandidate: fallback.name, remainingCandidates: state.teleportQueue.length - 1 });
      setCurrentStationAndDestination(fallback, state.stationSelectionSource, state.teleportQueue.filter((station) => stationKey(station) !== stationKey(fallback)));
      return true;
    }
    if (hasScopedQueue) state.clearScopedSearchSession();
    if (state.stationSelectionSource === "wanderer") {
      debugWanderer("final", { finalPlaybackState: "exhausted", failedCandidates: attempted.current });
      wandererResolving = false;
      setStatus("failed", "No playable station found on this journey. Try again.");
    } else {
      setStatus("failed", hasScopedQueue ? "No playable station was found in this result set. Try another location, genre, or journey." : "No playable station was found in this result set. Try another location, genre, or journey.");
    }
    return false;
  }, [setStatus, playNextGeoAudioTrack]);

  useEffect(() => {
    if (!current) return;
    const queue = buildFastConnectQueue(stations, current, FAST_CONNECT_PARALLEL_CANDIDATES - 1);
    const state = usePlayer.getState();
    if (state.scopedSearchSessionId > 0) {
      if (scopedAttemptSession.current !== scopedSearchSessionId) {
        scopedAttemptSession.current = scopedSearchSessionId;
        attempted.current = [];
      }
      attempted.current = [...new Set([...attempted.current, stationKey(current)])];
    } else {
      scopedAttemptSession.current = 0;
      attempted.current = [stationKey(current)];
    }
    if (queue.length > 1) setStatus("buffering", state.stationSelectionSource === "manual" ? "Holding the selected signal…" : getAdaptiveBufferPolicy(current).message);
  }, [currentKey, current, scopedSearchSessionId, setStatus, stations]);

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

    if (current.sourceType !== "geoaudio" && !/^https?:\/\//i.test(streamUrl)) {
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
      window.dispatchEvent(new CustomEvent("waveatlas:station-playing", { detail: { station: current, source: selectionSource } }));
      if (selectionSource === "wanderer") {
        debugWanderer("final", { selectedStation: current.name, finalPlaybackState: "playing" });
        wandererResolving = false;
      }
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
    const onEnded = () => { logAudioEvent("ended"); if (current.sourceType === "geoaudio") playNextGeoAudioTrack(current, "ended"); };
    scheduleStartupTimer();

    element.addEventListener("loadedmetadata", onLoadedMetadata);
    element.addEventListener("canplay", onCanPlay);
    element.addEventListener("playing", onPlaying);
    element.addEventListener("timeupdate", noteProgress);
    element.addEventListener("progress", noteProgress);
    element.addEventListener("waiting", onWaiting);
    element.addEventListener("stalled", onStalled);
    element.addEventListener("abort", onAbort);
    element.addEventListener("ended", onEnded);

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
          if (selectionSource === "wanderer") wandererResolving = false;
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
      element.removeEventListener("ended", onEnded);
    };
  }, [current, currentKey, status, userActivated, stationSelectionSource, setStatus, volume, stations, skipToNextCandidate, playNextGeoAudioTrack]);

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

const TRANSITION_DEBOUNCE_MS = 1500;
const DEBUG_TRANSITIONS = process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_TRANSITIONS === "true";

type AtlasViewErrorBoundaryProps = { children: ReactNode; fallback: ReactNode; name: string; onError?: (error: Error, errorInfo: ErrorInfo) => void };
type AtlasViewErrorBoundaryState = { error: Error | null };

class AtlasViewErrorBoundary extends Component<AtlasViewErrorBoundaryProps, AtlasViewErrorBoundaryState> {
  state: AtlasViewErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[WaveAtlas ${this.props.name}] view error boundary`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

function readViewportSnapshot() {
  if (typeof window === "undefined") return null;
  return {
    layout: { width: window.innerWidth, height: window.innerHeight },
    visual: window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop, offsetLeft: window.visualViewport.offsetLeft, scale: window.visualViewport.scale } : null,
    devicePixelRatio: window.devicePixelRatio,
  };
}

function checkCanvasReadiness() {
  const unavailable = (reason: string, detail: Record<string, unknown> = {}) => {
    const result = { ready: false, canvasReady: false, webglReady: false, webgl2Ready: false, reason };
    if (DEBUG_TRANSITIONS) console.info("[WaveAtlas transition] WebGL readiness result", { ...result, ...detail, viewport: readViewportSnapshot(), timestamp: Date.now() });
    return result;
  };
  if (typeof document === "undefined") return unavailable("Canvas readiness cannot be checked on the server.");
  try {
    const canvas2d = document.createElement("canvas");
    canvas2d.width = 8; canvas2d.height = 8;
    const ctx2d = canvas2d.getContext("2d");
    const canvasReady = Boolean(ctx2d);

    const webglCanvas = document.createElement("canvas");
    webglCanvas.width = 8; webglCanvas.height = 8;
    let webgl: WebGLRenderingContext | null = null;
    let webgl2: WebGL2RenderingContext | null = null;
    let webglError: string | null = null;
    try { webgl2 = webglCanvas.getContext("webgl2"); } catch (error) { webglError = error instanceof Error ? error.message : "WebGL2 context creation threw."; }
    try { webgl = webglCanvas.getContext("webgl") || webglCanvas.getContext("experimental-webgl") as WebGLRenderingContext | null; } catch (error) { webglError = webglError ?? (error instanceof Error ? error.message : "WebGL context creation threw."); }
    const webglReady = Boolean(webgl || webgl2);
    const result = { ready: canvasReady && webglReady, canvasReady, webglReady, webgl2Ready: Boolean(webgl2), reason: canvasReady && webglReady ? undefined : !canvasReady ? "2D canvas context unavailable." : webglError || "WebGL unavailable; staying in the 2D atlas." };
    if (DEBUG_TRANSITIONS) console.info("[WaveAtlas transition] WebGL readiness result", { ...result, webgl1Ready: Boolean(webgl), separateWebglProbe: true, viewport: readViewportSnapshot(), timestamp: Date.now() });
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Canvas readiness check failed.";
    console.warn("[WaveAtlas transition] canvas readiness failed", { reason, viewport: readViewportSnapshot(), timestamp: Date.now() });
    return { ready: false, canvasReady: false, webglReady: false, webgl2Ready: false, reason };
  }
}

function logAtlasTransitionDiagnostics(label: string, detail: Record<string, unknown>) {
  if (!DEBUG_TRANSITIONS) return;
  console.info(`[WaveAtlas transition] ${label}`, { ...detail, viewport: readViewportSnapshot(), timestamp: Date.now() });
}


type AtlasTransitionDirection = "globe-to-map" | "map-to-globe";
type AtlasTransitionState = { currentView: AtlasViewMode; transitioning: boolean; transitionDirection: AtlasTransitionDirection | null; transitionVersion: number; lastTransitionAt: number; activeStationId?: string; activeCoordinates?: { lat: number; lng: number } | null; fallbackReason?: string; context: AtlasTransitionContext | null };
type AtlasTransitionControllerOptions = { initialView: AtlasViewMode; activeStation: Station; onViewChange: (view: AtlasViewMode) => void; onPersistView?: (view: AtlasViewMode) => void; onFallback?: (reason: string) => void };

function useAtlasTransitionController({ initialView, activeStation, onViewChange, onPersistView, onFallback }: AtlasTransitionControllerOptions) {
  const stationRef = useRef(activeStation);
  const lockRef = useRef(false);
  const transitionTimeoutRef = useRef<number | null>(null);
  const viewChangeTimeoutRef = useRef<number | null>(null);
  const fallbackWarningTimeoutRef = useRef<number | null>(null);
  const transitionIdRef = useRef(0);
  const lastFireRef = useRef<Record<AtlasTransitionDirection, number>>({ "globe-to-map": 0, "map-to-globe": 0 });
  const [state, setState] = useState<AtlasTransitionState>({ currentView: initialView, transitioning: false, transitionDirection: null, transitionVersion: 0, lastTransitionAt: 0, activeStationId: activeStation.station_uuid || activeStation.id, activeCoordinates: null, context: null });

  useEffect(() => { stationRef.current = activeStation; }, [activeStation]);

  const debug = useCallback((label: string, detail: Record<string, unknown>) => logAtlasTransitionDiagnostics(label, { ...detail, transitionLocked: lockRef.current, transitionId: transitionIdRef.current, activeStation: stationRef.current.name, stationId: stationRef.current.station_uuid || stationRef.current.id }), []);
  const clearTimeouts = useCallback(() => {
    if (transitionTimeoutRef.current) window.clearTimeout(transitionTimeoutRef.current);
    if (viewChangeTimeoutRef.current) window.clearTimeout(viewChangeTimeoutRef.current);
    if (fallbackWarningTimeoutRef.current) window.clearTimeout(fallbackWarningTimeoutRef.current);
    transitionTimeoutRef.current = null; viewChangeTimeoutRef.current = null; fallbackWarningTimeoutRef.current = null;
  }, []);
  useEffect(() => () => clearTimeouts(), [clearTimeouts]);
  useEffect(() => {
    if (state.currentView !== initialView) debug("controller.currentView differs from parent atlasView", { controllerCurrentView: state.currentView, parentAtlasView: initialView, fallbackReason: state.fallbackReason ?? null });
  }, [debug, initialView, state.currentView, state.fallbackReason]);
  const preserveContext = useCallback((context?: AtlasTransitionContext | null) => {
    const activeCoordinates = context ? { lat: context.lat, lng: context.lng } : null;
    setState((prev) => ({ ...prev, context: context ?? prev.context, activeCoordinates: activeCoordinates ?? prev.activeCoordinates, activeStationId: context?.stationId || stationRef.current.station_uuid || stationRef.current.id }));
  }, []);
  const canTransition = useCallback((direction: AtlasTransitionDirection) => {
    const now = Date.now();
    const elapsedMs = now - lastFireRef.current[direction];
    const allowed = !lockRef.current && elapsedMs >= TRANSITION_DEBOUNCE_MS;
    debug(allowed ? "transition accepted" : "transition rejected", { direction, elapsedMs, debounceMs: TRANSITION_DEBOUNCE_MS, reason: allowed ? "available" : lockRef.current ? "transition locked" : "debounced duplicate" });
    return allowed;
  }, [debug]);
  const lockTransition = useCallback((direction: AtlasTransitionDirection, context?: AtlasTransitionContext | null) => {
    clearTimeouts();
    const now = Date.now();
    const transitionId = ++transitionIdRef.current;
    lockRef.current = true;
    lastFireRef.current[direction] = now;
    fallbackWarningTimeoutRef.current = window.setTimeout(() => debug("Globe disabled longer than 5 seconds", { direction, transitionId, fallbackReason: state.fallbackReason ?? null }), 5000);
    setState((prev) => ({ ...prev, transitioning: true, transitionDirection: direction, transitionVersion: prev.transitionVersion + 1, lastTransitionAt: now, fallbackReason: direction === "map-to-globe" ? undefined : prev.fallbackReason, context: context ?? prev.context, activeCoordinates: context ? { lat: context.lat, lng: context.lng } : prev.activeCoordinates, activeStationId: context?.stationId || stationRef.current.station_uuid || stationRef.current.id }));
    return transitionId;
  }, [clearTimeouts, debug, state.fallbackReason]);
  const completeTransition = useCallback((transitionId?: number) => {
    if (transitionId && transitionId !== transitionIdRef.current) { debug("old transition callback executes after a newer transition", { callback: "completeTransition", callbackTransitionId: transitionId, activeTransitionId: transitionIdRef.current }); return; }
    lockRef.current = false; clearTimeouts(); setState((prev) => ({ ...prev, transitioning: false, transitionDirection: null }));
  }, [clearTimeouts, debug]);
  const clearFallback = useCallback(() => setState((prev) => ({ ...prev, fallbackReason: undefined })), []);
  const failTransition = useCallback((reason: string, options: { webglUnavailable?: boolean } = {}) => {
    clearTimeouts(); ++transitionIdRef.current; lockRef.current = false;
    debug("transition failed", { reason, webglUnavailable: Boolean(options.webglUnavailable) });
    setState((prev) => ({ ...prev, transitioning: false, transitionDirection: null, fallbackReason: options.webglUnavailable ? reason : prev.fallbackReason, currentView: "map", activeStationId: prev.activeStationId || stationRef.current.station_uuid || stationRef.current.id }));
    onViewChange("map"); onPersistView?.("map");
    if (options.webglUnavailable) onFallback?.(reason);
  }, [clearTimeouts, debug, onFallback, onPersistView, onViewChange]);
  const requestGlobeToMap = useCallback((reason: string, context?: AtlasTransitionContext | null) => {
    debug("transition request", { direction: "globe-to-map", reason, context, viewBefore: state.currentView });
    if (!canTransition("globe-to-map")) return false;
    const transitionId = lockTransition("globe-to-map", context); preserveContext(context); onViewChange("map"); onPersistView?.("map");
    setState((prev) => ({ ...prev, currentView: "map" })); transitionTimeoutRef.current = window.setTimeout(() => completeTransition(transitionId), TRANSITION_DEBOUNCE_MS); return true;
  }, [canTransition, completeTransition, debug, lockTransition, onPersistView, onViewChange, preserveContext, state.currentView]);
  const requestMapToGlobe = useCallback((reason: string, context?: AtlasTransitionContext | null) => {
    debug("transition request", { direction: "map-to-globe", reason, context, viewBefore: state.currentView });
    if (!canTransition("map-to-globe")) return false;
    const readiness = checkCanvasReadiness();
    debug("globe readiness result", { reason, ready: readiness.ready, canvasReady: readiness.canvasReady, webglReady: readiness.webglReady, webgl2Ready: readiness.webgl2Ready, readinessReason: readiness.reason ?? null, fallbackReason: state.fallbackReason ?? null });
    if (!readiness.ready) { failTransition(readiness.reason || "Globe view is unavailable on this device right now.", { webglUnavailable: !readiness.webglReady }); return false; }
    clearFallback();
    const transitionId = lockTransition("map-to-globe", context); preserveContext(context);
    viewChangeTimeoutRef.current = window.setTimeout(() => {
      if (transitionId !== transitionIdRef.current) { debug("old transition callback executes after a newer transition", { callback: "map-to-globe view change", callbackTransitionId: transitionId, activeTransitionId: transitionIdRef.current }); return; }
      onViewChange("globe"); onPersistView?.("globe"); setState((prev) => ({ ...prev, currentView: "globe", fallbackReason: undefined, transitioning: false, transitionDirection: null })); debug("view after transition", { direction: "map-to-globe", reason, viewAfter: "globe", context, fallbackReason: null }); transitionTimeoutRef.current = window.setTimeout(() => completeTransition(transitionId), TRANSITION_DEBOUNCE_MS);
    }, 120);
    return true;
  }, [canTransition, clearFallback, completeTransition, debug, failTransition, lockTransition, onPersistView, onViewChange, preserveContext, state.currentView, state.fallbackReason]);
  const retryGlobe = useCallback((reason: string, context?: AtlasTransitionContext | null) => {
    debug("retry globe", { reason, context, fallbackReason: state.fallbackReason ?? null });
    clearTimeouts(); lockRef.current = false; ++transitionIdRef.current;
    lastFireRef.current["map-to-globe"] = 0;
    return requestMapToGlobe(reason, context ?? state.context);
  }, [clearTimeouts, debug, requestMapToGlobe, state.context, state.fallbackReason]);
  return { state, requestGlobeToMap, requestMapToGlobe, canTransition, lockTransition, completeTransition, failTransition, preserveContext, resetFallback: clearFallback, clearFallback, retryGlobe, transitionLocked: state.transitioning };
}

type BasemapKey = "atlasStreets" | "atlas" | "satellite" | "terrain" | "streets" | "night" | "blueMarble";
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
function MapStyleController({ map, basemap, onResize }: { map: Map | null; basemap: BasemapKey; onResize?: () => void }) { useEffect(() => { if (!map) return; map.setStyle(basemapStyles[basemap].style); try { window.localStorage.setItem(BASEMAP_STORAGE_KEY, basemap); } catch { /* Basemap preference is non-critical. */ } const resize = () => requestAnimationFrame(() => { map.resize(); onResize?.(); }); map.once("styledata", resize); resize(); return () => { map.off("styledata", resize); }; }, [map, basemap, onResize]); return null; }



const SIGNAL_SOURCE_ID = "waveatlas-signal-constellations";
const SIGNAL_LAYER_IDS = ["waveatlas-signal-cluster-halo", "waveatlas-signal-clusters", "waveatlas-signal-cluster-count", "waveatlas-signal-favorite-halo", "waveatlas-signals"] as const;
function mapDebugState(map: Map | null) {
  if (!map) return { hasMap: false };
  const maybeMap = map as Map & { style?: unknown; _removed?: boolean; removed?: boolean };
  let loaded: boolean | string = "unavailable";
  try { loaded = map.loaded(); } catch (error) { loaded = error instanceof Error ? error.message : "failed"; }
  let styleLoaded: boolean | string = "unavailable";
  try { styleLoaded = Boolean(map.isStyleLoaded()); } catch (error) { styleLoaded = error instanceof Error ? error.message : "failed"; }
  return { hasMap: true, hasStyle: Boolean(maybeMap.style), loaded, styleLoaded, removed: Boolean(maybeMap._removed || maybeMap.removed) };
}

function isMapStyleReady(map: Map | null): map is Map {
  if (!map) return false;
  const maybeMap = map as Map & { style?: unknown; _removed?: boolean; removed?: boolean };
  if (maybeMap._removed || maybeMap.removed || !maybeMap.style) return false;
  try { return Boolean(map.isStyleLoaded()); } catch { return false; }
}

function warnMapCleanup(label: string, detail: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") console.warn(`[WaveAtlas map cleanup] ${label}`, detail);
  logAtlasTransitionDiagnostics(label, detail);
}

function safeHasLayer(map: Map | null, id: string) {
  if (!isMapStyleReady(map)) {
    logAtlasTransitionDiagnostics("style unavailable during layer check", { id, map: mapDebugState(map) });
    return false;
  }
  try { return Boolean(map.getLayer(id)); } catch (error) {
    warnMapCleanup("layer check failed", { id, error: error instanceof Error ? error.message : String(error), map: mapDebugState(map) });
    return false;
  }
}

function safeRemoveLayer(map: Map | null, id: string) {
  if (!isMapStyleReady(map)) {
    warnMapCleanup("style unavailable during layer cleanup", { id, map: mapDebugState(map) });
    return;
  }
  try { if (map.getLayer(id)) map.removeLayer(id); } catch (error) {
    warnMapCleanup("layer cleanup failed", { id, error: error instanceof Error ? error.message : String(error), map: mapDebugState(map) });
  }
}

function safeHasSource(map: Map | null, id: string) {
  if (!isMapStyleReady(map)) {
    logAtlasTransitionDiagnostics("style unavailable during source check", { id, map: mapDebugState(map) });
    return false;
  }
  try { return Boolean(map.getSource(id)); } catch (error) {
    warnMapCleanup("source check failed", { id, error: error instanceof Error ? error.message : String(error), map: mapDebugState(map) });
    return false;
  }
}

function safeRemoveSource(map: Map | null, id: string) {
  if (!isMapStyleReady(map)) {
    warnMapCleanup("style unavailable during source cleanup", { id, map: mapDebugState(map) });
    return;
  }
  try { if (map.getSource(id)) map.removeSource(id); } catch (error) {
    warnMapCleanup("source cleanup failed", { id, error: error instanceof Error ? error.message : String(error), map: mapDebugState(map) });
  }
}

function readFavoriteSet() {
  if (typeof window === "undefined") return new Set<string>();
  return new Set(readFavoriteStationIds());
}


function SignalConstellationLayer({ map, stations, currentStation }: { map: Map | null; stations: Station[]; currentStation: Station }) {
  const stationsRef = useRef(stations);
  const currentRef = useRef(currentStation);
  const scheduleRef = useRef<(() => void) | null>(null);
  useEffect(() => { stationsRef.current = stations; currentRef.current = currentStation; scheduleRef.current?.(); }, [currentStation, stations]);

  useEffect(() => {
    if (!map) return;
    let frame = 0;
    const ensureLayers = () => {
      if (!isMapStyleReady(map)) {
        logAtlasTransitionDiagnostics("style unavailable during SignalConstellationLayer ensure", { sourceId: SIGNAL_SOURCE_ID, map: mapDebugState(map) });
        return false;
      }
      try {
        if (!safeHasSource(map, SIGNAL_SOURCE_ID)) {
          map.addSource(SIGNAL_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 88, clusterMaxZoom: 7 });
        }
        if (!safeHasLayer(map, "waveatlas-signal-cluster-halo")) map.addLayer({ id: "waveatlas-signal-cluster-halo", type: "circle", source: SIGNAL_SOURCE_ID, filter: ["has", "point_count"], minzoom: 2.05, paint: { "circle-color": "rgba(0,214,143,0.22)", "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 20, 50, 32, 250, 47], "circle-blur": 0.65, "circle-opacity": ["interpolate", ["linear"], ["zoom"], 2.05, 0, 2.85, 0.9] } });
        if (!safeHasLayer(map, "waveatlas-signal-clusters")) map.addLayer({ id: "waveatlas-signal-clusters", type: "circle", source: SIGNAL_SOURCE_ID, filter: ["has", "point_count"], minzoom: 2.05, paint: { "circle-color": "#00D68F", "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 6, 50, 11, 250, 17], "circle-stroke-color": "rgba(255,255,255,0.72)", "circle-stroke-width": 0.7, "circle-opacity": ["interpolate", ["linear"], ["zoom"], 2.35, 0, 3.1, 0.78, 7.4, 0.28] } });
        if (!safeHasLayer(map, "waveatlas-signal-cluster-count")) map.addLayer({ id: "waveatlas-signal-cluster-count", type: "symbol", source: SIGNAL_SOURCE_ID, filter: ["has", "point_count"], minzoom: 2.85, layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": ["interpolate", ["linear"], ["zoom"], 3, 9, 7, 11], "text-allow-overlap": false }, paint: { "text-color": "rgba(248,250,252,0.88)", "text-halo-color": "rgba(2,6,23,0.9)", "text-halo-width": 1.2, "text-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.15, 4.2, 1, 7.5, 0.35] } });
        if (!safeHasLayer(map, "waveatlas-signal-favorite-halo")) map.addLayer({ id: "waveatlas-signal-favorite-halo", type: "circle", source: SIGNAL_SOURCE_ID, filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "favorite"], true]], minzoom: 5.8, paint: { "circle-color": "rgba(255,215,0,0)", "circle-radius": ["interpolate", ["linear"], ["zoom"], 5.8, 7, 12, 13], "circle-stroke-color": "#FFD700", "circle-stroke-width": 1.6, "circle-opacity": ["interpolate", ["linear"], ["zoom"], 6.2, 0, 7.1, 0.88] } });
        if (!safeHasLayer(map, "waveatlas-signals")) map.addLayer({ id: "waveatlas-signals", type: "circle", source: SIGNAL_SOURCE_ID, filter: ["!", ["has", "point_count"]], minzoom: 5.0, paint: { "circle-color": ["match", ["get", "status"], "community", "#48C7FF", "unverified", "#D4A64A", "#00D68F"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 5.0, 1.6, 8, 3.5, 12, 5.6], "circle-blur": 0.14, "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5.0, 0, 6.4, 0.78, 12, 0.9], "circle-stroke-color": "rgba(255,255,255,0.42)", "circle-stroke-width": 0.35 } });
        return true;
      } catch (error) {
        warnMapCleanup("SignalConstellationLayer layer setup failed", { sourceId: SIGNAL_SOURCE_ID, error: error instanceof Error ? error.message : String(error), map: mapDebugState(map) });
        return false;
      }
    };
    const updateSignals = () => {
      frame = 0;
      if (!ensureLayers()) return;
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const favoriteIds = readFavoriteSet();
      const maxSignals = zoom < 3.2 ? 120 : zoom < 5.4 ? 260 : zoom < 7 ? 520 : 900;
      const { visibleSignals } = buildSignalFeatures({
        stations: stationsRef.current,
        currentStation: currentRef.current,
        viewportBounds: { contains: (lng, lat) => bounds.contains([lng, lat]) },
        zoomLevel: zoom,
        favoriteIds,
        maxSignals,
      });
      if (DEBUG_SIGNALS || process.env.NODE_ENV !== "production") {
        const beacon = getActiveBeaconFeature(currentRef.current);
        console.debug("[WaveAtlas signals] refresh", { view: "map", activeStation: currentRef.current.name, beaconCoordinates: beacon?.geometry.coordinates ?? null, zoomLevel: zoom, renderedSignals: visibleSignals.length });
      }
      try {
        (isMapStyleReady(map) ? map.getSource(SIGNAL_SOURCE_ID) as GeoJSONSource | undefined : undefined)?.setData({ type: "FeatureCollection", features: visibleSignals as SignalFeature[] });
      } catch (error) {
        warnMapCleanup("SignalConstellationLayer source update failed", { sourceId: SIGNAL_SOURCE_ID, error: error instanceof Error ? error.message : String(error), map: mapDebugState(map) });
      }
    };
    const schedule = () => { if (frame) return; frame = window.requestAnimationFrame(updateSignals); };
    scheduleRef.current = schedule;
    map.on("styledata", schedule); map.on("moveend", schedule); map.on("zoomend", schedule); map.on("zoomstart", schedule);
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (scheduleRef.current === schedule) scheduleRef.current = null;
      try { map.off("styledata", schedule); map.off("moveend", schedule); map.off("zoomend", schedule); map.off("zoomstart", schedule); } catch (error) {
        warnMapCleanup("SignalConstellationLayer listener cleanup failed", { error: error instanceof Error ? error.message : String(error), map: mapDebugState(map) });
      }
      if (!isMapStyleReady(map)) {
        warnMapCleanup("SignalConstellationLayer style unavailable; skipped layer cleanup", { sourceId: SIGNAL_SOURCE_ID, map: mapDebugState(map) });
        return;
      }
      for (const id of SIGNAL_LAYER_IDS) safeRemoveLayer(map, id);
      safeRemoveSource(map, SIGNAL_SOURCE_ID);
    };
  }, [map]);
  return null;
}

type MapTeleportContext = { lat: number; lng: number; zoom: number; countryCode?: string; countryName?: string };
type AtlasTransitionContext = MapTeleportContext & { stationId?: string; reason?: string };
const MAP_TO_GLOBE_ZOOM_THRESHOLD = 3.0;
const ATLAS_CONTEXTUAL_ZOOM = { mobile: { min: 4.2, max: 5.4, fallback: 5.0 }, desktop: { min: 4.6, max: 5.8, fallback: 5.2 } } as const;
function clampAtlasContextZoom(zoom: number | undefined, mobile = false) {
  const policy = mobile ? ATLAS_CONTEXTUAL_ZOOM.mobile : ATLAS_CONTEXTUAL_ZOOM.desktop;
  const value = typeof zoom === "number" && Number.isFinite(zoom) ? zoom : policy.fallback;
  return Math.min(policy.max, Math.max(policy.min, value));
}
function transitionContextForStation(station: Station, fallback?: MapTeleportContext | null, reason = "active station atlas handoff", mobile = false): AtlasTransitionContext | null {
  const geo = resolveStationGeo(station);
  const lat = geo.lat ?? fallback?.lat;
  const lng = geo.lng ?? fallback?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng, zoom: clampAtlasContextZoom(fallback?.zoom, mobile), stationId: station.station_uuid || station.id, reason };
}
function debugAtlasTransition(detail: { fromView: AtlasViewMode; toView: AtlasViewMode; activeStation?: string; stationId?: string; coordinates: { lat: number; lng: number }; zoomLevel: number; transitionReason: string; preservedContext: boolean; globeReadyState?: string }) {
  if (process.env.NODE_ENV !== "production") console.info("[WaveAtlas] atlas view transition", detail);
  logAtlasTransitionDiagnostics("view transition", detail);
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



function WaveAtlasMap({ station, stations, mobile = false, resetSignal = 0, basemap: controlledBasemap, onBasemapChange, onMapContextChange, onWorldZoomRequest, initialContext, onCountrySelect, searchActive = false, keyboardOpen = false, transitionLocked = false }: { station: Station; stations: Station[]; mobile?: boolean; resetSignal?: number; basemap?: BasemapKey; onBasemapChange?: (value: BasemapKey) => void; onMapContextChange?: (context: MapTeleportContext) => void; onWorldZoomRequest?: (context: AtlasTransitionContext) => void; initialContext?: AtlasTransitionContext | null; onCountrySelect?: (country: CountryResult) => void; searchActive?: boolean; keyboardOpen?: boolean; transitionLocked?: boolean }) {
  const status = usePlayer((s) => s.status);
  const selectionSource = usePlayer((s) => s.stationSelectionSource);
  const activeStation = useNavigationEngine((s) => s.activeStation) ?? station;
  const container = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<Map | null>(null);
  const [internalBasemap, setInternalBasemap] = useState<BasemapKey>(() => getInitialBasemap(mobile));
  const basemap = controlledBasemap ?? internalBasemap;
  const setBasemap = onBasemapChange ?? setInternalBasemap;
  const initialBasemap = useRef(basemap);
  const initialTransitionContext = useRef(initialContext);
  const viewMode = useRef<"desktop" | "mobile">(mobile ? "mobile" : "desktop");
  const geo = useMemo(() => geotruth(activeStation), [activeStation]);
  const initialGeo = useRef(geo);
  const onCountrySelectRef = useRef(onCountrySelect);
  const worldZoomRequestRef = useRef(onWorldZoomRequest);
  const transitionLockedRef = useRef(transitionLocked);
  const lastMapToGlobeFireRef = useRef(0);
  useEffect(() => { onCountrySelectRef.current = onCountrySelect; }, [onCountrySelect]);
  useEffect(() => { worldZoomRequestRef.current = onWorldZoomRequest; }, [onWorldZoomRequest]);
  useEffect(() => { transitionLockedRef.current = transitionLocked; }, [transitionLocked]);

  const cameraPadding = useMemo(() => mobile ? { top: 112, right: 24, bottom: 304, left: 24 } : { top: 28, right: 28, bottom: 28, left: 28 }, [mobile]);
  const camera = useMapCameraController(map, cameraPadding);
  const lastStationId = useRef(station.id);
  useEffect(() => {
    if (!container.current) return;
    const start = initialGeo.current;
    const m = new maplibregl.Map({
      container: container.current,
      style: basemapStyles[initialBasemap.current].style,
      center: start.lat !== null && start.lng !== null ? [start.lng, start.lat] : initialTransitionContext.current ? [initialTransitionContext.current.lng, initialTransitionContext.current.lat] : DEFAULT_MAP_VIEW[viewMode.current].center,
      zoom: clampAtlasContextZoom(initialTransitionContext.current?.zoom, viewMode.current === "mobile"),
      bearing: DEFAULT_MAP_VIEW[viewMode.current].bearing,
      pitch: DEFAULT_MAP_VIEW[viewMode.current].pitch,
      attributionControl: false,
    });
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    setMap(m);
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
      setMap(null);
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resize);
      try { m.off("click", clickCountry); m.off("touchend", clickCountry); } catch (error) {
        warnMapCleanup("map listener cleanup failed", { error: error instanceof Error ? error.message : String(error), map: mapDebugState(m) });
      }
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
    if (!map || !worldZoomRequestRef.current) return;
    let armed = false;
    const arm = () => { armed = true; logAtlasTransitionDiagnostics("map zoomstart armed", { station: station.name, stationId: station.station_uuid || station.id, mapZoom: map.getZoom(), globeReadyState: transitionLockedRef.current ? "transitioning" : "available" }); };
    const inspectZoom = () => {
      const zoom = map.getZoom();
      if (!armed || zoom > MAP_TO_GLOBE_ZOOM_THRESHOLD) return;
      const now = Date.now();
      logAtlasTransitionDiagnostics("automatic map-to-globe trigger", { station: station.name, stationId: station.station_uuid || station.id, mapZoom: zoom, globeReadyState: transitionLockedRef.current ? "transitioning" : "available" });
      if (transitionLockedRef.current) { armed = false; return; }
      if (now - lastMapToGlobeFireRef.current < TRANSITION_DEBOUNCE_MS) { console.warn("[WaveAtlas transition] duplicate map-to-globe trigger within 1500ms", { station: station.name, stationId: station.station_uuid || station.id, mapZoom: zoom, elapsedMs: now - lastMapToGlobeFireRef.current }); armed = false; return; }
      lastMapToGlobeFireRef.current = now;
      const center = map.getCenter();
      const context = { lat: center.lat, lng: center.lng, zoom, stationId: station.station_uuid || station.id, reason: "map world/country zoom threshold" };
      debugAtlasTransition({ fromView: "map", toView: "globe", activeStation: station.name, stationId: context.stationId, coordinates: { lat: center.lat, lng: center.lng }, zoomLevel: zoom, transitionReason: context.reason, preservedContext: true, globeReadyState: "requested" });
      armed = false;
      worldZoomRequestRef.current?.(context);
    };
    map.on("zoomstart", arm);
    map.on("zoomend", inspectZoom);
    return () => {
      const maybeMap = map as Map & { _removed?: boolean; removed?: boolean };
      if (maybeMap._removed || maybeMap.removed) {
        logAtlasTransitionDiagnostics("map-to-globe listener cleanup skipped; map removed", { map: mapDebugState(map) });
        return;
      }
      try { map.off("zoomstart", arm); map.off("zoomend", inspectZoom); } catch (error) {
        warnMapCleanup("map-to-globe listener cleanup failed", { error: error instanceof Error ? error.message : String(error), map: mapDebugState(map) });
      }
    };
  }, [map, station.id, station.name, station.station_uuid]);

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
      return;
    }
    camera.remember();
  }, [camera, map, station.id]);

  const lastCenteredStationId = useRef("");
  useEffect(() => {
    if (!map || geo.lat === null || geo.lng === null) return;
    const activeId = activeStation.station_uuid || activeStation.id;
    if (lastCenteredStationId.current === activeId) return;
    lastCenteredStationId.current = activeId;
    camera.selectStation(geo, selectionSource);
  }, [activeStation.id, activeStation.station_uuid, camera, geo, map, selectionSource]);

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
        <SignalConstellationLayer map={map} stations={stations} currentStation={activeStation} />
        <ActiveStationBeacon map={map} geo={geo} status={status} />
        <MapStyleController map={map} basemap={basemap} onResize={camera.resizeThenReapplyIntended} />
        <div className={`map-atmosphere-overlay tone-${geo.tone} status-${status} pointer-events-none absolute inset-0`} />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
        <div className="day-night-terminator pointer-events-none absolute inset-y-0 w-1/2 opacity-55" />
        <div className="cloud-layer pointer-events-none absolute inset-0 opacity-25" />
        <div className="pointer-events-none absolute left-1/2 top-[45%] z-10 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-radio/15 bg-radio/5 blur-sm shadow-[0_0_80px_rgba(88,225,132,.18)]" />
      </div>
    );
  }
  return (
    <div className="relative h-full min-h-[620px] w-full overflow-hidden bg-slate-950 shadow-2xl">
      <div ref={container} className="pointer-events-auto absolute inset-0 h-full w-full" />
      <SignalConstellationLayer map={map} stations={stations} currentStation={activeStation} />
      <ActiveStationBeacon map={map} geo={geo} status={status} />
      <MapStyleController map={map} basemap={basemap} onResize={camera.resizeThenReapplyIntended} />
      <div className={`map-atmosphere-overlay tone-${geo.tone} status-${status} pointer-events-none absolute inset-0`} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40" />
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

async function resolveTeleportDestination(stations: Station[], current: Station, signal?: AbortSignal) {
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
    const queue = await fetchTeleportPool(anchor, recent, signal ?? controller.signal);
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
    const version = startWandererDiscovery(stations);
    const selected = usePlayer.getState().current;
    if (version && selected) rememberJourneyStop(selected);
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
    <aside className="glass rounded-[2rem] border border-white/25 bg-slate-950/96 p-6 text-white shadow-[0_30px_110px_rgba(0,0,0,.68),0_0_0_1px_rgba(54,245,162,.08)] backdrop-blur-[28px] [backdrop-filter:blur(28px)_saturate(1.22)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-[12px] font-semibold text-radio">
            Now playing
          </p>
          <h2 className="mt-2 font-display text-[28px] font-extrabold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,.55)]">{station.name}</h2>
          <p className="mt-2 flex items-center gap-2 font-medium text-ivory/86 drop-shadow-[0_1px_5px_rgba(0,0,0,.45)]">
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
        <button className="rounded-full border border-white/25 bg-slate-950/55 p-4 text-white shadow-[0_10px_30px_rgba(0,0,0,.35)] transition hover:border-radio/45 hover:bg-radio/10">
          <Heart />
        </button>
        <button className="rounded-full border border-white/25 bg-slate-950/55 p-4 text-white shadow-[0_10px_30px_rgba(0,0,0,.35)] transition hover:border-radio/45 hover:bg-radio/10">
          <Link />
        </button>
        <Volume2 className="text-ivory/80 drop-shadow-[0_1px_5px_rgba(0,0,0,.5)]" />
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
        className="pointer-events-auto mx-auto mt-2 flex h-11 w-[min(520px,72vw)] md:hidden items-center gap-2 rounded-full border border-white/15 bg-slate-950/45 px-4 text-left shadow-[0_14px_42px_rgba(0,0,0,.28)] backdrop-blur-2xl"
        aria-label="Open station search"
      >
        <Search className="size-4 shrink-0 text-sky" />
        <span className="min-w-0 flex-1 truncate text-xs text-ivory/60">Search the atlas...</span>
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
  const [tracksOpen, setTracksOpen] = useState(false);
  const current = usePlayer((state) => state.current);
  const currentUrl = current ? getStationStreamUrl(current) : "";
  const health = getStreamHealth(station);
  const location = [station.state || station.city, station.country].filter(Boolean).join(" · ");
  const isGeoAudio = station.sourceType === "geoaudio";
  const showCampusAtlasBadge = process.env.NODE_ENV === "development" && station.curation_source === "campus-atlas";
  const highlightedTrack = station.geoAudio?.highlightedQueueItemId ? station.geoAudio.tracks[Number(station.geoAudio.highlightedQueueItemId.split("-track-")[1]) - 1]?.title : undefined;
  const trackCount = station.geoAudio?.trackCount ?? station.geoAudio?.tracks.length ?? 0;
  const selectStation = () => {
    const highlightedIndex = station.geoAudio?.highlightedQueueItemId ? Number(station.geoAudio.highlightedQueueItemId.split("-track-")[1]) - 1 : -1;
    if (station.sourceType === "geoaudio" && highlightedIndex >= 0 && selectGeoAudioQueueItem(station, highlightedIndex)) return;
    onSelect(station);
  };
  return <div className="mb-3 rounded-[18px] border border-white/[0.08] bg-[rgba(20,28,42,0.82)] p-4 text-left shadow-lg transition hover:border-gold/50 hover:bg-[rgba(28,38,58,0.9)]">
    <button type="button" onClick={selectStation} className="w-full text-left active:scale-[0.99]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-base font-medium text-[#F8FAFC]">{station.name}</b><p className="mt-1 text-xs font-medium text-white/[0.72]">{location || "Global"} · {isGeoAudio ? station.geoAudio?.albumTitle ?? "GeoAudio album" : station.language || "Unknown language"}</p>{isGeoAudio && station.geoAudio ? <p className="mt-1 text-[11px] font-medium text-gold/80">Provider/producer: {station.geoAudio.provider} · Studio: {station.geoAudio.studio}</p> : null}</div><span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ${isGeoAudio ? "bg-gold/15 text-gold" : "bg-emerald-500/15 text-emerald-300"}`}>{isGeoAudio ? "GeoAudio Channel" : <><span className={`mr-1 inline-block size-2 rounded-full ${health.dot}`} />{health.label}</>}</span></div><div className="mt-3 flex flex-wrap gap-2">{showCampusAtlasBadge ? <span className="rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold text-sky-200">campus-atlas</span> : null}<span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-[#E5E7EB]">{station.codec || "Unknown codec"}</span><span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-[#E5E7EB]">{isGeoAudio ? `${trackCount} tracks` : station.bitrate ? `${station.bitrate} kbps` : "Live stream"}</span><span className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-[#E5E7EB]">{station.country_code}</span>{highlightedTrack ? <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-semibold text-gold">Matched: {highlightedTrack}</span> : null}{station.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-[#E5E7EB]">{tag}</span>)}</div></button>
    {isGeoAudio && station.geoAudio ? <div className="mt-3 border-t border-white/10 pt-3"><button type="button" onClick={() => setTracksOpen((value) => !value)} className="flex w-full items-center justify-between rounded-2xl border border-gold/20 bg-gold/10 px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.12em] text-gold"><span>{station.geoAudio.queueLabel || "Journey"} / Track List · {trackCount}</span><span>{tracksOpen ? "Hide" : "View"} <ChevronDown className="inline size-3" /></span></button>{tracksOpen ? <div className="mt-2 max-h-52 space-y-1 overflow-y-auto pr-1">{station.geoAudio.tracks.map((track, index) => { const playable = Boolean(track.url); const active = playable && ((current?.station_uuid === station.station_uuid && currentUrl === track.url) || station.geoAudio?.highlightedQueueItemId === `${station.station_uuid}-track-${index + 1}`); return <button key={`${track.title}-${index}`} type="button" onClick={() => playable && selectGeoAudioQueueItem(station, index)} disabled={!playable} aria-disabled={!playable} className={`w-full rounded-xl px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? "bg-gold/15 text-gold" : playable ? "bg-white/[0.04] text-ivory/76 hover:bg-white/[0.08]" : "bg-white/[0.025] text-ivory/50"}`}><span className="mr-2 opacity-60">{index + 1}.</span>{track.title}{playable ? null : <span className="ml-2 text-rose-300/80">Unavailable</span>}</button>; })}</div> : null}</div> : null}
  </div>;
}
function GeoAudioChannelInspector({ station }: { station: Station }) {
  const [open, setOpen] = useState(true);
  if (station.sourceType !== "geoaudio" || !station.geoAudio) return null;
  const activeUrl = getStationStreamUrl(station);
  const activeIndex = station.geoAudio.tracks.findIndex((track) => track.url === activeUrl);
  const queueLabel = station.geoAudio.queueLabel || "Journey";
  return <section className="fixed right-6 bottom-28 z-[69] hidden w-[360px] rounded-[2rem] border border-gold/25 bg-slate-950/92 p-4 text-white shadow-2xl backdrop-blur-2xl xl:block">
    <div className="flex gap-3">
      {station.geoAudio.coverArtUrl ? <Image src={station.geoAudio.coverArtUrl} alt={`${station.geoAudio.albumTitle} artwork`} width={72} height={72} className="size-[72px] rounded-2xl object-cover" unoptimized /> : null}
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold">GeoAudio Channel</p>
        <h3 className="mt-1 truncate font-display text-lg font-bold">{station.geoAudio.albumTitle}</h3>
        <p className="text-xs text-ivory/70">{station.geoAudio.provider} · {station.geoAudio.producer}</p>
        <p className="text-xs text-ivory/70">Studio: {station.geoAudio.studio}</p>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ivory/72">
      <span className="rounded-2xl bg-white/[0.06] px-3 py-2">Anchor: Florida</span>
      <span className="rounded-2xl bg-white/[0.06] px-3 py-2">Tracks: {station.geoAudio.trackCount ?? station.geoAudio.tracks.length}</span>
    </div>
    <button type="button" onClick={() => setOpen((value) => !value)} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-sm font-semibold text-ivory">{queueLabel}<span className="text-xs text-gold">{open ? "Hide" : "Expand"} <ChevronDown className="inline size-3" /></span></button>
    {open ? <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">{station.geoAudio.tracks.map((track, index) => { const playable = Boolean(track.url); const active = playable && (index === activeIndex || station.geoAudio?.highlightedQueueItemId === `${station.station_uuid}-track-${index + 1}`); return <button key={`${track.title}-${index}`} type="button" onClick={() => playable && selectGeoAudioQueueItem(station, index)} disabled={!playable} aria-disabled={!playable} className={`w-full rounded-xl px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? "bg-gold/15 text-gold" : playable ? "bg-white/[0.04] text-ivory/76 hover:bg-white/[0.08]" : "bg-white/[0.025] text-ivory/50"}`}><span className="mr-2 opacity-60">{index + 1}.</span>{track.title}{playable ? null : <span className="ml-2 text-rose-300/80">Unavailable</span>}</button>; })}</div> : null}
  </section>;
}

function GroupedSearchResults({ query, stations, onStationSelect, onCountrySelect, setQuery, compact = false }: { query: string; stations: Station[]; onStationSelect: (station: Station, candidates: Station[]) => void; onCountrySelect: (country: CountryResult) => void; setQuery: (q: string) => void; compact?: boolean }) {
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
  return <div className="rounded-3xl border border-white/[0.12] bg-[rgba(8,17,29,0.82)] p-3 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-[18px] [backdrop-filter:blur(18px)_saturate(1.15)]"><div className="mb-3 flex items-center justify-between px-1"><p className="font-display text-xs font-semibold text-gold">{countryIntentActive && resultMeta?.countryName ? `Stations in ${resultMeta.countryName}` : "Destination results"}{allStationResults.length ? ` · ${stationResults.length}/${resultMeta?.totalAvailable ?? allStationResults.length}` : ""}</p>{loading ? <span className="text-xs font-semibold text-sky">{countryIntentActive && resultMeta?.countryName ? `Acquiring ${resultMeta.countryName} signals…` : "Searching…"}</span> : null}</div><div className={`grid gap-3 ${compact ? "" : "lg:grid-cols-[1.25fr_.75fr]"}`}><div>{stationResults.length ? <>{stationResults.map((station) => <SearchResultStationCard key={station.id} station={station} onSelect={(selected) => onStationSelect(selected, allStationResults)} />)}{canLoadMoreSearch ? <button type="button" onClick={() => setVisibleSearchCount((count) => count + 24)} className="mt-2 w-full rounded-full bg-radio px-5 py-3 font-medium text-midnight">Load More results</button> : null}</> : <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm font-medium text-slate-300">{countryIntentActive && resultMeta?.countryName ? `No active stations found for ${resultMeta.countryName} yet. Try Load More, check another genre, or let Station Steward Agent refresh this region.` : "No matching radio or GeoAudio channel found yet. Try a place, artist, provider, album, track, country, or genre."}</p>}</div><div className="grid content-start gap-3"><SearchGroup title="Countries" items={countries.slice(0, 6).map((c) => ({ key: c.code, label: `${c.flag} ${c.name}`, meta: `${c.station_count.toLocaleString()} stations`, action: () => onCountrySelect(c) }))} /><SearchGroup title="Genres" items={genres.map((g) => ({ key: g, label: g, meta: "Search format", action: () => setQuery(g) }))} /><SearchGroup title="Languages" items={languages.map((l) => ({ key: l, label: l, meta: "Search language", action: () => setQuery(l) }))} /></div></div></div>;
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

function MobileSearchCommandOverlay({ open, query, setQuery, stations, onClose, onCountrySelect, onStationSelect, voiceControl }: { open: boolean; query: string; setQuery: (q: string) => void; stations: Station[]; onClose: () => void; onCountrySelect: (country: CountryResult) => void; onStationSelect: (station: Station, candidates?: Station[]) => void; voiceControl?: ReactNode }) {
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
          <div className="flex shrink-0 flex-col gap-3">
            <div className="flex items-center gap-3">
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
            <div className="flex min-h-11 flex-wrap items-center justify-end gap-2 pl-1">
              <button type="button" onClick={closeWithBlur} className="min-h-11 shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-sky transition hover:border-sky/35 hover:bg-sky/10">
                Cancel
              </button>
              {voiceControl ? <div className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">{voiceControl}</div> : null}
            </div>
          </div>
          <div className="atlas-drawer-scroll mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
            {query.trim() ? (
              <GroupedSearchResults
                query={query}
                stations={stations}
                onStationSelect={(station, candidates) => {
                  inputRef.current?.blur();
                  onStationSelect(station, candidates);
                }}
                onCountrySelect={(country) => {
                  inputRef.current?.blur();
                  onCountrySelect(country);
                }}
                setQuery={setQuery}
              />
            ) : (
              <p className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-sm font-medium leading-6 text-ivory/70">
                Search for a country, city, or station.
              </p>
            )}
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}


type AtlasToastKind = "status" | "alert";
type AtlasToastEventDetail = { title: string; subtitle?: string; kind?: AtlasToastKind; id?: string; countryCode?: string };

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
    countryCode: station.country_code,
    ...override,
  };
}

function dispatchAtlasToast(detail: AtlasToastEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AtlasToastEventDetail>(ATLAS_TOAST_EVENT, { detail }));
}

function AtlasToast({ station, mobile = false }: { station: Station; mobile?: boolean }) {
  const reducedMotion = useReducedMotion();
  const [globeTravelActive, setGlobeTravelActive] = useState(false);
  const playerStatus = usePlayer((state) => state.status);
  const playerError = usePlayer((state) => state.error);
  const source = usePlayer((state) => state.stationSelectionSource);
  const [toast, setToast] = useState<AtlasToastEventDetail>(() => buildAtlasToast(station));
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const toastKey = toast.id ?? `${toast.title}-${toast.subtitle ?? ""}`;
  const toastFlag = toast.kind !== "alert" && toast.countryCode ? flagFor(toast.countryCode) : null;

  useEffect(() => {
    const onTravel = (event: Event) => setGlobeTravelActive(Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active));
    window.addEventListener("waveatlas:globe-travel", onTravel);
    return () => window.removeEventListener("waveatlas:globe-travel", onTravel);
  }, []);

  useEffect(() => {
    const titlePrefix = source === "fallback" ? "Signal unavailable. Trying another station." : undefined;
    const updateToast = () => {
      setToast(buildAtlasToast(station, titlePrefix ? { title: titlePrefix, kind: "alert", id: `fallback-${stationKey(station)}-${Date.now()}` } : undefined));
      setVisible(true);
      setPaused(false);
    };
    if (globeTravelActive && mobile) window.setTimeout(updateToast, 120);
    else window.queueMicrotask(updateToast);
  }, [globeTravelActive, mobile, source, station.station_uuid, station.id, station]);

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
          className={`${mobile ? "fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+174px)] z-[58] mx-auto w-auto max-w-[calc(100vw-32px)]" : "fixed bottom-28 left-1/2 z-[58] w-[min(380px,calc(100vw-32px))] -translate-x-1/2"} pointer-events-auto max-h-[92px] min-h-[52px] max-w-[380px] overflow-hidden rounded-[18px] border border-white/[0.10] bg-[rgba(8,17,29,0.88)] px-4 py-3 text-[#F8FAFC] shadow-[0_14px_42px_rgba(0,0,0,0.35)] backdrop-blur-[16px] [backdrop-filter:blur(16px)_saturate(1.15)]`}
          aria-label="Station notification"
        >
          <div className="flex items-start gap-3">
            {toastFlag && mobile ? (
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center text-[15px] leading-none" aria-hidden="true">
                {toastFlag}
              </span>
            ) : (
              <Compass className="mt-0.5 size-4 shrink-0 text-[#D4A64A]" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-1.5 truncate text-[13px] font-semibold leading-5 tracking-[-0.01em] text-[#F8FAFC]">{toastFlag && !mobile ? <span className="shrink-0 text-[14px] leading-none" aria-label={toast.countryCode ? `${toast.countryCode.toUpperCase()} flag` : 'Global flag'}>{toastFlag}</span> : null}<span className="min-w-0 truncate">{toast.title}</span></p>
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
  return <div data-waveatlas-player onClick={onOpen} className="fixed bottom-[74px] left-4 right-4 z-40 min-h-[58px] rounded-[1.35rem] border border-white/30 bg-[rgba(3,9,18,0.96)] p-2.5 text-white shadow-[0_26px_90px_rgba(0,0,0,.72),0_0_0_1px_rgba(54,245,162,.08)] backdrop-blur-[28px] [backdrop-filter:blur(28px)_saturate(1.22)]">
    <div className="flex h-full items-center gap-3"><button onClick={(e) => { e.stopPropagation(); play(); }} className="grid size-9 shrink-0 place-items-center rounded-full bg-radio text-midnight shadow-[0_0_24px_rgba(54,245,162,.38)]">{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button><div className="min-w-0 flex-1"><OverflowMarquee text={`${station.city || station.state || station.country} · ${station.country}`} className="font-display text-xs font-extrabold text-white drop-shadow-[0_2px_7px_rgba(0,0,0,.55)]" /><OverflowMarquee text={`${getPrimaryGenre(station)} · ${station.name} · ${status}`} className="text-[11px] font-medium text-ivory/82 drop-shadow-[0_1px_5px_rgba(0,0,0,.45)]" /></div><Volume2 className="size-4 text-ivory/82 drop-shadow-[0_1px_5px_rgba(0,0,0,.5)]" /></div>
  </div>;
}

function MobileWanderSheet({ open, stations, current, onTravel, onClose }: { open: boolean; stations: Station[]; current: Station; onTravel: (intent: string) => void; onClose: () => void }) {
  const options = ["Surprise Me", "Unvisited Country", "Unvisited Continent", "Somewhere Waking Up", "Somewhere Falling Asleep", "Somewhere Rainy", "Somewhere Spiritual", "Somewhere Busy", "Somewhere Peaceful", "Global Shuffle"];
  const travel = (option: string) => {
    const intent = option === "Surprise Me" ? "Take me somewhere surprising" : option === "Global Shuffle" ? "Take me somewhere global" : option;
    void fetch(`/api/stations/nearby?global=true&limit=18`).then(async (res) => {
      const data = res.ok ? ((await res.json()) as { candidates?: SignalCandidate[] }) : { candidates: [] };
      startWandererDiscovery([...(data.candidates?.map((item) => item.station) ?? []), ...stations]);
    }).catch(() => startWandererDiscovery(stations));
    onTravel(intent);
    onClose();
  };
  return <AnimatePresence>{open ? <motion.section initial={{ y: 360, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 360, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-50 rounded-[2rem] border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
    <button onClick={onClose} className="mx-auto mb-4 block h-1.5 w-14 rounded-full bg-white/30" aria-label="Close Wander" />
    <p className="mb-1 font-display text-xs font-semibold text-gold">Wander</p><h2 className="mb-3 font-display text-xl font-bold">Live discovery is ready.</h2>
    <div className="grid grid-cols-2 gap-2">{options.map((option) => <button key={option} onClick={() => travel(option)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm font-medium text-ivory active:scale-[.98]">{option}</button>)}</div>
  </motion.section> : null}</AnimatePresence>;
}


function MobileStationSheet({ station, stations, inventoryStats, setQuery, open, setOpen }: { station: Station; stations: Station[]; inventoryStats?: StationInventoryStats; setQuery: (q: string) => void; open: boolean; setOpen: (v: boolean) => void }) {
  return <motion.section drag="y" dragConstraints={{ top: 0, bottom: 0 }} onDragEnd={(_, info) => setOpen(info.offset.y < -40 ? true : info.offset.y > 40 ? false : open)} initial={{ y: 680 }} animate={{ y: open ? 64 : 680 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-white/[0.12] bg-[rgba(8,17,29,0.86)] px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-3 shadow-2xl backdrop-blur-xl">
    <button onClick={() => setOpen(!open)} className="mx-auto block h-1.5 w-14 rounded-full bg-white/30" aria-label="Toggle Destination Intelligence" />
    <StationIntelligencePanel station={station} stations={stations} inventoryStats={inventoryStats} setQuery={setQuery} />
  </motion.section>;
}

function MobileCommandDock({ mode, setMode, onTeleport, onToggleWanderer, wandererActive }: { mode: string; setMode: (m: string) => void; onTeleport: () => void; onToggleWanderer: () => void; wandererActive: boolean }) {
  const reducedMotion = useReducedMotion();
  const status = usePlayer((state) => state.status);
  const pulseTeleport = !reducedMotion && (status === "idle" || status === "playing") && mode !== "Brief" && mode !== "Add Signal";
  const commands = [[Heart,"Favorites"],[Globe2,"Explore"],[Signal,"Add Signal"],[Plane,"Teleport"],[Newspaper,"Brief"],[Compass,wandererActive ? "Exit Wanderer" : "Wanderer"],[Radio,"History"]] as const;
  return <nav className="pointer-events-none fixed bottom-0 left-4 right-4 z-[70] max-w-full pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2"><div className="pointer-events-auto grid grid-cols-7 gap-1 rounded-[1.45rem] border border-white/10 bg-slate-950/90 p-1 shadow-2xl backdrop-blur-xl">{commands.map(([Icon,label]) => { const I = Icon as typeof Compass; const value = label as string; const isTeleport = value === "Teleport"; const isWanderer = value === "Wanderer" || value === "Exit Wanderer"; const accessibleLabel = isTeleport ? "Teleport to one new destination" : isWanderer ? (wandererActive ? "Exit Wanderer" : "Start continuous Wanderer Mode") : value; return <div key={value} className={isTeleport ? "relative" : undefined}>{isTeleport && pulseTeleport ? <span className="pointer-events-none absolute inset-0 rounded-full border border-[rgba(0,214,143,0.35)] shadow-[0_0_24px_rgba(0,214,143,0.22)] animate-[teleportPulse_2.8s_ease-out_infinite]" /> : null}<motion.button type="button" title={accessibleLabel} whileTap={isTeleport && !reducedMotion ? { scale: 0.96 } : undefined} transition={{ type: "spring", stiffness: 520, damping: 28, mass: 0.45 }} onClick={() => { if (isTeleport) { playPremiumTeleportClick(); onTeleport(); } else if (isWanderer) onToggleWanderer(); setMode(isWanderer ? "Wanderer" : value); }} className={`pointer-events-auto relative z-[1] grid min-h-12 w-full place-items-center rounded-[1.05rem] px-1 py-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${mode === value || (isWanderer && wandererActive) ? "bg-radio text-midnight" : isTeleport ? "border border-radio/20 bg-radio/10 text-radio hover:bg-radio/15" : "text-ivory/70 hover:bg-white/10"}`} aria-label={accessibleLabel}><I className="size-4" /><span className="sr-only">{accessibleLabel}</span></motion.button></div>; })}</div></nav>;
}

function MobileAtlasShell({ stations, allStations, current, inventoryStats, query, setQuery, onCountrySelect, setWandererIntent, onQueryComplete, voiceSearchOverlayRequest, onVoiceIntent, onVoiceFeedback, startupPreferences, onStartupPreferencesChange }: { stations: Station[]; allStations: Station[]; current: Station; inventoryStats?: StationInventoryStats; query: string; setQuery: (q: string) => void; onCountrySelect: (country: CountryResult) => void; setWandererIntent: (intent: string) => void; onQueryComplete: () => void; voiceSearchOverlayRequest: number; onVoiceIntent: (intent: VoiceCommandIntent) => void; onVoiceFeedback: (message: string) => void; startupPreferences: StartupPreferences; onStartupPreferencesChange: (preferences: StartupPreferences) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState("Atlas");
  const [atlasView, setAtlasView] = useState<AtlasViewMode>(getInitialAtlasView);
  const [resetSignal, setResetSignal] = useState(0);
  const [basemap, setBasemap] = useState<BasemapKey>(() => getInitialBasemap(true));
  const [globeBasemap, setGlobeBasemap] = useState<GlobeBasemapKey>(getInitialGlobeBasemap);
  const [wanderOpen, setWanderOpen] = useState(false);
  const [mobileTeleporting, setMobileTeleporting] = useState(false);
  const [wandererActive, setWandererActive] = useState(false);
  const wandererTimer = useRef<number | null>(null);
  const [mapContext, setMapContext] = useState<MapTeleportContext | null>(null);
  const [transitionContext, setTransitionContext] = useState<AtlasTransitionContext | null>(null);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const mobileSearchOverlayOpen = searchOverlayOpen || (voiceSearchOverlayRequest > 0 && Boolean(query.trim()));
  const selectionVersion = usePlayer((state) => state.selectionVersion);
  const handleTravel = useCallback((intent: string) => {
    setWandererIntent(intent);
  }, [setWandererIntent]);
  const makeWandererHop = useCallback(() => {
    const intent = "Wanderer Mode";
    setWandererIntent(intent);
    const version = startWandererDiscovery(allStations);
    const selected = usePlayer.getState().current;
    if (version && selected) rememberJourneyStop(selected);
    handleTravel(intent);
  }, [allStations, handleTravel, setWandererIntent]);
  useEffect(() => {
    if (!wandererActive) { if (wandererTimer.current) window.clearTimeout(wandererTimer.current); return; }
    wandererTimer.current = window.setTimeout(makeWandererHop, 0);
    const schedule = () => { wandererTimer.current = window.setTimeout(() => { makeWandererHop(); schedule(); }, nextWandererIntervalMs()); };
    schedule();
    return () => { if (wandererTimer.current) window.clearTimeout(wandererTimer.current); };
  }, [makeWandererHop, wandererActive]);
  const visualViewport = useIOSVisualViewport();
  useWaveAtlasLayoutDebug(process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_LAYOUT === "true");
  const handleMobileGlobeFallback = useCallback((reason?: string) => {
    const fallbackReason = reason || "Globe view is unavailable on this device right now.";
    dispatchAtlasToast({
      title: "Globe view is unavailable on this device right now.",
      subtitle: fallbackReason,
      kind: "alert",
      id: `mobile-globe-fallback-${Date.now()}`,
    });
  }, []);
  const atlasTransition = useAtlasTransitionController({ initialView: atlasView, activeStation: current, onViewChange: setAtlasView, onPersistView: persistAtlasView, onFallback: handleMobileGlobeFallback });
  const activeTransitionContext = useMemo(() => transitionContextForStation(current, mapContext, "active station handoff", true) ?? transitionContext, [current, mapContext, transitionContext]);
  const mobileGlobeFallbackReason = atlasTransition.state.fallbackReason || "";
  const selectedView: AtlasViewMode = mobileGlobeFallbackReason ? "map" : atlasTransition.state.currentView;
  useEffect(() => {
    debugAtlasDecision({ device: "mobile", selectedView, webglSupport: "probed-in-globe", fallbackReason: mobileGlobeFallbackReason || null });
  }, [mobileGlobeFallbackReason, selectedView]);
  const chooseAtlasView = (view: AtlasViewMode) => {
    if (view === selectedView) return;
    if (view === "map") { const context = transitionContextForStation(current, mapContext, "manual atlas view selection", true); setTransitionContext(context); atlasTransition.requestGlobeToMap("manual atlas view selection", context); }
    else if (mobileGlobeFallbackReason) atlasTransition.retryGlobe("manual atlas view selection with fallback recovery", transitionContextForStation(current, mapContext, "manual atlas view selection with fallback recovery", true) ?? transitionContext);
    else atlasTransition.requestMapToGlobe("manual atlas view selection", transitionContextForStation(current, mapContext, "manual atlas view selection", true) ?? transitionContext);
  };
  const enterMobileStreets = useCallback((context?: AtlasTransitionContext) => {
    atlasTransition.resetFallback();
    setTransitionContext(context ?? null);
    setBasemap("atlasStreets");
    atlasTransition.requestGlobeToMap(context?.reason || "globe city/street zoom threshold", context ?? null);
  }, [atlasTransition, setBasemap]);
  const returnMobileToGlobe = useCallback((context: AtlasTransitionContext) => {
    setTransitionContext(context);
    atlasTransition.requestMapToGlobe(context.reason || "map world/country zoom threshold", context);
  }, [atlasTransition]);
  return <section className="waveatlas-mobile-shell fixed inset-0 h-[100dvh] min-h-[100dvh] w-full max-w-[100vw] overflow-hidden bg-transparent text-white md:hidden">
    {selectedView === "map" ? (
      <AtlasViewErrorBoundary key={`mobile-map-${atlasTransition.state.transitionVersion}`} name="mobile map" fallback={<div className="grid h-full place-items-center bg-slate-950 text-ivory">Map view is recovering…</div>}><WaveAtlasMap station={current} stations={stations} mobile resetSignal={resetSignal} basemap={basemap} onBasemapChange={setBasemap} onMapContextChange={setMapContext} onWorldZoomRequest={returnMobileToGlobe} initialContext={activeTransitionContext} onCountrySelect={onCountrySelect} searchActive={false} keyboardOpen={mobileSearchOverlayOpen && visualViewport.keyboardOpen} transitionLocked={atlasTransition.transitionLocked} /></AtlasViewErrorBoundary>
    ) : (
      <AtlasViewErrorBoundary key={`mobile-globe-${current.station_uuid || current.id}-${atlasTransition.state.transitionVersion}`} name="mobile globe" fallback={<div className="grid h-full place-items-center bg-slate-950 text-ivory">Globe view is unavailable on this device right now.</div>} onError={(error) => atlasTransition.failTransition(error.message)}><BlueMarbleGlobe station={current} stations={stations} selectionVersion={selectionVersion} teleporting={mobileTeleporting} mobile basemap={globeBasemap} onCountrySelect={onCountrySelect} onFallback={(reason) => atlasTransition.failTransition(reason)} onStreetZoomRequest={enterMobileStreets} /></AtlasViewErrorBoundary>
    )}
    {mobileGlobeFallbackReason ? <div className="pointer-events-none fixed left-4 top-[calc(env(safe-area-inset-top)+92px)] z-40 max-w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gold/20 bg-slate-950/70 px-3 py-2 text-[11px] text-ivory/70 shadow-xl backdrop-blur-xl"><b className="block text-gold">2D atlas fallback active</b>{mobileGlobeFallbackReason}</div> : null}
    {mode !== "Dial" ? <MobileHeaderCard viewportOffsetTop={visualViewport.viewportOffsetTop} onOpenSearch={() => setSearchOverlayOpen(true)} onOpenSettings={() => setMode("Settings")} /> : null}
    <MobileSearchCommandOverlay open={mobileSearchOverlayOpen} query={query} setQuery={setQuery} stations={stations} onClose={() => { setSearchOverlayOpen(false); setQuery(""); }} onCountrySelect={(country) => { setSearchOverlayOpen(false); window.setTimeout(() => { onCountrySelect(country); onQueryComplete(); }, 250); }} onStationSelect={(station, candidates = [station]) => { setSearchOverlayOpen(false); setQuery(""); window.setTimeout(() => { onQueryComplete(); setScopedStationAndDestination(station, "manual", candidates); }, 250); }} voiceControl={<VoiceCommandButton compact onIntent={onVoiceIntent} onFeedback={onVoiceFeedback} />} />
    <SelectedStationTheater station={current} />
    {wandererActive ? <button onClick={() => setWandererActive(false)} className="fixed bottom-[176px] left-4 z-[56] rounded-full border border-radio/30 bg-slate-950/90 px-4 py-2 text-xs font-medium text-radio shadow-xl backdrop-blur-xl">Wanderer Mode · Exit Wanderer</button> : null}
    <MobileWanderSheet open={wanderOpen} stations={stations} current={current} onTravel={handleTravel} onClose={() => setWanderOpen(false)} />
    {mode === "Settings" ? <div className="pointer-events-auto fixed inset-0 z-[998] overflow-y-auto bg-black/35 pb-28 backdrop-blur-[8px]"><UtilityLinksPanel compact atlasView={selectedView} onChooseAtlasView={chooseAtlasView} atlasViewTransitioning={atlasTransition.transitionLocked} globeFallbackReason={mobileGlobeFallbackReason} basemap={basemap} onBasemapChange={setBasemap} globeBasemap={globeBasemap} onGlobeBasemapChange={(value) => { setGlobeBasemap(value); if (selectedView !== "globe" || mobileGlobeFallbackReason) atlasTransition.retryGlobe("globe style selection", transitionContext); }} atlasDrive={<AtlasLocationPill stations={stations} current={current} />} onClose={() => setMode("Atlas")} startupPreferences={startupPreferences} onStartupPreferencesChange={onStartupPreferencesChange} activeStation={current} /></div> : null}
    {mode === "Add Signal" ? (
      <div className="pointer-events-auto fixed inset-0 z-[999] flex h-[100dvh] items-start justify-center overflow-y-auto overscroll-contain bg-black/45 px-3 pb-[calc(140px_+_env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] backdrop-blur-[10px]">
        <AddYourSignalPanel compact onCancel={() => setMode("Atlas")} />
      </div>
    ) : null}
    <AtlasToast station={current} mobile />
    <MobileNowPlayingMini station={current} onOpen={() => setSheetOpen(true)} />
    <MobileStationSheet station={current} stations={stations} inventoryStats={inventoryStats} setQuery={setQuery} open={sheetOpen || mode === "Library"} setOpen={setSheetOpen} />
    <NewspaperBrief station={current} stations={stations} open={mode === "Brief"} onClose={() => setMode("Atlas")} />
    <MobileCommandDock mode={mode} wandererActive={wandererActive} onToggleWanderer={() => setWandererActive((active) => !active)} onTeleport={() => { if (mobileTeleporting) return; setMobileTeleporting(true); setWandererActive(false); const intent = "Take me somewhere surprising"; const request = playbackRequests.begin("teleport"); usePlayer.getState().setStatus("buffering", "Teleporting…"); void resolveTeleportDestination(stations, usePlayer.getState().current ?? current, playbackRequests.signal(request)).then(({ station, queue }) => { if (playbackRequests.isActive(request)) { commitTeleportStation(station, queue, request); handleTravel(intent); } else playbackRequests.ignoreStale(request, { stage: "mobile teleport resolved" }); }).catch((error) => { if (!(error instanceof DOMException && error.name === "AbortError")) usePlayer.getState().setStatus("failed", "Signal unavailable. Trying another station."); }).finally(() => setMobileTeleporting(false)); }} setMode={(m) => { setMode(m); if (m === "Passport" || m === "History" || m === "Favorites") setSheetOpen(true); else setSheetOpen(false); }} />
  </section>;
}


type SignalSubmissionResponse = {
  message: string;
  review?: { status: string; quality_score: number; recommendation: string };
  error?: string;
};

type UtilityLinksPanelProps = {
  compact?: boolean;
  atlasView?: AtlasViewMode;
  onChooseAtlasView?: (view: AtlasViewMode) => void;
  atlasViewTransitioning?: boolean;
  globeFallbackReason?: string;
  basemap?: BasemapKey;
  onBasemapChange?: (value: BasemapKey) => void;
  globeBasemap?: GlobeBasemapKey;
  onGlobeBasemapChange?: (value: GlobeBasemapKey) => void;
  atlasDrive?: React.ReactNode;
  onClose?: () => void;
  startupPreferences?: StartupPreferences;
  onStartupPreferencesChange?: (preferences: StartupPreferences) => void;
  activeStation?: Station;
};

function UtilityLinksPanel({ compact = false, atlasView, onChooseAtlasView, atlasViewTransitioning = false, globeFallbackReason = "", basemap, onBasemapChange, globeBasemap, onGlobeBasemapChange, atlasDrive, onClose, startupPreferences, onStartupPreferencesChange, activeStation }: UtilityLinksPanelProps) {
  const links = [
    ["Demo", "/demo", "Learn the product in minutes."],
    ["About", "/about", "Mission, indexing, and ownership."],
    ["Legal", "/legal", "Terms, privacy, copyright, and signals."],
    ["Press", "/press", "Tagline, mission, and brand colors."],
  ] as const;
  return <section className={`rounded-[2rem] border border-white/10 bg-slate-950/85 p-5 shadow-2xl backdrop-blur-2xl ${compact ? "mx-4 mt-24" : ""}`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-radio">Settings</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-white">Atlas controls, quietly tucked away.</h2>
        <p className="mt-2 text-sm leading-6 text-ivory/65">Switch views and tune the atlas without crowding the journey.</p>
      </div>
      {onClose ? <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-ivory/70 transition hover:bg-white/10 hover:text-white" aria-label="Close settings"><X className="size-4" /></button> : null}
    </div>



    {startupPreferences && onStartupPreferencesChange ? <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-3">
      <p className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-radio/80">Startup behavior</p>
      <div className="mt-2 grid gap-2">
        <button type="button" onClick={() => onStartupPreferencesChange({ ...startupPreferences, resumeLastStation: !startupPreferences.resumeLastStation })} className={`rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${startupPreferences.resumeLastStation ? "bg-radio text-midnight" : "bg-white/[0.05] text-ivory/75 hover:bg-white/10"}`}>Resume Last Station · {startupPreferences.resumeLastStation ? "On" : "Off"}</button>
        <button type="button" onClick={() => onStartupPreferencesChange({ ...startupPreferences, homeStationStartup: !startupPreferences.homeStationStartup })} className={`rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${startupPreferences.homeStationStartup ? "bg-radio text-midnight" : "bg-white/[0.05] text-ivory/75 hover:bg-white/10"}`}>Home Station startup · {startupPreferences.homeStationStartup ? "On" : "Off"}</button>
        <button type="button" onClick={() => onStartupPreferencesChange({ ...startupPreferences, autoplayAfterSearch: !startupPreferences.autoplayAfterSearch })} className={`rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${startupPreferences.autoplayAfterSearch ? "bg-radio text-midnight" : "bg-white/[0.05] text-ivory/75 hover:bg-white/10"}`}>Autoplay after search · {startupPreferences.autoplayAfterSearch ? "On" : "Off"}</button>
        <button type="button" onClick={() => onStartupPreferencesChange({ ...startupPreferences, autoplayNearbyOnLaunch: !startupPreferences.autoplayNearbyOnLaunch })} className={`rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${startupPreferences.autoplayNearbyOnLaunch ? "bg-radio text-midnight" : "bg-white/[0.05] text-ivory/75 hover:bg-white/10"}`}>Autoplay nearby on launch · {startupPreferences.autoplayNearbyOnLaunch ? "On" : "Off"}</button>
        <button type="button" disabled={!activeStation} onClick={() => activeStation && onStartupPreferencesChange({ ...startupPreferences, homeStationId: stationPersistentId(activeStation), homeStationStartup: true })} className="rounded-2xl bg-white/[0.05] px-3 py-3 text-left text-sm font-semibold text-ivory/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45">Set current as Home Station</button>
        <button type="button" onClick={() => onStartupPreferencesChange({ ...startupPreferences, homeStationId: null, homeStationStartup: false })} className="rounded-2xl bg-white/[0.05] px-3 py-3 text-left text-sm font-semibold text-ivory/75 transition hover:bg-white/10">Clear Home Station</button>
      </div>
      <p className="mt-2 px-1 text-[11px] leading-5 text-ivory/55">By default WaveAtlas opens to discovery with no station selected. Home Station takes precedence over Resume Last Station.</p>
    </div> : null}

    {onChooseAtlasView ? <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-3">
      <p className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-radio/80">Atlas view</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["globe", "map"] as AtlasViewMode[]).map((view) => {
          const disabled = atlasViewTransitioning;
          const needsRecovery = view === "globe" && Boolean(globeFallbackReason);
          const label = disabled ? "Transitioning..." : needsRecovery ? "Retry Globe" : view;
          return <button key={view} type="button" disabled={disabled} onClick={() => onChooseAtlasView(view)} className={`rounded-2xl px-3 py-3 text-sm font-semibold capitalize transition disabled:cursor-wait disabled:opacity-60 ${atlasView === view && !globeFallbackReason ? "bg-radio text-midnight" : needsRecovery ? "border border-gold/30 bg-gold/10 text-gold hover:bg-gold/15" : "bg-white/[0.05] text-ivory/75 hover:bg-white/10"}`}>{label}</button>;
        })}
      </div>
      {globeFallbackReason ? <p className="mt-2 px-1 text-[11px] leading-5 text-gold/80">Globe fallback is recoverable. Use Retry Globe to run a fresh canvas/WebGL check.</p> : null}
    </div> : null}

    {onGlobeBasemapChange && globeBasemap ? <details className="mt-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3">
      <summary className="cursor-pointer px-1 text-[10px] font-black uppercase tracking-[0.2em] text-radio/80">Globe style · {globeBasemapStyles[globeBasemap].name}</summary>
      <div className="mt-2 grid gap-2">
        {getSelectableGlobeBasemapKeys().map((key) => <button key={key} type="button" onClick={() => onGlobeBasemapChange(key)} className={`rounded-2xl px-3 py-2 text-left text-xs font-semibold transition ${globeBasemap === key ? "bg-radio text-midnight" : "bg-white/[0.05] text-ivory/75 hover:bg-white/10"}`}>{globeBasemapStyles[key].label}</button>)}
      </div>
    </details> : null}

    {onBasemapChange && basemap ? <details className="mt-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3">
      <summary className="cursor-pointer px-1 text-[10px] font-black uppercase tracking-[0.2em] text-gold/80">Map basemap · {basemapStyles[basemap].name}</summary>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(Object.keys(basemapStyles) as BasemapKey[]).map((key) => <button key={key} type="button" onClick={() => onBasemapChange(key)} className={`rounded-2xl px-3 py-2 text-left text-[11px] font-semibold transition ${basemap === key ? "bg-gold text-midnight" : "bg-white/[0.05] text-ivory/75 hover:bg-white/10"}`}>{basemapStyles[key].label}</button>)}
      </div>
    </details> : null}


    {atlasDrive ? <div className="mt-3 rounded-3xl border border-white/10 bg-white/[0.04] p-3"><p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-radio/80">Atlas Drive</p><div className="relative min-h-16">{atlasDrive}</div></div> : null}

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

function compactLanguageLabel(language?: string) {
  const primary = language?.split(/[;,/]/)[0]?.trim();
  if (!primary) return "Language TBD";
  return primary.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPopulation(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "Population TBD";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000).toLocaleString()}K`;
  return value.toLocaleString();
}

function compactCapitalLabel(context: WorldContext | null | undefined, station: Station) {
  const capital = ["capital", "capitalCity", "capital_city"]
    .map((key) => context?.place?.[key])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return capital || (station.state && !station.city ? station.state : "Capital TBD");
}

function formatDistanceFromUser(station: Station, userCoords: { lat: number; lng: number } | null) {
  const geo = geotruth(station);
  if (!userCoords || geo.lat === null || geo.lng === null) return "Enable location";
  return `${haversineKm(userCoords, { lat: geo.lat, lng: geo.lng }).toLocaleString()} km away`;
}

function signalLabel(count: number, noun = "signal") {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function buildDidYouKnow(station: Station, region: string, stationCount?: number, countScope: "indexed" | "loaded" = "indexed") {
  const parts = [station.city || station.state || station.country || "This destination"];
  const scopeLabel = countScope === "indexed" ? "indexed" : "loaded";
  const stationText = typeof stationCount === "number" && stationCount > 0 ? `${signalLabel(stationCount, `${scopeLabel} signal`)}` : `a ${region} listening post`;
  return `${parts[0]} reaches WaveAtlas through ${stationText}.`;
}

function DailyPassportInsight({ station, stationCount, countScope = "indexed" }: { station: Station; stationCount?: number; countScope?: "indexed" | "loaded" }) {
  const { visibleWorldContext, visibleWorldContextStatus } = useStationWorldContext(station);
  const place = [station.city || station.state, station.country || countryNameForCode(station.country_code)].filter(Boolean).join(", ") || destinationLabel(station);
  const localTime = visibleWorldContext?.radioDNA.localTime || localTimeForStation(station) || "Local time TBD";
  const language = visibleWorldContext?.radioDNA.languages?.[0] || compactLanguageLabel(station.language);
  const region = visibleWorldContext?.radioDNA.region || stationContinent(station);
  const weather = visibleWorldContext?.climate && typeof visibleWorldContext.climate.temperatureC === "number" ? `${Math.round(visibleWorldContext.climate.temperatureC)}°C now` : visibleWorldContextStatus === "loading" ? "Loading…" : "Weather TBD";
  const stationCountLabel = typeof stationCount === "number" && stationCount > 0 ? signalLabel(stationCount) : "Signal count TBD";
  const stationCountTitle = countScope === "indexed" ? "Indexed signals" : "Loaded signals";
  const contextNote = visibleWorldContext?.radioDNA.culturalSummary || buildDidYouKnow(station, region, stationCount, countScope);
  const stats = [
    ["Local time", localTime],
    ["Language", language],
    ["Region", region],
    ["Weather", weather],
    [stationCountTitle, stationCountLabel],
  ] as const;

  return <div className="mt-3 overflow-hidden rounded-[1.35rem] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(246,224,177,0.38)_45%,rgba(0,214,143,0.12))] p-3 text-[#241a10] shadow-[0_18px_45px_rgba(58,39,12,0.22),inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-xl">
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/45 bg-white/55 text-[1.7rem] leading-none shadow-inner" aria-label={station.country_code ? `${station.country_code} flag` : "Global flag"}>{flagFor(station.country_code)}</span>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-[9px] font-black uppercase tracking-[0.24em] text-[#7a5d18]">Daily Passport live card</p>
        <p className="mt-0.5 whitespace-normal break-words overflow-visible h-auto font-serif text-lg font-black leading-tight">{place}</p>
        <p className="mt-1 whitespace-normal break-words overflow-visible h-auto text-[11px] font-semibold leading-4 text-[#4d3d29]">{contextNote}</p>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-1.5 overflow-visible min-[380px]:grid-cols-3">
      {stats.map(([label, value]) => <div key={label} className="min-w-0 whitespace-normal break-words overflow-visible h-auto rounded-2xl border border-white/35 bg-white/45 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
        <p className="whitespace-normal break-words overflow-visible h-auto font-serif text-[8px] font-black uppercase tracking-[0.16em] text-[#7a6844]">{label}</p>
        <p className="mt-0.5 whitespace-normal break-words overflow-visible h-auto text-[12px] font-extrabold leading-4 text-[#241a10]">{value}</p>
      </div>)}
    </div>
  </div>;
}

function DailyFlightPanel({ stations, inventoryStats, activeStation }: { stations: Station[]; inventoryStats?: StationInventoryStats; activeStation?: Station }) {
  const daily = useMemo(() => {
    if (activeStation) return activeStation;
    const today = new Date().toISOString().slice(0, 10);
    const seed = [...today].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return stations[seed % Math.max(1, stations.length)];
  }, [activeStation, stations]);
  const stationCount = daily?.country_code ? inventoryStats?.countryCounts[daily.country_code] : undefined;
  const stationCountScope = stationCount ? "indexed" : "loaded";
  const resolvedStationCount = stationCount ?? (daily?.country_code ? stations.filter((item) => item.country_code === daily.country_code).length : undefined);
  if (!daily) return null;
  return <section className="overflow-hidden rounded-[2rem] border border-white/25 bg-[linear-gradient(145deg,rgba(243,234,210,0.96),rgba(214,177,93,0.24)_50%,rgba(6,18,32,0.18))] p-3 text-[#2f2618] shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-2xl md:p-5">
    <p className="font-serif text-xs font-black uppercase tracking-[0.22em] text-[#8a6b22]">Daily Passport™</p>
    <h3 className="mt-1 font-serif text-[26px] font-black leading-tight md:text-[28px]">Station Destination Intelligence</h3>
    <p className="mt-2 flex min-w-0 items-center gap-2 font-serif text-base font-bold"><span className="min-w-0 truncate">{destinationLabel(daily)}</span><span className="shrink-0 text-[16px] leading-none" aria-label={daily.country_code ? `${daily.country_code} flag` : "Global flag"}>{flagFor(daily.country_code)}</span></p>
    <p className="truncate font-serif text-sm text-[#594b35]">{getPrimaryGenre(daily)} · {daily.name}</p>
    <DailyPassportInsight station={daily} stationCount={resolvedStationCount} countScope={stationCountScope} />
    <button onClick={() => setCurrentStationAndDestination(daily)} className="mt-4 rounded-full bg-radio px-5 py-3 text-sm font-bold text-midnight"><Plane className="mr-2 inline size-4" />Open Passport Signal</button>
  </section>;
}


type VoiceCommandButtonProps = {
  compact?: boolean;
  onIntent: (intent: VoiceCommandIntent) => void;
  onFeedback?: (message: string) => void;
};

const VOICE_FEEDBACK_AUTO_DISMISS_MS = 4000;
const VOICE_TOOLTIP_DEFAULT_MESSAGE = "Voice commands are push-to-talk.";
const VOICE_TOOLTIP_RESET_MS = 3000;
type MicrophonePermissionState = "unknown" | "granted" | "prompt" | "blocked" | "unsupported" | "unavailable";

function microphoneBlockedMessage() {
  return "Microphone permission is blocked. Re-enable the microphone for this site in your browser settings, then press Retry. Manual search and playback still work.";
}

function VoiceCommandButton({ compact = false, onIntent, onFeedback }: VoiceCommandButtonProps) {
  const [supported] = useState(() => Boolean(getSpeechRecognitionConstructor()));
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState(() => getSpeechRecognitionConstructor() ? VOICE_TOOLTIP_DEFAULT_MESSAGE : "Voice commands are unavailable in this browser.");
  const [microphonePermission, setMicrophonePermission] = useState<MicrophonePermissionState>(() => supported ? "unknown" : "unsupported");
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionActiveRef = useRef(false);
  const manualStopRef = useRef(false);
  const heardSpeechRef = useRef(false);
  const tooltipResetTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clearTooltipResetTimer = useCallback(() => {
    if (tooltipResetTimerRef.current !== null) {
      window.clearTimeout(tooltipResetTimerRef.current);
      tooltipResetTimerRef.current = null;
    }
  }, []);

  const resetLocalTooltip = useCallback(() => {
    clearTooltipResetTimer();
    setMessage(supported ? VOICE_TOOLTIP_DEFAULT_MESSAGE : "Voice commands are unavailable in this browser.");
  }, [clearTooltipResetTimer, supported]);

  const scheduleLocalTooltipReset = useCallback(() => {
    clearTooltipResetTimer();
    tooltipResetTimerRef.current = window.setTimeout(() => {
      tooltipResetTimerRef.current = null;
      setMessage(VOICE_TOOLTIP_DEFAULT_MESSAGE);
    }, VOICE_TOOLTIP_RESET_MS);
  }, [clearTooltipResetTimer]);

  const refreshMicrophonePermission = useCallback(async () => {
    if (!supported || typeof navigator === "undefined") {
      setMicrophonePermission("unsupported");
      return "unsupported" as MicrophonePermissionState;
    }
    if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.getUserMedia) {
      setMicrophonePermission("unavailable");
      return "unavailable" as MicrophonePermissionState;
    }
    if (!("permissions" in navigator)) {
      setMicrophonePermission("unknown");
      return "unknown" as MicrophonePermissionState;
    }
    try {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      permissionStatusRef.current = status;
      const state: MicrophonePermissionState = status.state === "denied" ? "blocked" : status.state === "granted" ? "granted" : "prompt";
      setMicrophonePermission(state);
      status.onchange = () => {
        const next: MicrophonePermissionState = status.state === "denied" ? "blocked" : status.state === "granted" ? "granted" : "prompt";
        setMicrophonePermission(next);
        setMessage(next === "blocked" ? microphoneBlockedMessage() : VOICE_TOOLTIP_DEFAULT_MESSAGE);
      };
      return state;
    } catch {
      setMicrophonePermission("unknown");
      return "unknown" as MicrophonePermissionState;
    }
  }, [supported]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshMicrophonePermission(), 0);
    return () => {
      window.clearTimeout(timer);
      if (permissionStatusRef.current) permissionStatusRef.current.onchange = null;
    };
  }, [refreshMicrophonePermission]);

  useEffect(() => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      recognitionActiveRef.current = true;
      manualStopRef.current = false;
      heardSpeechRef.current = false;
      clearTooltipResetTimer();
      setListening(true);
      setMessage("Listening… try “Search Switzerland” or “Open map view”.");
    };
    recognition.onend = () => {
      const manuallyStopped = manualStopRef.current;
      recognitionActiveRef.current = false;
      manualStopRef.current = false;
      setListening(false);
      resetLocalTooltip();
      if (manuallyStopped || !heardSpeechRef.current) onFeedback?.("");
      heardSpeechRef.current = false;
    };
    recognition.onerror = (event) => {
      const manuallyStopped = manualStopRef.current;
      recognitionActiveRef.current = false;
      manualStopRef.current = false;
      heardSpeechRef.current = false;
      setListening(false);
      resetLocalTooltip();
      if (manuallyStopped) return;
      let fallback = "Voice command was not recognized. Try again.";
      if (event.error === "not-allowed" || event.error === "service-not-allowed") { setMicrophonePermission("blocked"); fallback = microphoneBlockedMessage(); }
      else if (event.error === "audio-capture") { setMicrophonePermission("unavailable"); fallback = "No available microphone was detected. Manual search and playback still work."; }
      else if (event.error === "no-speech") fallback = "Voice timed out without speech. Try again or use manual search.";
      else if (event.error === "network") fallback = "Voice recognition is temporarily unavailable. Manual search still works.";
      setMessage(fallback);
      onFeedback?.(fallback);
    };
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript ?? "";
      }
      if (!transcript.trim()) return;
      heardSpeechRef.current = true;
      setMessage(transcript.trim());
      const result = parseVoiceCommand(transcript);
      const finalLike = Boolean(event.results[event.results.length - 1]?.isFinal);
      if (finalLike) {
        setMessage(result.feedback);
        onFeedback?.(result.feedback);
        if (result.intent) onIntent(result.intent);
        scheduleLocalTooltipReset();
      }
    };
    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      clearTooltipResetTimer();
      recognitionActiveRef.current = false;
      manualStopRef.current = false;
      heardSpeechRef.current = false;
      setMessage(VOICE_TOOLTIP_DEFAULT_MESSAGE);
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [clearTooltipResetTimer, onFeedback, onIntent, resetLocalTooltip, scheduleLocalTooltipReset]);

  const pushToTalk = useCallback(async () => {
    if (!supported || !recognitionRef.current) {
      const fallback = "Voice commands are unavailable in this browser. You can still use search and controls manually.";
      setMessage(fallback);
      onFeedback?.(fallback);
      return;
    }
    if (microphonePermission === "blocked") {
      const next = await refreshMicrophonePermission();
      if (next === "blocked") {
        const fallback = microphoneBlockedMessage();
        setMessage(fallback);
        onFeedback?.(fallback);
        return;
      }
    }
    if (microphonePermission === "unavailable") {
      const fallback = "No available microphone was detected. Manual search and playback still work.";
      setMessage(fallback);
      onFeedback?.(fallback);
      return;
    }
    if (listening || recognitionActiveRef.current) {
      manualStopRef.current = true;
      recognitionActiveRef.current = false;
      setListening(false);
      resetLocalTooltip();
      onFeedback?.("");
      try {
        recognitionRef.current.stop();
      } catch {
        recognitionRef.current.abort();
      }
      return;
    }
    try {
      recognitionActiveRef.current = true;
      recognitionRef.current.start();
    } catch {
      recognitionActiveRef.current = false;
      setListening(false);
      onFeedback?.("");
    }
  }, [listening, microphonePermission, onFeedback, refreshMicrophonePermission, resetLocalTooltip, supported]);

  useEffect(() => {
    const startVoiceSearch = () => {
      const container = containerRef.current;
      if (!container) return;
      const style = window.getComputedStyle(container);
      const rect = container.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return;
      void pushToTalk();
    };
    window.addEventListener("waveatlas:voice-search", startVoiceSearch);
    return () => window.removeEventListener("waveatlas:voice-search", startVoiceSearch);
  }, [pushToTalk]);

  return <div ref={containerRef} className="relative">
    <button type="button" onClick={pushToTalk} className={`${compact ? "size-11" : "size-10"} grid place-items-center rounded-full border ${listening ? "border-radio bg-radio text-midnight" : "border-white/15 bg-white/[0.06] text-ivory/75 hover:border-radio/35 hover:text-radio"} shadow-xl transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold`} aria-pressed={listening} aria-label={microphonePermission === "blocked" ? "Microphone blocked. Retry voice permission" : supported ? "Push to talk voice command" : "Voice commands unsupported"} title={microphonePermission === "blocked" ? "Microphone blocked — retry after restoring permission" : supported ? "Push to talk" : "Voice commands unsupported"}>
      <Mic className="size-4" />
      {microphonePermission === "blocked" ? <span className="absolute -right-1 -top-1 size-3 rounded-full border border-slate-950 bg-red-400" aria-hidden="true" /> : null}
    </button>
    {microphonePermission === "blocked" ? <button type="button" onClick={() => void refreshMicrophonePermission()} className="absolute -right-2 top-11 rounded-full border border-red-300/25 bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-100">Retry</button> : null}
    <span className={`${compact ? "right-0 top-12" : "left-1/2 top-12 -translate-x-1/2"} pointer-events-none absolute z-[80] w-64 rounded-2xl border border-white/10 bg-slate-950/90 px-3 py-2 text-xs text-ivory/75 shadow-2xl backdrop-blur-xl transition ${listening ? "opacity-100" : "opacity-0"}`} role="status" aria-live="polite">{message}</span>
  </div>;
}

export default function WaveAtlasApp({ stations, inventoryStats }: { stations: Station[]; inventoryStats?: StationInventoryStats }) {
  const reducedMotion = useReducedMotion();
  const playerStatus = usePlayer((state) => state.status);
  const playerPlaying = usePlayer((state) => state.playing);
  const playerVolume = usePlayer((state) => state.volume);
  const setPlayerVolume = usePlayer((state) => state.setVolume);
  const selectionVersion = usePlayer((state) => state.selectionVersion);
  const [stationPool, setStationPool] = useState(stations);
  const [arrival, setArrival] = useState<ArrivalDestination | undefined>();
  const [arrivalVisible, setArrivalVisible] = useState(false);
  const [hasCompletedArrival, setHasCompletedArrival] = useState(readHasCompletedArrival);
  const arrivalStation = usePlayer((s) => s.arrivalStation);
  const replacementReason = usePlayer((s) => s.replacementReason);
  const [splashVisible, setSplashVisible] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem(SIGNAL_SPLASH_KEY) !== "true");
  const [splashComplete, setSplashComplete] = useState(() => typeof window === "undefined" || window.sessionStorage.getItem(SIGNAL_SPLASH_KEY) === "true");
  const [startupPreferences, setStartupPreferences] = useState<StartupPreferences>(readStartupPreferences);
  const [startupPreview] = useState(() => stations[Math.floor(Math.random() * Math.max(1, stations.length))]);
  const activeStation = usePlayer((s) => s.current);
  const current = activeStation ?? startupPreview ?? stationPool[0] ?? stations[0];
  const [query, setQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<CountryResult | null>(null);
  const [activeTag, setActiveTag] = useState("");
  const [offset, setOffset] = useState(stations.length);
  const [loadingCountry, setLoadingCountry] = useState(false);
  const [countrySignalMessage, setCountrySignalMessage] = useState("");
  const [desktopResetSignal, setDesktopResetSignal] = useState(0);
  const [deepLinkStatus, setDeepLinkStatus] = useState<"idle" | "loading" | "unavailable">("idle");
  const [voiceFeedback, setVoiceFeedback] = useState("");
  const voiceFeedbackTimerRef = useRef<number | null>(null);
  const [voiceSearchOverlayRequest, setVoiceSearchOverlayRequest] = useState(0);
  const [voiceFocusNonce, setVoiceFocusNonce] = useState(0);
  const voiceSearchRequestRef = useRef(0);
  const [wandererIntent, setWandererIntent] = useState("Take me somewhere surprising");
  const [desktopMode, setDesktopMode] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "add-signal" ? "Add Signal" : "Atlas");
  const [desktopDrawerCollapsed, setDesktopDrawerCollapsed] = useState(true);
  const [desktopRailVisible, setDesktopRailVisible] = useState(true);
  const [briefOpen, setBriefOpen] = useState(false);
  const [wandererActive, setWandererActive] = useState(false);
  const wandererTimer = useRef<number | null>(null);
  const [desktopMapContext, setDesktopMapContext] = useState<MapTeleportContext | null>(null);
  const [desktopTransitionContext, setDesktopTransitionContext] = useState<AtlasTransitionContext | null>(null);
  const [desktopTeleporting, setDesktopTeleporting] = useState(false);
  const [desktopGlobeBasemap, setDesktopGlobeBasemap] = useState<GlobeBasemapKey>(getInitialGlobeBasemap);
  const [desktopAtlasView, setDesktopAtlasView] = useState<AtlasViewMode>("globe");
  const [desktopBasemap, setDesktopBasemap] = useState<BasemapKey>("atlasStreets");
  const [previousDesktopStation, setPreviousDesktopStation] = useState<Station | undefined>();
  const lastDesktopStationRef = useRef<Station | undefined>(undefined);
  const [deepLinkUuid] = useState(() => {
    if (typeof window === "undefined") return "";
    const value = new URLSearchParams(window.location.search).get("station")?.trim() || "";
    return /^[a-z0-9-]{8,80}$/i.test(value) ? value : "";
  });
  const initialStationPoolRef = useRef(stationPool);
  const [closerStationPrompt, setCloserStationPrompt] = useState<CloserStationPromptState | null>(null);
  const closerPromptTimerRef = useRef<number | null>(null);
  const closerPromptLastShownRef = useRef<{ at: number; location?: UserGeoPoint } | null>(null);

  const clearVoiceFeedback = useCallback(() => {
    if (voiceFeedbackTimerRef.current !== null) {
      window.clearTimeout(voiceFeedbackTimerRef.current);
      voiceFeedbackTimerRef.current = null;
    }
    setVoiceFeedback("");
  }, []);

  const showVoiceFeedback = useCallback((message: string) => {
    if (voiceFeedbackTimerRef.current !== null) {
      window.clearTimeout(voiceFeedbackTimerRef.current);
      voiceFeedbackTimerRef.current = null;
    }
    if (!message.trim()) {
      setVoiceFeedback("");
      return;
    }
    setVoiceFeedback(message);
    voiceFeedbackTimerRef.current = window.setTimeout(() => {
      voiceFeedbackTimerRef.current = null;
      setVoiceFeedback("");
    }, VOICE_FEEDBACK_AUTO_DISMISS_MS);
  }, []);

  useEffect(() => () => {
    if (voiceFeedbackTimerRef.current !== null) window.clearTimeout(voiceFeedbackTimerRef.current);
    if (closerPromptTimerRef.current !== null) window.clearTimeout(closerPromptTimerRef.current);
  }, []);

  const dismissCloserStationPrompt = useCallback(() => {
    if (closerPromptTimerRef.current !== null) {
      window.clearTimeout(closerPromptTimerRef.current);
      closerPromptTimerRef.current = null;
    }
    setCloserStationPrompt(null);
  }, []);

  const showCloserStationPrompt = useCallback((prompt: CloserStationPromptState) => {
    if (closerPromptTimerRef.current !== null) window.clearTimeout(closerPromptTimerRef.current);
    closerPromptLastShownRef.current = { at: Date.now(), location: prompt.userLocation };
    setCloserStationPrompt(prompt);
    closerPromptTimerRef.current = window.setTimeout(() => {
      closerPromptTimerRef.current = null;
      setCloserStationPrompt(null);
    }, CLOSER_STATION_PROMPT_DISMISS_MS);
  }, []);

  useEffect(() => {
    const onStationPlaying = (event: Event) => {
      const detail = (event as CustomEvent<{ station?: Station; source?: StationSelectionSource }>).detail;
      const playingStation = detail?.station;
      const source = detail?.source;
      if (!playingStation || (source !== "nearby" && source !== "wanderer")) return;
      void (async () => {
        const userLocation = await getBrowserLocation(1200);
        if (!userLocation) return;
        const lastShown = closerPromptLastShownRef.current;
        if (lastShown && Date.now() - lastShown.at < CLOSER_STATION_PROMPT_COOLDOWN_MS) {
          const movedKm = lastShown.location ? locationDistanceKm(lastShown.location, userLocation) : 0;
          if (movedKm < SIGNIFICANT_LOCATION_CHANGE_KM) return;
        }
        const discovered = await fetchNearbyScope("Current Location", userLocation).catch(() => []);
        const closer = discovered.find((station) => isMeaningfullyCloserStation(station, usePlayer.getState().current ?? playingStation, userLocation));
        if (!closer) return;
        showCloserStationPrompt({ station: closer, queue: uniqueStationCandidates([closer, ...discovered]), message: closerStationPromptMessage(closer), userLocation, createdAt: Date.now() });
      })();
    };
    window.addEventListener("waveatlas:station-playing", onStationPlaying);
    return () => window.removeEventListener("waveatlas:station-playing", onStationPlaying);
  }, [showCloserStationPrompt]);

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
    if (!activeStation || typeof window === "undefined") return;
    window.localStorage.setItem(LAST_STATION_ID_KEY, stationPersistentId(activeStation));
    persistArrival(activeStation, stationContinent(activeStation), window.localStorage);
  }, [activeStation]);


  useEffect(() => {
    if (!current || !stationPool.length) return;
    const anchor = getCandidateLockAnchor(current, stationPool) ?? current;
    if (teleportPoolCache?.anchorKey === stationKey(anchor) && teleportPoolCache.expires > Date.now()) return;
    refreshTeleportPoolInBackground(anchor, readTeleportHistory());
  }, [current, stationPool]);

  useEffect(() => {
    // Intent-first startup: a fresh launch must keep the Atlas empty and silent.
    // Saved home/resume preferences remain persisted for settings, but they must not
    // auto-select a station before the listener explicitly chooses a journey.
    if (!splashComplete || deepLinkUuid || activeStation || !stationPool.length) return;
  }, [activeStation, deepLinkUuid, splashComplete, stationPool.length]);

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
        setDeepLinkStatus("unavailable");
      });
    return () => controller.abort();
  }, [deepLinkUuid]);

  const loadCountryStations = useCallback(async (country: CountryResult, nextOffset = 0, tag = activeTag, request = playbackRequests.begin("search")) => {
    setLoadingCountry(true);
    setCountrySignalMessage(nextOffset ? "Finding more live signals…" : `Tuning into ${country.name}…`);
    if (!nextOffset) setStationPool([]);
    const params = new URLSearchParams({ country: country.name, countryCode: country.code, limit: "500", offset: String(nextOffset) });
    if (tag) params.set("tag", tag);
    const requestUrl = `/api/stations/by-country?${params}`;
    debugCountryClick("request", { apiRequestUrl: requestUrl, resolvedCountryName: country.name, resolvedCountryCode: country.code });
    try {
      const res = await fetch(requestUrl, { signal: playbackRequests.signal(request) });
      if (!res.ok) throw new Error(`Country station request failed: ${res.status}`);
      if (!playbackRequests.isActive(request)) { playbackRequests.ignoreStale(request, { stage: "country fetch", country: country.code }); return; }
      const data = (await res.json()) as { stations: Station[] };
      if (!playbackRequests.isActive(request)) { playbackRequests.ignoreStale(request, { stage: "country parse", country: country.code }); return; }
      const sameCountryStations = data.stations.filter((station) => station.country_code === country.code);
      debugCountryClick("candidates", { apiRequestUrl: requestUrl, candidateCount: sameCountryStations.length, selectedStation: sameCountryStations[0]?.name ?? null });
      setStationPool((prev) => nextOffset ? [...prev, ...sameCountryStations] : sameCountryStations);
      setOffset(nextOffset + sameCountryStations.length);
      if (!nextOffset && sameCountryStations[0] && startupPreferences.autoplayAfterSearch) {
        playFirstSearchCandidate(sameCountryStations, "auto", country.name, request);
        setCountrySignalMessage(`Loading first playable station from ${country.name}…`);
        debugCountryClick("playback", { selectedStation: sameCountryStations[0], playbackResult: "search-session-started" });
      } else if (!nextOffset && sameCountryStations[0]) {
        setCountrySignalMessage(`Found ${sameCountryStations.length.toLocaleString()} ${country.name} signals. Choose one to begin.`);
        debugCountryClick("playback", { selectedStation: null, playbackResult: "autoplay-disabled" });
      } else if (!nextOffset) {
        setCountrySignalMessage("No live signal found here yet. Try Teleport or Add Your Signal.");
        usePlayer.getState().setStatus("failed", "Signal unavailable. Trying another station.");
        debugCountryClick("playback", { selectedStation: null, playbackResult: "no-candidates" });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") { playbackRequests.ignoreStale(request, { stage: "country abort", country: country.code }); return; }
      setCountrySignalMessage("No live signal found here yet. Try Teleport or Add Your Signal.");
      usePlayer.getState().setStatus("failed", "Signal unavailable. Trying another station.");
      debugCountryClick("playback", { selectedStation: null, playbackResult: "request-failed", error: error instanceof Error ? error.message : "unknown" });
    } finally {
      if (playbackRequests.isActive(request)) setLoadingCountry(false);
    }
  }, [activeTag, startupPreferences.autoplayAfterSearch]);
  const centerAppAfterQuery = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('input[placeholder="Search country, city, destination..."]')?.blur();
    });
  }, []);

  const selectCountry = useCallback((country: CountryResult) => {
    setDesktopDrawerCollapsed(false);
    setSelectedCountry(country);
    setQuery("");
    setActiveTag("");
    void loadCountryStations(country, 0, "").finally(centerAppAfterQuery);
  }, [centerAppAfterQuery, loadCountryStations]);
  const selectTag = (tag: string) => {
    setActiveTag(tag);
    if (selectedCountry) void loadCountryStations(selectedCountry, 0, tag);
  };
  const runWandererHop = useCallback(() => {
    const intent = "Wanderer Mode";
    setWandererIntent(intent);
    return Promise.resolve(startWandererDiscovery(stations)).then((version) => {
      const selected = usePlayer.getState().current;
      if (version && selected) {
        rememberJourneyStop(selected);
        setStationPool((prev) => prev.some((station) => stationKey(station) === stationKey(selected)) ? prev : [selected, ...prev]);
      }
    });
  }, [stations]);
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

  const handleDesktopGlobeFallback = useCallback((reason: string) => {
    dispatchAtlasToast({ title: "Globe view is unavailable on this device right now.", subtitle: reason, kind: "alert", id: `desktop-globe-fallback-${Date.now()}` });
  }, []);
  const desktopTransition = useAtlasTransitionController({ initialView: desktopAtlasView, activeStation: current, onViewChange: setDesktopAtlasView, onFallback: handleDesktopGlobeFallback });
  const activeDesktopTransitionContext = useMemo(() => transitionContextForStation(current, desktopMapContext, "active station handoff") ?? desktopTransitionContext, [current, desktopMapContext, desktopTransitionContext]);
  const globeFallbackReason = desktopTransition.state.fallbackReason || "";
  const enterDesktopStreets = useCallback((context?: AtlasTransitionContext) => {
    desktopTransition.resetFallback();
    setDesktopTransitionContext(context ?? null);
    setDesktopBasemap("atlasStreets");
    desktopTransition.requestGlobeToMap(context?.reason || "globe city/street zoom threshold", context ?? null);
  }, [desktopTransition]);
  const returnDesktopToGlobe = useCallback((context: AtlasTransitionContext) => {
    setDesktopTransitionContext(context);
    desktopTransition.requestMapToGlobe(context.reason || "map world/country zoom threshold", context);
  }, [desktopTransition]);

  const chooseDesktopAtlasView = useCallback((view: AtlasViewMode) => {
    if (view === desktopAtlasView && !globeFallbackReason) return;
    if (view === "map") desktopTransition.requestGlobeToMap("voice atlas view selection", transitionContextForStation(current, desktopMapContext, "voice atlas view selection") ?? desktopTransitionContext);
    else if (globeFallbackReason) desktopTransition.retryGlobe("voice atlas view selection with fallback recovery", transitionContextForStation(current, desktopMapContext, "voice atlas view selection with fallback recovery") ?? desktopTransitionContext);
    else desktopTransition.requestMapToGlobe("voice atlas view selection", transitionContextForStation(current, desktopMapContext, "voice atlas view selection") ?? desktopTransitionContext);
  }, [current, desktopAtlasView, desktopMapContext, desktopTransition, desktopTransitionContext, globeFallbackReason]);

  const runDesktopTeleport = useCallback(() => {
    if (desktopTeleporting) return;
    playPremiumTeleportClick();
    setDesktopTeleporting(true);
    setWandererActive(false);
    const request = playbackRequests.begin("teleport");
    usePlayer.getState().setStatus("buffering", "Teleporting…");
    void resolveTeleportDestination(stationPool, usePlayer.getState().current ?? current, playbackRequests.signal(request))
      .then(({ station, queue }) => { if (playbackRequests.isActive(request)) commitTeleportStation(station, queue, request); else playbackRequests.ignoreStale(request, { stage: "teleport resolved" }); })
      .catch((error) => { if (!(error instanceof DOMException && error.name === "AbortError")) usePlayer.getState().setStatus("failed", "Signal unavailable. Trying another station."); })
      .finally(() => setDesktopTeleporting(false));
  }, [current, desktopTeleporting, stationPool]);

  const showVoiceSearchResults = useCallback((query: string, _feedback?: string) => {
    setDesktopMode("Atlas");
    setSelectedCountry(null);
    setDesktopDrawerCollapsed(false);
    setQuery(query);
    setVoiceSearchOverlayRequest((request) => request + 1);
    clearVoiceFeedback();
  }, [clearVoiceFeedback]);

  const selectVoiceStation = useCallback((station: Station, candidates: Station[] = [station], label?: string, request?: PlaybackRequest) => {
    clearVoiceFeedback();
    setScopedStationAndDestination(station, "voice", candidates, label, request);
    setVoiceFocusNonce((nonce) => nonce + 1);
    setStationPool((prev) => uniqueStationCandidates([station, ...candidates, ...prev]));
    setSelectedCountry(null);
    setQuery("");
    setDesktopDrawerCollapsed(true);
    centerAppAfterQuery();
  }, [centerAppAfterQuery, clearVoiceFeedback]);

  const resolveVoiceSearchIntent = useCallback(async (intent: Extract<VoiceCommandIntent, { type: "search" }> | Extract<VoiceCommandIntent, { type: "play" }>) => {
    const query = intent.query?.trim();
    if (!query) return;
    const action = intent.type === "play" ? "play" : intent.action ?? "search";
    const request = playbackRequests.begin("voice");
    const requestId = ++voiceSearchRequestRef.current;
    if (action === "search") showVoiceSearchResults(query, `Searching ${query}.`);
    else showVoiceFeedback(action === "navigate" ? `Looking for ${query}.` : `Searching ${query}.`);
    try {
      const [countryRes, stationRes] = await Promise.all([
        fetch(`/api/countries/search?q=${encodeURIComponent(query)}`, { signal: playbackRequests.signal(request) }),
        fetch(`/api/stations/search?q=${encodeURIComponent(query)}&limit=25`, { signal: playbackRequests.signal(request) }),
      ]);
      if (requestId !== voiceSearchRequestRef.current || !playbackRequests.isActive(request)) { playbackRequests.ignoreStale(request, { stage: "voice fetch" }); return; }
      const countries = countryRes.ok ? ((await countryRes.json()) as { countries: CountryResult[] }).countries : [];
      const stations = stationRes.ok ? ((await stationRes.json()) as { stations: Station[] }).stations : [];
      if (requestId !== voiceSearchRequestRef.current || !playbackRequests.isActive(request)) { playbackRequests.ignoreStale(request, { stage: "voice parse" }); return; }
      const normalizedQuery = query.toLowerCase();
      const exactCountry = countries.find((country) => country.name.toLowerCase() === normalizedQuery || country.code.toLowerCase() === normalizedQuery);
      const exactStations = stations.filter((station) => station.name.toLowerCase() === normalizedQuery);
      const singleStation = exactStations[0] ?? (stations.length === 1 ? stations[0] : undefined);

      const ambiguousCountry = countries.length > 1 && countries.some((country) => country.name.toLowerCase().includes(normalizedQuery) || normalizedQuery.includes(country.name.toLowerCase()));
      if ((action === "navigate" || action === "play") && ambiguousCountry && !singleStation) {
        showVoiceSearchResults(query, `Found multiple matches for ${query}. Showing results.`);
        return;
      }
      if (action === "navigate" && exactCountry) {
        selectCountry(exactCountry);
        clearVoiceFeedback();
        return;
      }
      if ((action === "play" || action === "navigate") && singleStation) {
        selectVoiceStation(singleStation, stations.length ? stations : [singleStation], query, request);
        clearVoiceFeedback();
        return;
      }
      if (action === "play" && stations.length) {
        selectVoiceStation(stations[0], stations, query, request);
        clearVoiceFeedback();
        return;
      }
      if (action === "play" && exactCountry) {
        selectCountry(exactCountry);
        clearVoiceFeedback();
        return;
      }
      if ((countries.length + stations.length) > 1) {
        showVoiceSearchResults(query, `Found multiple matches for ${query}. Showing results.`);
        return;
      }
      if (!countries.length && !stations.length) showVoiceSearchResults(query, `No match found for ${query}. Showing search results.`);
      else showVoiceSearchResults(query, `Showing results for ${query}.`);
    } catch {
      if (requestId !== voiceSearchRequestRef.current || !playbackRequests.isActive(request)) { playbackRequests.ignoreStale(request, { stage: "voice catch" }); return; }
      showVoiceSearchResults(query, `Searching ${query}.`);
    }
  }, [clearVoiceFeedback, selectCountry, selectVoiceStation, showVoiceFeedback, showVoiceSearchResults]);

  const handleVoiceIntent = useCallback((intent: VoiceCommandIntent) => {
    setDesktopDrawerCollapsed(false);
    if (intent.type === "search") {
      void resolveVoiceSearchIntent(intent);
      return;
    }
    if (intent.type === "play") {
      if (intent.query) {
        void resolveVoiceSearchIntent(intent);
      } else {
        const player = usePlayer.getState();
        if (!player.current) { showVoiceFeedback("Search or choose a station to begin."); return; }
        if (!player.playing) player.toggle();
        clearVoiceFeedback();
      }
      return;
    }
    if (intent.type === "pause") {
      const player = usePlayer.getState();
      if (player.playing || player.status === "buffering") player.toggle();
      showVoiceFeedback("Paused playback.");
      return;
    }
    if (intent.type === "resume") {
      const player = usePlayer.getState();
      if (!player.current) { showVoiceFeedback("Search or choose a station to begin."); return; }
      if (!player.playing) player.toggle();
      clearVoiceFeedback();
      return;
    }
    if (intent.type === "switch_view") {
      chooseDesktopAtlasView(intent.view === "map" ? "map" : "globe");
      showVoiceFeedback(intent.view === "map" ? "Opened map view." : "Switched to Atlas globe.");
      return;
    }
    if (intent.type === "teleport") {
      if (intent.query) setQuery(intent.query);
      runDesktopTeleport();
      showVoiceFeedback(intent.query ? `Teleporting to ${intent.query}.` : "Teleporting.");
      return;
    }
    if (intent.type === "wander") {
      setWandererActive(true);
      setWandererIntent(intent.query || "Voice wander");
      showVoiceFeedback("Wanderer Mode started.");
      return;
    }
    if (intent.type === "volume") {
      setPlayerVolume(intent.value);
      showVoiceFeedback(`Volume ${Math.round(intent.value * 100)}%.`);
      return;
    }
    if (intent.type === "open_settings") {
      setDesktopMode("Settings");
      setBriefOpen(false);
      showVoiceFeedback("Opened settings.");
    }
  }, [chooseDesktopAtlasView, clearVoiceFeedback, resolveVoiceSearchIntent, runDesktopTeleport, setPlayerVolume, showVoiceFeedback]);

  const updateStartupPreferences = useCallback((preferences: StartupPreferences) => {
    setStartupPreferences(preferences);
    persistStartupPreferences(preferences);
  }, []);

  const focusSearchFromEmpty = useCallback(() => {
    setDesktopMode("Atlas");
    setDesktopDrawerCollapsed(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[placeholder="Search country, city, destination..."]')?.focus());
  }, []);

  const exploreNearbyFromEmpty = useCallback(() => {
    setDesktopMode("Explore");
    setDesktopDrawerCollapsed(false);
    setBriefOpen(false);
    dismissCloserStationPrompt();
    const request = playbackRequests.begin("nearby");
    usePlayer.getState().setStatus("buffering", "Finding the fastest nearby live signal…");
    const anchor = usePlayer.getState().current ?? current;
    void startNearbyTimeToFirstAudioDiscovery(stations, anchor, request)
      .then(({ station, queue, scope }) => {
        if (!playbackRequests.isActive(request)) { playbackRequests.ignoreStale(request, { stage: "nearby resolved" }); return; }
        setStationPool((prev) => uniqueStationCandidates([station, ...queue, ...prev]));
        setCurrentStationAndDestination(station, "nearby", queue, request);
        setCountrySignalMessage(`Trying ${station.name} from ${scope}. WaveAtlas will keep checking for a closer playable local station.`);
      })
      .catch((error) => {
        if (!playbackRequests.isActive(request)) { playbackRequests.ignoreStale(request, { stage: "nearby fallback", error: error instanceof Error ? error.name : "unknown" }); return; }
        const fallbackQueue = buildWandererCandidateQueue(stations);
        if (fallbackQueue.length) {
          const [station, ...queue] = fallbackQueue;
          setStationPool((prev) => uniqueStationCandidates([station, ...queue, ...prev]));
          setCurrentStationAndDestination(station, "nearby", fallbackQueue, request);
          setCountrySignalMessage("Nearby discovery fell back to the fastest available global signal while local discovery continues.");
        } else {
          usePlayer.getState().setStatus("failed", "Nearby discovery is unavailable right now. Search or Wander can still start the Atlas.");
          setCountrySignalMessage("Nearby discovery is unavailable right now. Search or Wander can still start the Atlas.");
        }
      });
    return "Finding the fastest nearby live signal now. Audio will start as soon as the first playable station responds.";
  }, [current, dismissCloserStationPrompt, stations]);

  const wanderFromEmpty = useCallback(() => {
    setWandererActive(true);
    const version = startWandererDiscovery(stations);
    usePlayer.getState().setStatus("buffering", "Finding a playable station...");
    return version ? "Wanderer Mode started. Finding a playable global signal…" : "Wanderer Mode is unavailable because no playable signals were found. Try Search.";
  }, [stations]);

  const voiceSearchFromEmpty = useCallback(() => {
    setDesktopMode("Atlas");
    setDesktopDrawerCollapsed(false);
    window.dispatchEvent(new Event("waveatlas:voice-search"));
    if (!getSpeechRecognitionConstructor()) return "Voice Search is not available in this browser. The Atlas search drawer is open for manual search.";
    return "Voice Search requested. If your browser asks, allow microphone access to continue.";
  }, []);

  const editorialPicksFromEmpty = useCallback(() => {
    setDesktopMode("Brief");
    setDesktopDrawerCollapsed(false);
    setBriefOpen(true);
    return "Opening Daily Passport editorial picks.";
  }, []);

  const pulseDesktopTeleport = !reducedMotion && (playerStatus === "idle" || playerStatus === "playing") && !briefOpen && desktopMode !== "Add Signal";

  useEffect(() => {
    if (typeof window === "undefined") return;
    let hideTimer: number | undefined;
    const revealRail = () => {
      setDesktopRailVisible(true);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setDesktopRailVisible(false), 8000);
    };
    revealRail();
    window.addEventListener("mousemove", revealRail, { passive: true });
    return () => {
      window.removeEventListener("mousemove", revealRail);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  const desktopDrawerWorkflows = new Set(["Favorites", "Explore", "Add Signal", "Settings", "History"]);
  const desktopDrawerActive = query.trim().length > 0 || Boolean(selectedCountry) || desktopDrawerWorkflows.has(desktopMode);
  const desktopDrawerOpen = desktopDrawerActive && !desktopDrawerCollapsed;
  const closeDesktopDrawer = useCallback(() => {
    setQuery("");
    setSelectedCountry(null);
    setDesktopMode("Atlas");
    setDesktopDrawerCollapsed(true);
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
      {deepLinkStatus !== "idle" ? <div className="fixed left-1/2 top-4 z-[80] w-[min(92vw,34rem)] -translate-x-1/2 rounded-3xl border border-white/10 bg-slate-950/90 p-4 text-sm text-ivory shadow-2xl backdrop-blur-xl"><b className="block text-base text-white">{deepLinkStatus === "loading" ? "Resolving shared station…" : "Station unavailable or moved"}</b><p className="mt-1 text-ivory/70">{deepLinkStatus === "loading" ? `Looking up exact station UUID ${deepLinkUuid}.` : `No station matched UUID ${deepLinkUuid}. Return to discovery or search for another station.`}</p></div> : null}
      <div className="fixed right-4 top-[calc(env(safe-area-inset-top)+68px)] z-[60] md:hidden"><VoiceCommandButton compact onIntent={handleVoiceIntent} onFeedback={showVoiceFeedback} /></div>
      {voiceFeedback ? <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+118px)] z-[61] w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl border border-radio/20 bg-slate-950/86 px-3 py-2 text-center text-xs font-medium text-radio shadow-2xl backdrop-blur-xl md:hidden" role="status" aria-live="polite">{voiceFeedback}</div> : null}
      <AnimatePresence>
        {closerStationPrompt ? <motion.div initial={{ opacity: 0, y: -14, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: -10, x: "-50%" }} className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+72px)] z-[82] w-[min(92vw,26rem)] rounded-3xl border border-radio/25 bg-slate-950/92 p-4 text-ivory shadow-2xl backdrop-blur-2xl" role="dialog" aria-live="polite" aria-label="Closer local station available">
          <p className="text-sm font-semibold text-white">{closerStationPrompt.message}</p>
          <p className="mt-1 text-xs text-ivory/65">{closerStationPrompt.station.name} · {closerStationPrompt.station.country}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { const prompt = closerStationPrompt; dismissCloserStationPrompt(); setStationPool((prev) => uniqueStationCandidates([prompt.station, ...prompt.queue, ...prev])); setCurrentStationAndDestination(prompt.station, "nearby", prompt.queue); }} className="flex-1 rounded-full bg-radio px-4 py-2 text-sm font-bold text-midnight">Switch</button>
            <button type="button" onClick={dismissCloserStationPrompt} className="flex-1 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-ivory/80">Stay</button>
          </div>
        </motion.div> : null}
      </AnimatePresence>
      {activeStation ? <MobileAtlasShell stations={stationPool} allStations={stations} current={activeStation} inventoryStats={inventoryStats} query={query} setQuery={setQuery} onCountrySelect={selectCountry} setWandererIntent={setWandererIntent} onQueryComplete={centerAppAfterQuery} voiceSearchOverlayRequest={voiceSearchOverlayRequest} onVoiceIntent={handleVoiceIntent} onVoiceFeedback={showVoiceFeedback} startupPreferences={startupPreferences} onStartupPreferencesChange={updateStartupPreferences} /> : <div className="md:hidden"><EmptyAtlasState onExploreNearby={exploreNearbyFromEmpty} onWander={wanderFromEmpty} onSearch={focusSearchFromEmpty} onVoiceSearch={voiceSearchFromEmpty} onEditorialPicks={editorialPicksFromEmpty} /></div>}
    <main className="hidden h-screen min-h-[720px] w-full overflow-hidden bg-slate-950 md:block">
      <div className="pointer-events-none fixed left-6 right-6 top-6 z-40 flex items-start justify-between xl:left-8 xl:right-8">
        <b className="pointer-events-auto rounded-full border border-white/10 bg-slate-950/40 px-4 py-2 font-display text-[18px] font-bold leading-none text-ivory shadow-2xl backdrop-blur-2xl">
          WaveAtlas™
        </b>
      </div>
      <div className="absolute inset-0 z-0">
        <div className="hidden"><DailyFlightPanel stations={stationPool} inventoryStats={inventoryStats} activeStation={activeStation} /></div>
        {wandererActive ? <button onClick={() => setWandererActive(false)} className="absolute left-6 top-28 z-30 rounded-[2rem] border border-radio/30 bg-slate-950/55 px-4 py-3 text-left text-sm font-medium text-radio shadow-2xl backdrop-blur-xl xl:left-8">Wanderer Mode · continuous global exploration active · Exit Wanderer</button> : null}
        <div id="atlas-map" className="h-full w-full scroll-mt-0" onMouseDown={() => { if (desktopDrawerOpen) closeDesktopDrawer(); }}>
          {!activeStation ? <EmptyAtlasState onExploreNearby={exploreNearbyFromEmpty} onWander={wanderFromEmpty} onSearch={focusSearchFromEmpty} onVoiceSearch={voiceSearchFromEmpty} onEditorialPicks={editorialPicksFromEmpty} /> : globeFallbackReason || desktopAtlasView === "map" ? (
            <AtlasViewErrorBoundary key={`desktop-map-${desktopTransition.state.transitionVersion}`} name="desktop map" fallback={<div className="grid h-full place-items-center bg-slate-950 text-ivory">Map view is recovering…</div>}><WaveAtlasMap station={activeStation} stations={stationPool} resetSignal={desktopResetSignal} basemap={desktopBasemap} onBasemapChange={setDesktopBasemap} onMapContextChange={setDesktopMapContext} onWorldZoomRequest={returnDesktopToGlobe} initialContext={activeDesktopTransitionContext} onCountrySelect={selectCountry} searchActive={query.trim().length > 0} transitionLocked={desktopTransition.transitionLocked} /></AtlasViewErrorBoundary>
          ) : (
            <AtlasViewErrorBoundary key={`desktop-globe-${activeStation.station_uuid || activeStation.id}-${desktopTransition.state.transitionVersion}-${voiceFocusNonce}`} name="desktop globe" fallback={<div className="grid h-full place-items-center bg-slate-950 text-ivory">Globe view is unavailable on this device right now.</div>} onError={(error) => desktopTransition.failTransition(error.message)}><BlueMarbleGlobe station={activeStation} stations={stationPool} previousStation={previousDesktopStation} selectionVersion={selectionVersion} teleporting={desktopTeleporting} basemap={desktopGlobeBasemap} onCountrySelect={selectCountry} onFallback={(reason) => desktopTransition.failTransition(reason)} onStreetZoomRequest={enterDesktopStreets} /></AtlasViewErrorBoundary>
          )}
        </div>
        {globeFallbackReason ? <div className="pointer-events-none absolute left-6 top-[8.5rem] z-40 max-w-sm rounded-2xl border border-gold/20 bg-slate-950/75 px-4 py-3 text-xs text-ivory/70 shadow-2xl backdrop-blur-xl xl:left-8"><b className="block text-gold">2D atlas fallback active</b>{globeFallbackReason}</div> : null}
        {activeStation ? <SelectedStationTheater station={activeStation} /> : null}
      </div>
      <section className="pointer-events-none fixed left-[calc(50%+120px)] top-[calc(env(safe-area-inset-top)+1.5rem)] z-50 w-[min(520px,calc(100vw-31rem))] -translate-x-1/2">
        <div className="pointer-events-auto rounded-full border border-white/15 bg-slate-950/40 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,.35)] backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <Search className="shrink-0 text-sky" />
            <input
              value={query}
              onChange={(e) => { setDesktopDrawerCollapsed(false); setQuery(e.target.value); }}
              onFocus={() => { if (desktopDrawerActive) setDesktopDrawerCollapsed(false); }}
              placeholder="Search country, city, destination..."
              className="w-full bg-transparent outline-none placeholder:text-ivory/45"
            />
            <VoiceCommandButton onIntent={handleVoiceIntent} onFeedback={showVoiceFeedback} />
          </div>
        </div>
        {voiceFeedback ? <p className="pointer-events-none mx-auto mt-2 w-fit rounded-full border border-radio/20 bg-slate-950/70 px-3 py-1.5 text-center text-xs font-medium text-radio shadow-xl backdrop-blur-xl" role="status" aria-live="polite">{voiceFeedback}</p> : null}
      </section>
      <>
        <nav className={`${desktopRailVisible ? "flex translate-x-0 opacity-100" : "hidden -translate-x-3 opacity-25 min-[1440px]:flex"} pointer-events-auto fixed left-6 top-28 z-30 flex-col gap-2 rounded-full border border-white/10 bg-slate-950/25 p-2 text-ivory shadow-2xl backdrop-blur-2xl transition duration-500 [backdrop-filter:blur(18px)_saturate(1.05)] xl:left-8`} aria-label="Atlas utility rail">
          {([
            [Heart, "Favorites"],
            [Globe2, "Explore"],
            [Signal, "Add Signal"],
            [Radio, "History"],
            [Settings, "Settings"],
          ] as const).map(([Icon, label]) => {
            const I = Icon as typeof Settings;
            return <button key={label} type="button" onClick={() => { setDesktopRailVisible(true); setDesktopDrawerCollapsed(false); setBriefOpen(false); setDesktopMode(label); }} className="grid size-11 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-ivory/72 transition hover:border-radio/35 hover:bg-radio/10 hover:text-radio focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold" aria-label={`Open ${label}`}>
              <I className="size-4" />
            </button>;
          })}
        </nav>
        <button type="button" onClick={() => { setDesktopRailVisible(true); }} className={`${desktopRailVisible ? "hidden" : "grid"} pointer-events-auto fixed left-4 top-1/2 z-30 size-10 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-slate-950/25 text-ivory/70 shadow-2xl backdrop-blur-2xl transition hover:border-radio/35 hover:text-radio min-[1440px]:hidden`} aria-label="Expand atlas utility rail">
          <ChevronRight className="size-4" />
        </button>
      </>
      {desktopDrawerActive ? <aside className={`${desktopDrawerOpen ? "translate-x-0 opacity-100" : "-translate-x-[calc(100%-3.5rem)] opacity-95"} pointer-events-auto fixed bottom-28 left-6 top-32 z-40 flex w-[min(400px,calc(100vw-3rem))] flex-col rounded-[2rem] border border-white/10 bg-[rgba(8,17,29,0.62)] p-4 text-ivory shadow-[0_16px_48px_rgba(0,0,0,0.32)] backdrop-blur-[16px] [backdrop-filter:blur(16px)_saturate(1.08)] transition duration-300 xl:left-8`} aria-label="Search and discovery drawer">
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
          {desktopMode === "Settings" ? <div className="mt-5"><UtilityLinksPanel atlasView={desktopAtlasView} onChooseAtlasView={chooseDesktopAtlasView} atlasViewTransitioning={desktopTransition.transitionLocked} globeFallbackReason={globeFallbackReason} basemap={desktopBasemap} onBasemapChange={setDesktopBasemap} globeBasemap={desktopGlobeBasemap} onGlobeBasemapChange={(value) => { setDesktopGlobeBasemap(value); if (desktopAtlasView !== "globe" || globeFallbackReason) desktopTransition.retryGlobe("globe style selection", desktopTransitionContext); }} atlasDrive={activeStation ? <AtlasLocationPill stations={stationPool} current={activeStation} /> : undefined} startupPreferences={startupPreferences} onStartupPreferencesChange={updateStartupPreferences} activeStation={activeStation} /></div> : null}
          {desktopMode === "Add Signal" ? <div className="mt-5"><AddYourSignalPanel /></div> : null}
          {desktopMode === "Brief" ? <div className="mt-5"><div className="mb-4 rounded-3xl border border-radio/20 bg-radio/10 p-4"><p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-radio">Global indexed signals</p><p className="mt-1 text-2xl font-bold text-ivory">{signalLabel(inventoryStats?.globalCount ?? stationPool.length)}</p><p className="text-xs text-ivory/55">{inventoryStats?.source === "radio-browser" ? "Full Radio Browser country inventory" : "Curated fallback inventory"}</p></div><DailyFlightPanel stations={stationPool} inventoryStats={inventoryStats} activeStation={current} /></div> : null}
          {desktopMode === "History" ? <div className="mt-5"><RecentlyVisitedPanel /></div> : null}
          {query.trim() ? <GroupedSearchResults query={query} stations={stationPool} onStationSelect={(station, candidates) => { setScopedStationAndDestination(station, "manual", candidates); setStationPool((prev) => prev.some((s) => s.id === station.id) ? prev : [station, ...prev]); setSelectedCountry(null); setQuery(""); setDesktopDrawerCollapsed(true); centerAppAfterQuery(); }} onCountrySelect={selectCountry} setQuery={setQuery} compact /> : null}
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
              <button key={s.id} onClick={() => { setScopedStationAndDestination(s, "manual", visible); setQuery(""); setDesktopDrawerCollapsed(true); centerAppAfterQuery(); }} className="rounded-[18px] border border-white/[0.08] bg-[rgba(20,28,42,0.82)] px-4 py-3 text-left transition hover:border-gold/45 hover:bg-[rgba(28,38,58,0.9)]"><b className="block truncate font-display text-[15px] tracking-[-0.015em] text-[#F8FAFC]">{s.name}</b><p className="mt-1 truncate text-xs leading-5 text-white/[0.72]">{[s.city || s.state, s.country].filter(Boolean).join(" · ")} · {s.tags.slice(0, 2).join(", ") || "live radio"}</p></button>
            ))}
          </div> : null}
          {selectedCountry && !visible.length && !loadingCountry ? <p className="mt-5 rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm font-medium text-slate-300">No live signal found here yet. Try Teleport or Add Your Signal.</p> : null}
          {selectedCountry ? <button disabled={loadingCountry} onClick={() => loadCountryStations(selectedCountry, offset)} className="mt-5 w-full rounded-full bg-radio px-5 py-3 font-medium text-midnight disabled:opacity-50">{loadingCountry ? `Acquiring ${selectedCountry.name} signals…` : "Load More stations"}</button> : null}
        </div>
      </aside> : null}
      {activeStation ? <NewspaperBrief station={activeStation} stations={stationPool} inventoryStats={inventoryStats} open={briefOpen} onClose={() => { setBriefOpen(false); setDesktopMode("Atlas"); }} /> : null}
      {activeStation ? <AtlasToast station={activeStation} /> : null}
      {activeStation ? <GeoAudioChannelInspector station={activeStation} /> : null}
      {activeStation ? <div className="fixed inset-x-6 bottom-6 z-[70] mx-auto grid w-fit max-w-[min(920px,calc(100vw-3rem))] pointer-events-auto grid-cols-[minmax(280px,360px)_auto] gap-3 rounded-[2rem] border border-white/25 bg-[rgba(3,9,18,0.96)] p-2 text-white shadow-[0_28px_95px_rgba(0,0,0,.70),0_0_0_1px_rgba(54,245,162,.08)] backdrop-blur-[28px] [backdrop-filter:blur(28px)_saturate(1.22)] xl:bottom-8">
        <div className="flex min-w-0 items-center gap-3 px-3">
          <button
            onClick={() => {
              const player = usePlayer.getState();
              if (!player.current) setCurrentStationAndDestination(current);
              else player.toggle();
            }}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-radio text-midnight shadow-[0_0_26px_rgba(54,245,162,.36)]"
            aria-label="Play or pause current station"
          >
            {playerPlaying ? <Pause /> : <Play />}
          </button>
          <div className="min-w-0">
            <OverflowMarquee text={current.name} className="text-sm font-extrabold text-white drop-shadow-[0_2px_7px_rgba(0,0,0,.55)]" />
            <OverflowMarquee text={current.sourceType === "geoaudio" && current.geoAudio?.currentTrackTitle ? current.geoAudio.currentTrackTitle : `${getPrimaryGenre(current)} · ${current.curation_source || current.curation_tier || "Radio Browser"}`} className="text-[11px] font-medium text-ivory/82 drop-shadow-[0_1px_5px_rgba(0,0,0,.45)]" />
          </div>
          <button type="button" onClick={() => setPlayerVolume(playerVolume > 0 ? 0 : 1)} className="ml-auto grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-ivory/78 transition hover:border-radio/35 hover:bg-radio/10 hover:text-radio focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold" aria-label={playerVolume > 0 ? "Mute player" : "Unmute player"}>
            {playerVolume > 0 ? <Volume2 className="size-4 drop-shadow-[0_1px_5px_rgba(0,0,0,.5)]" /> : <VolumeX className="size-4 drop-shadow-[0_1px_5px_rgba(0,0,0,.5)]" />}
          </button>
        </div>
        <nav className="pointer-events-auto grid grid-cols-3 gap-1 rounded-full border border-white/20 bg-slate-950/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]" aria-label="Primary desktop actions">
          {([[Newspaper,"Brief"],[Plane,"Teleport"],[Compass,wandererActive ? "Exit Wanderer" : "Wanderer"]] as const).map(([Icon,label]) => { const I = Icon as typeof Compass; const value = label as string; const isTeleport = value === "Teleport"; return <div key={value} className={isTeleport ? "relative" : undefined}>{isTeleport && pulseDesktopTeleport ? <span className="pointer-events-none absolute inset-0 rounded-full border border-[rgba(0,214,143,0.35)] shadow-[0_0_24px_rgba(0,214,143,0.22)] animate-[teleportPulse_2.8s_ease-out_infinite]" /> : null}<motion.button type="button" whileTap={isTeleport && !reducedMotion ? { scale: 0.96 } : undefined} transition={{ type: "spring", stiffness: 520, damping: 28, mass: 0.45 }} onClick={() => { if (value === "Teleport") { runDesktopTeleport(); } else if (value === "Brief") { setDesktopMode("Atlas"); setBriefOpen((open) => !open); } else if (value === "Wanderer" || value === "Exit Wanderer") { setWandererActive((active) => !active); } else { setDesktopDrawerCollapsed(false); setBriefOpen(false); setDesktopMode(value); } }} className={`pointer-events-auto relative z-[1] w-full rounded-full px-3 py-2 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${((value === "Brief" && briefOpen) || desktopMode === label || ((label === "Wanderer" || label === "Exit Wanderer") && wandererActive)) ? "bg-radio text-midnight" : isTeleport ? "border border-radio/20 bg-radio/10 text-radio hover:bg-radio/15" : "text-ivory/70 hover:bg-white/10"}`} aria-label={`${label as string} command`}><I className="mx-auto mb-0.5 size-4" />{isTeleport && desktopTeleporting ? "Teleporting…" : label as string}</motion.button></div>; })}
        </nav>
      </div> : null}
    </main>
    </>
  );
}
