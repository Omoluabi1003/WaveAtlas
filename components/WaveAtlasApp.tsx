"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Image from "next/image";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";
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
  Sparkles,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { isoCountryCentroids, resolveStationGeo, type ResolvedStationGeo } from "@/lib/geotruth-resolver";
import { BRAND, WAVEATLAS_LOGO_PATH } from "@/lib/branding";
import { useMapCameraController } from "@/hooks/useMapCameraController";
import { useIOSVisualViewport } from "@/hooks/useIOSVisualViewport";
import { flagFor, type Station } from "@/lib/stations";
import { ArrivalCard } from "@/components/arrival-card";
import { createArrivalDestination, type ArrivalDestination } from "@/lib/discovery/arrival-engine";
import { destinationLabel, persistArrival, readArrivalHistory, stationGenre } from "@/lib/discovery/history";
import { pickFallbackStation } from "@/lib/discovery/station-picker";

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
type PlayerState = {
  current?: Station;
  playing: boolean;
  status: PlaybackStatus;
  volume: number;
  error?: string;
  userActivated: boolean;
  setStation: (s: Station) => void;
  prepareStation: (s: Station) => void;
  toggle: () => void;
  setVolume: (n: number) => void;
  setStatus: (s: PlaybackStatus, error?: string) => void;
};

const usePlayer = create<PlayerState>((set) => ({
  playing: false,
  status: "idle",
  volume: 1,
  userActivated: false,
  setStation: (current) =>
    set({
      current,
      playing: false,
      status: "buffering",
      error: undefined,
      userActivated: true,
    }),
  prepareStation: (current) =>
    set((state) => ({
      current,
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

function getStationStreamUrl(station?: Station) {
  return station?.url_resolved?.trim() || station?.url?.trim() || "";
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
  return <ListCard title="Nearby echoes" items={similar.map((s) => ({ key: s.id, label: s.name, meta: `${s.country} · ${getPrimaryGenre(s)}`, action: () => usePlayer.getState().setStation(s) }))} />;
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

function StationIntelligencePanel({ station, stations, setQuery }: { station: Station; stations: Station[]; setQuery: (q: string) => void }) {
  const genre = getPrimaryGenre(station);
  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-[12px] font-semibold text-gold">Destination Intelligence</p>
          <p className="mt-1 text-sm text-ivory/55">Cultural context for this destination</p>
        </div>
        <StreamHealthBadge station={station} />
      </div>
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
  const { current, status, volume, userActivated, setStatus } = usePlayer();
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const element = new Audio();
    element.preload = "metadata";
    element.volume = 1;
    element.muted = false;
    audio.current = element;
    const onError = () => {
      const code = element.error?.code;
      const failed = usePlayer.getState().current;
      const fallback = failed ? pickFallbackStation(stations, failed, readArrivalHistory()) : undefined;
      if (fallback) {
        usePlayer.getState().setStation(fallback);
        return;
      }
      setStatus("failed", `Stream failed${code ? ` (audio error ${code})` : ""}. No alternate live destination was available.`);
    };
    element.addEventListener("error", onError);

    return () => {
      element.removeEventListener("error", onError);
      element.pause();
      element.removeAttribute("src");
      element.load();
      audio.current = null;
    };
  }, [setStatus, stations]);

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
      element.pause();
      setStatus("failed", "This station did not provide a stream URL.");
      return;
    }

    if (!/^https?:\/\//i.test(streamUrl)) {
      element.pause();
      setStatus("failed", `Unsupported stream URL: ${streamUrl}`);
      return;
    }

    if (!userActivated) {
      element.src = streamUrl;
      element.preload = "metadata";
      element.load();
      setStatus(
        "blocked",
        "Tap to Play: browsers require a click before live audio can start.",
      );
      return;
    }

    if (status !== "buffering") return;

    let cancelled = false;
    const playSelectedStream = async () => {
      try {
        setStatus("buffering");
        element.pause();
        element.src = streamUrl;
        element.preload = "metadata";
        element.volume = volume;
        element.muted = false;
        element.load();
        await element.play();
        if (!cancelled) {
          setStatus("playing");
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Playback was blocked or the stream failed.";
          const fallback = current ? pickFallbackStation(stations, current, readArrivalHistory()) : undefined;
          if (fallback && !message.toLowerCase().includes("user") && !message.toLowerCase().includes("gesture") && !message.toLowerCase().includes("allowed")) {
            usePlayer.getState().setStation(fallback);
          } else {
            setStatus(message.toLowerCase().includes("user") || message.toLowerCase().includes("gesture") || message.toLowerCase().includes("allowed") ? "blocked" : "failed", message);
          }
        }
      }
    };

    void playSelectedStream();

    return () => {
      cancelled = true;
    };
  }, [current, status, userActivated, setStatus, volume, stations]);

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
type BasemapKey = "atlas" | "satellite" | "terrain" | "streets" | "night" | "blueMarble";
type DefaultMapView = { center: [number, number]; zoom: number; bearing: number; pitch: number; duration: number };
const DEFAULT_MAP_VIEW: Record<"desktop" | "mobile", DefaultMapView> = {
  desktop: { center: [0, 20], zoom: 1.6, bearing: 0, pitch: 0, duration: 2500 },
  mobile: { center: [8.6753, 9.082], zoom: 1.35, bearing: 0, pitch: 0, duration: 2500 },
};
const DEFAULT_BASEMAP: BasemapKey = "streets";
const BASEMAP_STORAGE_KEY = "waveatlas:basemap";
const basemapStyles: Record<BasemapKey, { label: string; name: string; description: string; style: string | maplibregl.StyleSpecification }> = {
  atlas: { label: "🌎 Atlas", name: "Atlas", description: "Premium dark vector map", style: { version: 8, sources: { carto: { type: "raster", tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors © CARTO" } }, layers: [{ id: "carto-dark-matter", type: "raster", source: "carto" }] } },
  satellite: { label: "🛰 Satellite", name: "Satellite", description: "Realistic Earth imagery", style: { version: 8, sources: { esri: { type: "raster", tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" } }, layers: [{ id: "esri-world-imagery", type: "raster", source: "esri" }] } },
  terrain: { label: "🏔 Terrain", name: "Terrain", description: "Topographic terrain", style: { version: 8, sources: { terrain: { type: "raster", tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap (CC-BY-SA)" } }, layers: [{ id: "opentopomap-terrain", type: "raster", source: "terrain" }] } },
  streets: { label: "🛣 Streets", name: "Streets", description: "OpenStreetMap style", style: "https://tiles.openfreemap.org/styles/liberty" },
  night: { label: "🌃 Night", name: "Night Lights", description: "Earth at night", style: { version: 8, sources: { nasa: { type: "raster", tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg"], tileSize: 256, attribution: "NASA GIBS / VIIRS City Lights" } }, layers: [{ id: "viirs-night-lights", type: "raster", source: "nasa" }] } },
  blueMarble: { label: "🌊 Blue Marble", name: "Blue Marble", description: "Clean global Earth aesthetic", style: { version: 8, sources: { marble: { type: "raster", tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg"], tileSize: 256, attribution: "NASA GIBS / Blue Marble" } }, layers: [{ id: "blue-marble", type: "raster", source: "marble" }] } },
};
function getInitialBasemap(mobile: boolean): BasemapKey { if (typeof window === "undefined") return DEFAULT_BASEMAP; const saved = window.localStorage.getItem(BASEMAP_STORAGE_KEY) as BasemapKey | null; return saved && saved in basemapStyles ? saved : DEFAULT_BASEMAP; }
function BasemapSwitcher({ value, onChange, compact = false }: { value: BasemapKey; onChange: (value: BasemapKey) => void; compact?: boolean }) { return <div className={`${compact ? "grid grid-cols-2 gap-1 rounded-2xl p-1" : "grid grid-cols-3 gap-1 rounded-2xl p-1"} border border-white/10 bg-slate-950/80 shadow-xl backdrop-blur-xl`} aria-label="Basemap Cockpit">{(Object.keys(basemapStyles) as BasemapKey[]).map((key) => <button key={key} aria-label={`Switch basemap to ${basemapStyles[key].name}`} onClick={() => onChange(key)} className={`${compact ? "rounded-xl px-2 py-2 text-[10px]" : "rounded-xl px-3 py-2 text-xs"} font-medium transition ${value === key ? "bg-gold text-midnight" : "text-ivory/70 hover:bg-white/10"}`} title={basemapStyles[key].description}>{basemapStyles[key].label}</button>)}</div>; }
function MapStyleController({ map, basemap, onResize }: { map: Map | null; basemap: BasemapKey; onResize?: () => void }) { useEffect(() => { if (!map) return; map.setStyle(basemapStyles[basemap].style); try { window.localStorage.setItem(BASEMAP_STORAGE_KEY, basemap); } catch { /* Basemap preference is non-critical. */ } const resize = () => requestAnimationFrame(() => { map.resize(); onResize?.(); }); map.once("styledata", resize); resize(); return () => { map.off("styledata", resize); }; }, [map, basemap, onResize]); return null; }

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
}: {
  marker: Marker | null;
  geo: GeoPoint;
  status: PlaybackStatus;
}) {
  useEffect(() => {
    if (geo.lat === null || geo.lng === null) return;
    marker?.setLngLat([geo.lng, geo.lat]);
  }, [geo, marker]);
  useEffect(() => {
    const element = marker?.getElement();
    if (!element) return;
    element.className = `station-pulse-marker tone-${geo.tone} status-${status}`;
    element.innerHTML =
      '<span class="station-pulse-ring"></span><span class="station-pulse-ring two"></span><span class="station-pin" aria-hidden="true"><svg viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 40C16 40 29 25.6 29 14.8C29 7.73 23.18 2 16 2C8.82 2 3 7.73 3 14.8C3 25.6 16 40 16 40Z" fill="currentColor" stroke="rgba(255,255,255,.9)" stroke-width="2.2" /></svg></span><span class="station-pulse-dot"></span>';
  }, [geo.tone, marker, status]);
  return null;
}


type MapTeleportContext = { lat: number; lng: number; zoom: number; countryCode?: string; countryName?: string };

function countryNameForCode(code: string) {
  try {
    return new Intl.DisplayNames([navigator.language || "en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
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
      markerRoot.innerHTML =
        '<span class="station-pulse-ring"></span><span class="station-pulse-ring two"></span><span class="station-pin" aria-hidden="true"><svg viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 40C16 40 29 25.6 29 14.8C29 7.73 23.18 2 16 2C8.82 2 3 7.73 3 14.8C3 25.6 16 40 16 40Z" fill="currentColor" stroke="rgba(255,255,255,.9)" stroke-width="2.2" /></svg></span><span class="station-pulse-dot"></span>';
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
    const clickCountry = (event: maplibregl.MapMouseEvent) => {
      const country = nearestCountryResult(event.lngLat.lat, event.lngLat.lng);
      if (country) onCountrySelectRef.current?.(country);
    };
    m.on("click", clickCountry);
    return () => {
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resize);
      m.off("click", clickCountry);
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
        <div ref={container} className="absolute inset-0 h-full w-full" />
        <MapMarkerController marker={marker} geo={geo} status={status} />
        <MapStyleController map={map} basemap={basemap} onResize={camera.resizeThenReapplyIntended} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_30%,rgba(7,17,31,.28)_64%,rgba(7,17,31,.68)),linear-gradient(180deg,rgba(2,6,23,.28),transparent_32%,rgba(2,6,23,.48))]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
        <div className="day-night-terminator pointer-events-none absolute inset-y-0 w-1/2 opacity-55" />
        <div className="cloud-layer pointer-events-none absolute inset-0 opacity-25" />
        <div className="pointer-events-none absolute left-1/2 top-[45%] z-10 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-radio/15 bg-radio/5 blur-sm shadow-[0_0_80px_rgba(88,225,132,.18)]" />

      </div>
    );
  }
  return (
    <div className="relative h-full min-h-[620px] w-full overflow-hidden bg-slate-950 shadow-2xl">
      <div ref={container} className="absolute inset-0 h-full w-full" />
      <MapMarkerController marker={marker} geo={geo} status={status} />
      <MapStyleController map={map} basemap={basemap} onResize={camera.resizeThenReapplyIntended} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_48%,rgba(7,17,31,.35)),linear-gradient(180deg,rgba(2,6,23,.35),transparent_30%,rgba(2,6,23,.54))]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40" />
      <div className="absolute right-6 top-6 z-30 opacity-95 xl:right-8 xl:top-8"><BasemapSwitcher value={basemap} onChange={setBasemap} compact /></div>
      <div className="pointer-events-none absolute left-6 top-6 z-20 rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 font-mono text-[10px] font-semibold text-emerald-300 shadow-lg backdrop-blur xl:left-8 xl:top-8">
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

const TELEPORT_HISTORY_KEY = "waveatlas.teleport.history.v1";
type TeleportHistory = { countries: string[]; continents: string[]; cities: string[]; languages: string[]; genres: string[]; tags: string[]; stationIds: string[] };
const emptyTeleportHistory = (): TeleportHistory => ({ countries: [], continents: [], cities: [], languages: [], genres: [], tags: [], stationIds: [] });
function readTeleportHistory(): TeleportHistory {
  if (typeof window === "undefined") return emptyTeleportHistory();
  try { return { ...emptyTeleportHistory(), ...JSON.parse(window.localStorage.getItem(TELEPORT_HISTORY_KEY) || "{}") }; } catch { return emptyTeleportHistory(); }
}
function rememberJourneyStop(station: Station) {
  rememberTeleport(station);
  persistArrival(station, stationContinent(station), window.localStorage);
}

function rememberTeleport(station: Station) {
  if (typeof window === "undefined") return;
  const history = readTeleportHistory();
  const keep = <T,>(items: T[]) => items.slice(-100);
  const next = {
    countries: keep([...history.countries, station.country_code]),
    continents: keep([...history.continents, stationContinent(station)]),
    cities: keep([...history.cities, stationRegion(station).toLowerCase()]),
    languages: keep([...history.languages, ...stationLanguages(station)]),
    genres: keep([...history.genres, getPrimaryGenre(station).toLowerCase()]),
    tags: keep([...history.tags, ...station.tags.map((tag) => tag.toLowerCase())]),
    stationIds: keep([...history.stationIds, station.station_uuid || station.id]),
  };
  try { window.localStorage.setItem(TELEPORT_HISTORY_KEY, JSON.stringify(next)); } catch { /* Teleport history is best-effort. */ }
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
    narration: `Tonight we’re going to ${city}. It is ${localTime}. The Earth mood is ${earthMood}. We’ll experience ${station.country} through ${station.name}.`,
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
      usePlayer.getState().setStation(destination);
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
    if (!current) setStation(station);
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
        <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-950/40 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2"><SaveStationButton station={station} /><ShareStationButton station={station} /></div>
    </aside>
  );
}

function MobileBrandBar({ viewportOffsetTop = 0 }: { viewportOffsetTop?: number }) {
  return (
    <div style={{ top: viewportOffsetTop }} className="fixed left-4 right-4 z-40 max-w-[calc(100%-2rem)] box-border pt-3">
      <div className="relative flex items-center justify-center rounded-[1.75rem] border border-white/10 bg-slate-950/80 px-4 py-3 text-center shadow-2xl backdrop-blur-xl">
        <div className="flex min-w-0 flex-col items-center justify-center gap-1.5">
          <div className="flex min-w-0 items-center justify-center gap-2">
            <Image
              src={WAVEATLAS_LOGO_PATH}
              alt="WaveAtlas logo"
              width={48}
              height={48}
              className="h-11 w-11 object-contain rounded-full"
            />
            <div className="min-w-0">
              <b className="block truncate font-display text-sm font-bold leading-none">{BRAND.name}</b>
              <p className="mt-0.5 truncate font-display text-[10px] font-semibold text-gold">
                Explore Humanity Through Sound™
              </p>
            </div>
          </div>
          <span className="inline-flex max-w-[90vw] items-center justify-center whitespace-nowrap rounded-full border border-gold/35 bg-gold/10 px-3 py-1.5 text-[11px] font-semibold leading-none text-gold">
            The Entire World. Live.
          </span>
        </div>
      </div>
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
  return <button onClick={() => onSelect(station)} className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-900 p-4 text-left shadow-lg transition active:scale-[0.99] hover:border-gold/50 hover:bg-slate-800"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-base font-medium text-white">{station.name}</b><p className="mt-1 text-xs font-medium text-slate-300">{location || "Global"} · {station.language || "Unknown language"}</p></div><span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-300"><span className={`mr-1 inline-block size-2 rounded-full ${health.dot}`} />{health.label}</span></div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">{station.codec || "Unknown codec"}</span><span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">{station.bitrate ? `${station.bitrate} kbps` : "Live stream"}</span><span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">{station.country_code}</span>{station.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">{tag}</span>)}</div></button>;
}
function GroupedSearchResults({ query, stations, onStationSelect, onCountrySelect, setQuery }: { query: string; stations: Station[]; onStationSelect: (station: Station) => void; onCountrySelect: (country: CountryResult) => void; setQuery: (q: string) => void }) {
  const [remoteStations, setRemoteStations] = useState<Station[]>([]);
  const [countries, setCountries] = useState<CountryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultMeta, setResultMeta] = useState<{ query: string; intent?: string; countryCode?: string; countryName?: string } | null>(null);
  const activeSearchRequestId = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      activeSearchRequestId.current += 1;
      window.setTimeout(() => { setRemoteStations([]); setCountries([]); setResultMeta(null); }, 0);
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
          fetch(`/api/stations/search?q=${encodeURIComponent(q)}&limit=50`, { signal: controller.signal }),
          fetch(`/api/countries/search?q=${encodeURIComponent(q)}`, { signal: controller.signal }),
        ]);
        if (requestId !== activeSearchRequestId.current) return;
        if (stationRes.ok) {
          const data = (await stationRes.json()) as { query?: string; intent?: string; countryCode?: string; countryName?: string; stations: Station[] };
          const currentQuery = query.trim().toLowerCase();
          if ((data.query ?? currentQuery) === currentQuery) {
            const scopedStations = data.intent === "country" && data.countryCode ? data.stations.filter((station) => station.country_code === data.countryCode) : data.stations;
            setResultMeta({ query: data.query ?? currentQuery, intent: data.intent, countryCode: data.countryCode, countryName: data.countryName });
            setRemoteStations(scopedStations);
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
  const stationResults = (remoteStations.length || countryIntentActive ? remoteStations : localMatches).slice(0, 50);
  const genres = Array.from(new Set(stations.flatMap((s) => s.tags).filter((tag) => tag.toLowerCase().includes(q)))).slice(0, 8);
  const languages = Array.from(new Set(stations.map((s) => s.language).filter((language) => language && language.toLowerCase().includes(q)))).slice(0, 8);
  if (query.trim().length < 2) return null;
  return <div className="rounded-3xl border border-white/15 bg-slate-950/98 p-3 shadow-2xl backdrop-blur-2xl"><div className="mb-3 flex items-center justify-between px-1"><p className="font-display text-xs font-semibold text-gold">{countryIntentActive && resultMeta?.countryName ? `Stations in ${resultMeta.countryName}` : "Destination results"}</p>{loading ? <span className="text-xs font-semibold text-sky">{countryIntentActive && resultMeta?.countryName ? `Acquiring ${resultMeta.countryName} signals…` : "Searching…"}</span> : null}</div><div className="grid gap-3 lg:grid-cols-[1.25fr_.75fr]"><div>{stationResults.length ? stationResults.map((station) => <SearchResultStationCard key={station.id} station={station} onSelect={onStationSelect} />) : <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm font-medium text-slate-300">{countryIntentActive && resultMeta?.countryName ? `No active stations found for ${resultMeta.countryName} yet. Try Load More, check another genre, or let Station Steward Agent refresh this region.` : "No active station found. Try country or genre search."}</p>}</div><div className="grid content-start gap-3"><SearchGroup title="Countries" items={countries.slice(0, 6).map((c) => ({ key: c.code, label: `${c.flag} ${c.name}`, meta: `${c.station_count.toLocaleString()} stations`, action: () => onCountrySelect(c) }))} /><SearchGroup title="Genres" items={genres.map((g) => ({ key: g, label: g, meta: "Search format", action: () => setQuery(g) }))} /><SearchGroup title="Languages" items={languages.map((l) => ({ key: l, label: l, meta: "Search language", action: () => setQuery(l) }))} /></div></div></div>;
}
function SearchGroup({ title, items }: { title: string; items: { key: string; label: string; meta: string; action: () => void }[] }) {
  return <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-lg"><p className="font-display text-xs font-semibold text-gold">{title}</p><div className="mt-3 space-y-2">{items.length ? items.map((item) => <button key={item.key} onClick={item.action} className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-slate-800 px-3 py-2 text-left text-slate-100 hover:border-sky/40"><span><b className="block text-sm">{item.label}</b><span className="text-xs text-slate-300">{item.meta}</span></span><MapPin className="size-4 text-gold" /></button>) : <p className="text-sm text-ivory/45">No matches yet.</p>}</div></div>;
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
    {candidate ? <div className="mt-2 flex items-center justify-between gap-3"><div className="min-w-0"><b className="block truncate text-sm">{candidate.station.name}</b><p className="truncate text-xs text-ivory/65">{candidate.station.city || candidate.station.state || candidate.station.country} · {candidate.signalStrength ?? candidate.station.health_score}% confidence</p></div><div className="flex shrink-0 gap-2"><button onClick={onNext} className="rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-ivory">Next</button><button onClick={onTune} className="rounded-full bg-radio px-3 py-2 text-xs font-medium text-midnight">Lock</button></div></div> : <p className="mt-2 text-sm text-ivory/70">No verified destination matched this map focus. Try another country or long-press for Wander.</p>}
  </motion.div>;
}

function SignalDial({ mapContext, selectedCountry, stations, current, mobile = false, compact = false, onStationResolved, onWander }: SignalDialProps & { onWander?: () => void }) {
  const [state, setState] = useState<"idle" | "teleporting" | "found" | "none">("idle");
  const [candidates, setCandidates] = useState<SignalCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const timer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const candidate = candidates[index] ?? null;
  const lockAnchor = useMemo(() => getCandidateLockAnchor(current, stations), [current, stations]);
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
    const anchor = getCandidateLockAnchor(usePlayer.getState().current ?? current, stations);
    setState("teleporting");
    let next = fallbackCandidates(anchor, wander);
    if (!selectedCountry) {
      try {
        const params = new URLSearchParams({ global: "true", limit: "18", anchor: JSON.stringify(anchor), recent: JSON.stringify(readTeleportHistory()) });
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
  }, [current, fallbackCandidates, selectedCountry, stations]);
  const tune = () => {
    if (!candidate) return;
    rememberTeleport(candidate.station);
    usePlayer.getState().setStation(candidate.station);
    onStationResolved?.(candidate.station);
    setState("idle");
  };
  return <>
    <motion.div animate={{ scale: compact ? 0.65 : 1 }} transition={{ type: "spring", damping: 24, stiffness: 260 }} className={`${mobile ? "fixed bottom-[172px] right-5 z-50 origin-bottom-right" : "absolute bottom-5 right-5 z-40 origin-bottom-right"}`}>
      <button type="button" aria-label="Take me somewhere unexpected." title="Take me somewhere unexpected." onClick={() => { if (longPressTriggered.current) { longPressTriggered.current = false; return; } void teleport(false); }} onContextMenu={(e) => { e.preventDefault(); onWander?.(); }} onPointerDown={() => { if (timer.current) window.clearTimeout(timer.current); longPressTriggered.current = false; timer.current = window.setTimeout(() => { longPressTriggered.current = true; onWander?.(); }, 650); }} onPointerUp={() => { if (timer.current) window.clearTimeout(timer.current); }} className="group relative grid size-20 place-items-center rounded-full border border-white/15 bg-slate-950/80 text-white shadow-[0_24px_80px_rgba(0,0,0,.45)] backdrop-blur-xl transition duration-300 hover:border-radio/40 hover:bg-slate-950/90">
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_48%,rgba(88,225,132,.18),transparent_46%)]" />
        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 8, ease: "linear" }} className="absolute inset-1 rounded-full bg-[conic-gradient(from_90deg,rgba(88,225,132,.95),rgba(88,225,132,.25),rgba(255,255,255,.08),rgba(88,225,132,.95))] opacity-80" />
        <span className="absolute inset-[6px] rounded-full bg-slate-950/95 shadow-inner" />
        <Plane className="relative size-7 text-radio drop-shadow-[0_0_14px_rgba(88,225,132,.75)] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </button>
      <AnimatePresence>{!compact ? <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="mt-3 flex flex-col items-center gap-2 font-sans">
        <span className="text-xs font-medium tracking-normal text-ivory/75">Teleport</span>
        <div className="flex justify-center gap-2 text-xs font-medium text-ivory/75">
          <button type="button" onClick={() => void teleport(false)} className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 transition hover:border-radio/30 hover:bg-radio/10 hover:text-white">✈ Teleport</button>
          <button type="button" onClick={() => setIndex((n) => candidates.length ? (n + 1) % candidates.length : 0)} className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 transition hover:border-radio/30 hover:bg-radio/10 hover:text-white">⟳ Next</button>
          <button type="button" onClick={tune} className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 transition hover:border-radio/30 hover:bg-radio/10 hover:text-white">📍 Lock</button>
        </div>
      </motion.div> : null}</AnimatePresence>
    </motion.div>
    <AnimatePresence><SignalCandidatePreview candidate={candidate} state={state} anchor={lockAnchor} onTune={tune} onNext={() => setIndex((n) => candidates.length ? (n + 1) % candidates.length : 0)} /></AnimatePresence>
  </>;
}

function MobileSearchPill({ onOpen, viewportOffsetTop }: { onOpen: () => void; viewportOffsetTop: number }) {
  return (
    <button
      type="button"
      style={{ top: viewportOffsetTop + 76 }}
      onClick={onOpen}
      className="fixed left-4 right-4 z-40 box-border flex min-h-12 w-auto max-w-full items-center gap-3 rounded-full border border-white/10 bg-slate-950/90 px-4 text-left shadow-2xl backdrop-blur-xl"
      aria-label="Open station search"
    >
      <Search className="size-4 shrink-0 text-sky" />
      <span className="min-w-0 flex-1 truncate text-sm text-ivory/55">Search country, city, destination...</span>
    </button>
  );
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
          className="fixed inset-0 z-[9999] flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-slate-950/98 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+14px)] text-white backdrop-blur-2xl md:hidden"
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
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
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

function MobileNowPlayingMini({ station, onOpen }: { station: Station; onOpen: () => void }) {
  const { playing, status, toggle, setStation } = usePlayer();
  const play = () => { if (!usePlayer.getState().current) setStation(station); else toggle(); };
  return <div onClick={onOpen} className="fixed bottom-[86px] left-4 right-4 z-40 min-h-[76px] rounded-3xl border border-white/10 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-xl">
    <div className="flex h-full items-center gap-3"><button onClick={(e) => { e.stopPropagation(); play(); }} className="grid size-11 shrink-0 place-items-center rounded-full bg-radio text-midnight">{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button><div className="min-w-0 flex-1"><p className="truncate font-display text-sm font-bold">{station.city || station.state || station.country} · {station.country}</p><p className="truncate text-xs text-ivory/60">{getPrimaryGenre(station)} · {station.name} · {status}</p></div><Volume2 className="size-4 text-ivory/60" /></div>
  </div>;
}

function MobileBasemapSheet({ open, value, onChange, onClose }: { open: boolean; value: BasemapKey; onChange: (value: BasemapKey) => void; onClose: () => void }) {
  return <AnimatePresence>{open ? <motion.section initial={{ y: 280, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 280, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-50 rounded-[2rem] border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
    <button onClick={onClose} className="mx-auto mb-4 block h-1.5 w-14 rounded-full bg-white/30" aria-label="Close basemap cockpit" />
    <p className="mb-3 font-display text-xs font-semibold text-gold">Basemap Cockpit</p>
    <div className="grid grid-cols-2 gap-2">{(Object.keys(basemapStyles) as BasemapKey[]).map((key) => <button key={key} onClick={() => { onChange(key); onClose(); }} className={`rounded-2xl border px-3 py-3 text-left text-sm font-medium ${value === key ? "border-gold bg-gold text-midnight" : "border-white/10 bg-white/5 text-ivory"}`}><span className="block">{basemapStyles[key].label}</span><span className="mt-1 block text-[11px] font-medium opacity-70">{basemapStyles[key].description}</span></button>)}</div>
  </motion.section> : null}</AnimatePresence>;
}

function MobileWanderSheet({ open, stations, current, onTravel, onClose }: { open: boolean; stations: Station[]; current: Station; onTravel: (intent: string) => void; onClose: () => void }) {
  const options = ["Surprise Me", "Unvisited Country", "Unvisited Continent", "Somewhere Waking Up", "Somewhere Falling Asleep", "Somewhere Rainy", "Somewhere Spiritual", "Somewhere Busy", "Somewhere Peaceful", "Global Shuffle"];
  const travel = (option: string) => {
    const intent = option === "Surprise Me" ? "Take me somewhere surprising" : option === "Global Shuffle" ? "Tonight we are going global" : option;
    fetch(`/api/stations/nearby?global=true&limit=18`).then(async (res) => {
      const data = res.ok ? ((await res.json()) as { candidates?: SignalCandidate[] }) : { candidates: [] };
      usePlayer.getState().setStation(chooseWonderStation([...(data.candidates?.map((item) => item.station) ?? []), ...stations], current, intent));
    }).catch(() => usePlayer.getState().setStation(chooseWonderStation(stations, current, intent)));
    onTravel(intent);
    onClose();
  };
  return <AnimatePresence>{open ? <motion.section initial={{ y: 360, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 360, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-50 rounded-[2rem] border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
    <button onClick={onClose} className="mx-auto mb-4 block h-1.5 w-14 rounded-full bg-white/30" aria-label="Close Wander" />
    <p className="mb-1 font-display text-xs font-semibold text-gold">Wander</p><h2 className="mb-3 font-display text-xl font-bold">Tonight we are going somewhere.</h2>
    <div className="grid grid-cols-2 gap-2">{options.map((option) => <button key={option} onClick={() => travel(option)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm font-medium text-ivory active:scale-[.98]">{option}</button>)}</div>
  </motion.section> : null}</AnimatePresence>;
}

function PresenceToast({ station, intent, visible }: { station: Station; intent: string; visible: boolean }) {
  const experience = useMemo(() => getWandererExperience(station, intent), [station, intent]);
  return <AnimatePresence>{visible ? <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ opacity: { duration: 0.28 }, y: { type: "spring", damping: 26, stiffness: 260 } }} className="fixed bottom-[260px] left-4 right-4 z-[55] rounded-3xl border border-gold/20 bg-slate-950/92 p-4 text-sm leading-6 text-ivory shadow-2xl backdrop-blur-xl">{experience.narration}</motion.div> : null}</AnimatePresence>;
}

function MobileMapControls({ onOpenBasemap }: { onRecenter: () => void; onOpenBasemap: () => void; onOpenSearch: () => void; onOpenFavorites: () => void; onTeleport: () => void }) {
  return <button onClick={onOpenBasemap} aria-label="Basemap" className="fixed right-4 top-[146px] z-40 grid size-10 place-items-center rounded-full border border-white/10 bg-slate-950/70 text-ivory shadow-xl backdrop-blur-xl hover:border-gold/40"><Layers className="size-4" /></button>;
}

function MobileStationSheet({ station, stations, setQuery, open, setOpen }: { station: Station; stations: Station[]; setQuery: (q: string) => void; open: boolean; setOpen: (v: boolean) => void }) {
  return <motion.section drag="y" dragConstraints={{ top: 0, bottom: 0 }} onDragEnd={(_, info) => setOpen(info.offset.y < -40 ? true : info.offset.y > 40 ? false : open)} initial={{ y: 680 }} animate={{ y: open ? 64 : 680 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-white/10 bg-slate-950/95 px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-3 shadow-2xl backdrop-blur-xl">
    <button onClick={() => setOpen(!open)} className="mx-auto block h-1.5 w-14 rounded-full bg-white/30" aria-label="Toggle Destination Intelligence" />
    <StationIntelligencePanel station={station} stations={stations} setQuery={setQuery} />
  </motion.section>;
}

function MobileCommandDock({ mode, setMode, onTeleport, onToggleWanderer, wandererActive }: { mode: string; setMode: (m: string) => void; onTeleport: () => void; onToggleWanderer: () => void; wandererActive: boolean }) {
  return <nav className="pointer-events-none fixed bottom-0 left-4 right-4 z-[70] max-w-full pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2"><div className="pointer-events-auto grid grid-cols-7 gap-1 rounded-[1.75rem] border border-white/10 bg-slate-950/92 p-1.5 shadow-2xl backdrop-blur-xl">{[[Heart,"Favorites"],[Globe2,"Explore"],[Signal,"Add Signal"],[Plane,"Teleport"],[Compass,wandererActive ? "Exit Wanderer" : "Wanderer"],[Radio,"History"],[Layers,"Settings"]].map(([Icon,label]) => { const I = Icon as typeof Compass; const value = label as string; const isTeleport = value === "Teleport"; const isWanderer = value === "Wanderer" || value === "Exit Wanderer"; return <button key={value} type="button" onClick={() => { if (isTeleport) onTeleport(); else if (isWanderer) onToggleWanderer(); setMode(isWanderer ? "Wanderer" : value); }} className={`pointer-events-auto min-h-14 rounded-2xl px-1 py-2 text-[9px] font-medium leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${mode === value || (isWanderer && wandererActive) ? "bg-radio text-midnight" : "text-ivory/70 hover:bg-white/10"}`} aria-label={isTeleport ? "Teleport to one new destination" : isWanderer ? (wandererActive ? "Exit Wanderer" : "Start continuous Wanderer Mode") : value}><I className="mx-auto mb-1 size-4" />{isTeleport ? "✈ Teleport" : value}</button>; })}</div></nav>;
}

function MobileAtlasShell({ stations, current, query, setQuery, onCountrySelect, wandererIntent, setWandererIntent, onQueryComplete }: { stations: Station[]; current: Station; query: string; setQuery: (q: string) => void; onCountrySelect: (country: CountryResult) => void; wandererIntent: string; setWandererIntent: (intent: string) => void; onQueryComplete: () => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState("Atlas");
  const [resetSignal, setResetSignal] = useState(0);
  const [basemap, setBasemap] = useState<BasemapKey>(() => getInitialBasemap(true));
  const [basemapOpen, setBasemapOpen] = useState(false);
  const [wanderOpen, setWanderOpen] = useState(false);
  const [wandererActive, setWandererActive] = useState(false);
  const wandererTimer = useRef<number | null>(null);
  const [presenceVisible, setPresenceVisible] = useState(false);
  const [mapContext, setMapContext] = useState<MapTeleportContext | null>(null);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const presenceTimer = useRef<number | null>(null);
  const handleTravel = useCallback((intent: string) => {
    setWandererIntent(intent);
    setPresenceVisible(true);
    if (presenceTimer.current) window.clearTimeout(presenceTimer.current);
    presenceTimer.current = window.setTimeout(() => setPresenceVisible(false), 6000);
  }, [setWandererIntent]);
  const makeWandererHop = useCallback(() => {
    const intent = "Wanderer Mode";
    setWandererIntent(intent);
    void resolveGlobalJourneyDestination(stations, usePlayer.getState().current ?? current, intent).then((destination) => {
      rememberJourneyStop(destination);
      usePlayer.getState().setStation(destination);
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
  return <section className="fixed inset-0 h-[100dvh] w-full max-w-full overflow-hidden bg-transparent text-white md:hidden">
    <WaveAtlasMap station={current} mobile resetSignal={resetSignal} basemap={basemap} onBasemapChange={setBasemap} onMapContextChange={setMapContext} onCountrySelect={onCountrySelect} searchActive={false} keyboardOpen={searchOverlayOpen && visualViewport.keyboardOpen} />
    <MobileBrandBar viewportOffsetTop={visualViewport.viewportOffsetTop} />
    {mode !== "Dial" ? <MobileSearchPill viewportOffsetTop={visualViewport.viewportOffsetTop} onOpen={() => setSearchOverlayOpen(true)} /> : null}
    <MobileSearchCommandOverlay open={searchOverlayOpen} query={query} setQuery={setQuery} stations={stations} onClose={() => { setSearchOverlayOpen(false); setQuery(""); }} onCountrySelect={(country) => { setSearchOverlayOpen(false); window.setTimeout(() => { onCountrySelect(country); onQueryComplete(); }, 250); }} onStationSelect={(station) => { setSearchOverlayOpen(false); setQuery(""); window.setTimeout(() => { onQueryComplete(); usePlayer.getState().setStation(station); }, 250); }} />
    <MobileMapControls onRecenter={() => usePlayer.getState().setStation(current)} onOpenBasemap={() => setBasemapOpen(true)} onOpenSearch={() => setSearchOverlayOpen(true)} onOpenFavorites={() => { setQuery("favorites"); setSearchOverlayOpen(true); }} onTeleport={() => usePlayer.getState().setStation(stations[(stations.findIndex((s) => s.id === current.id) + 1) % stations.length])} />
    <PresenceToast station={current} intent={wandererIntent} visible={presenceVisible} />
    {wandererActive ? <button onClick={() => setWandererActive(false)} className="fixed bottom-[176px] left-4 z-[56] rounded-full border border-radio/30 bg-slate-950/90 px-4 py-2 text-xs font-medium text-radio shadow-xl backdrop-blur-xl">Wanderer Mode · Exit Wanderer</button> : null}
    <MobileBasemapSheet open={basemapOpen} value={basemap} onChange={setBasemap} onClose={() => setBasemapOpen(false)} />
    <MobileWanderSheet open={wanderOpen} stations={stations} current={current} onTravel={handleTravel} onClose={() => setWanderOpen(false)} />
    {mode === "Add Signal" ? <div className="fixed inset-x-4 bottom-[180px] z-[55] max-h-[58dvh] overflow-y-auto rounded-[2rem] shadow-2xl"><AddYourSignalPanel compact /></div> : null}
    <MobileNowPlayingMini station={current} onOpen={() => setSheetOpen(true)} />
    <MobileStationSheet station={current} stations={stations} setQuery={setQuery} open={sheetOpen || mode === "Library"} setOpen={setSheetOpen} />
    <MobileCommandDock mode={mode} wandererActive={wandererActive} onToggleWanderer={() => setWandererActive((active) => !active)} onTeleport={() => { setWandererActive(false); const destination = chooseWonderStation(stations, current, "Take me somewhere surprising"); rememberTeleport(destination); usePlayer.getState().setStation(destination); handleTravel("Take me somewhere surprising"); }} setMode={(m) => { setMode(m); if (m === "Settings") setBasemapOpen(true); else if (m === "Passport" || m === "History" || m === "Favorites") setSheetOpen(true); else setSheetOpen(false); }} />
  </section>;
}


type SignalSubmissionResponse = {
  message: string;
  review?: { status: string; quality_score: number; recommendation: string };
  error?: string;
};

function AddYourSignalPanel({ compact = false }: { compact?: boolean }) {
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
      return;
    }
    event.currentTarget.reset();
    setStatus("success");
    setMessage(data.message || "Your signal has been received. Once verified, it may join the WaveAtlas™ global map.");
  }

  return <section className={`rounded-[2rem] border border-radio/20 bg-radio/10 ${compact ? "p-4" : "p-5"}`}>
    <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-radio">Add Your Signal</p>
    <h2 className={`${compact ? "mt-2 text-2xl" : "mt-3 text-[32px]"} font-display font-bold leading-tight text-white`}>Help us map the sound of Earth.</h2>
    <p className="mt-2 text-sm leading-6 text-ivory/70">Have a favorite radio station anywhere in the world? Send us the working stream URL and help WaveAtlas™ grow.</p>
    <p className="mt-2 text-xs font-semibold text-gold">If it is broadcasting on Earth, it belongs here.</p>
    <form onSubmit={submit} className="mt-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([name, label, placeholder, required]) => <label key={name} className="text-xs font-medium text-ivory/65">
          {label}{required ? <span className="text-radio"> *</span> : null}
          <input name={name} required={required} placeholder={placeholder} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-ivory/30 focus:border-radio/60" />
        </label>)}
      </div>
      <label className="text-xs font-medium text-ivory/65">Notes (optional)
        <textarea name="notes_optional" rows={3} placeholder="Tell the review agent anything useful about this stream." className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-ivory/30 focus:border-radio/60" />
      </label>
      <button disabled={status === "submitting"} className="rounded-full bg-radio px-5 py-3 text-sm font-semibold text-midnight transition hover:bg-gold disabled:cursor-wait disabled:opacity-70"><Signal className="mr-2 inline size-4" />{status === "submitting" ? "Reviewing signal…" : "Submit Signal for Review"}</button>
      {message ? <p className={`rounded-2xl border px-3 py-2 text-sm ${status === "error" ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-radio/30 bg-radio/10 text-radio"}`}>{message}</p> : null}
      <p className="text-[11px] leading-5 text-ivory/45">Signal Review Agent validates, enriches, deduplicates, and creates an admin review record. It never auto-publishes to production.</p>
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
    <button onClick={() => usePlayer.getState().setStation(daily)} className="mt-4 rounded-full bg-radio px-5 py-3 text-sm font-medium text-midnight"><Plane className="mr-2 inline size-4" />Board Flight</button>
  </section>;
}

export default function WaveAtlasApp({ stations }: { stations: Station[] }) {
  const [stationPool, setStationPool] = useState(stations);
  const [arrival, setArrival] = useState<ArrivalDestination | undefined>();
  const [arrivalVisible, setArrivalVisible] = useState(false);
  const [splashVisible, setSplashVisible] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem(SIGNAL_SPLASH_KEY) !== "true");
  const [splashComplete, setSplashComplete] = useState(() => typeof window === "undefined" || window.sessionStorage.getItem(SIGNAL_SPLASH_KEY) === "true");
  const [startupPreview] = useState(() => stations[Math.floor(Math.random() * Math.max(1, stations.length))]);
  const current = usePlayer((s) => s.current) ?? arrival?.station ?? startupPreview ?? stationPool[0] ?? stations[0];
  const [query, setQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<CountryResult | null>(null);
  const [activeTag, setActiveTag] = useState("");
  const [offset, setOffset] = useState(stations.length);
  const [loadingCountry, setLoadingCountry] = useState(false);
  const [desktopResetSignal, setDesktopResetSignal] = useState(0);
  const [deepLinkStatus, setDeepLinkStatus] = useState<"idle" | "loading" | "unavailable">("idle");
  const [wandererIntent, setWandererIntent] = useState("Take me somewhere surprising");
  const [desktopMode, setDesktopMode] = useState("Teleport");
  const [wandererActive, setWandererActive] = useState(false);
  const wandererTimer = useRef<number | null>(null);
  const [desktopMapContext, setDesktopMapContext] = useState<MapTeleportContext | null>(null);
  const [deepLinkUuid] = useState(() => {
    if (typeof window === "undefined") return "";
    const value = new URLSearchParams(window.location.search).get("station")?.trim() || "";
    return /^[a-z0-9-]{8,80}$/i.test(value) ? value : "";
  });
  const initialStationPoolRef = useRef(stationPool);

  useEffect(() => {
    if (!current || typeof window === "undefined") return;
    persistArrival(current, stationContinent(current), window.localStorage);
  }, [current]);

  useEffect(() => {
    if (!splashComplete || deepLinkUuid || arrival || !stationPool.length) return;
    const destination = createArrivalDestination(stationPool, window.localStorage);
    if (!destination) return;
    usePlayer.getState().prepareStation(destination.station);
    let timer: number | undefined;
    window.queueMicrotask(() => {
      setArrival(destination);
      setArrivalVisible(true);
      timer = window.setTimeout(() => setArrivalVisible(false), 3000);
    });
    return () => { if (timer) window.clearTimeout(timer); };
  }, [arrival, deepLinkUuid, splashComplete, stationPool]);

  useEffect(() => {
    const stationUuid = deepLinkUuid;
    if (!stationUuid) return;
    const existing = initialStationPoolRef.current.find((station) => station.station_uuid === stationUuid);
    if (existing) {
      usePlayer.getState().setStation(existing);
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
        usePlayer.getState().setStation(station);
        setDeepLinkStatus("idle");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const fallback = initialStationPoolRef.current[0];
        if (fallback) usePlayer.getState().prepareStation(fallback);
        setDeepLinkStatus("unavailable");
      });
    return () => controller.abort();
  }, [deepLinkUuid]);

  const loadCountryStations = async (country: CountryResult, nextOffset = 0, tag = activeTag) => {
    setLoadingCountry(true);
    if (!nextOffset) setStationPool([]);
    const params = new URLSearchParams({ country: country.name, countryCode: country.code, limit: "50", offset: String(nextOffset) });
    if (tag) params.set("tag", tag);
    const res = await fetch(`/api/stations/by-country?${params}`);
    if (res.ok) {
      const data = (await res.json()) as { stations: Station[] };
      setStationPool((prev) => nextOffset ? [...prev, ...data.stations] : data.stations);
      setOffset(nextOffset + data.stations.length);
      if (!nextOffset && data.stations[0]) usePlayer.getState().setStation(data.stations[0]);
    }
    setLoadingCountry(false);
  };
  const centerAppAfterQuery = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('input[placeholder="Search country, city, genre, or language"]')?.blur();
    });
  }, []);

  const selectCountry = (country: CountryResult) => {
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
      usePlayer.getState().setStation(destination);
    });
  }, [current, stationPool]);
  useEffect(() => {
    if (!wandererActive) { if (wandererTimer.current) window.clearTimeout(wandererTimer.current); return; }
    wandererTimer.current = window.setTimeout(runWandererHop, 0);
    const schedule = () => { wandererTimer.current = window.setTimeout(() => { runWandererHop(); schedule(); }, nextWandererIntervalMs()); };
    schedule();
    return () => { if (wandererTimer.current) window.clearTimeout(wandererTimer.current); };
  }, [runWandererHop, wandererActive]);

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
      <AudioEngine stations={stationPool} />
      {splashVisible ? <SignalInitializationSequence onComplete={() => { setSplashVisible(false); setSplashComplete(true); }} /> : null}
      <AnimatePresence>{arrivalVisible ? <ArrivalCard arrival={arrival} onEnter={() => setArrivalVisible(false)} /> : null}</AnimatePresence>
      {deepLinkStatus !== "idle" ? <div className="fixed left-1/2 top-4 z-[80] w-[min(92vw,34rem)] -translate-x-1/2 rounded-3xl border border-white/10 bg-slate-950/90 p-4 text-sm text-ivory shadow-2xl backdrop-blur-xl"><b className="block text-base text-white">{deepLinkStatus === "loading" ? "Resolving shared station…" : "Station unavailable or moved"}</b><p className="mt-1 text-ivory/70">{deepLinkStatus === "loading" ? `Looking up exact station UUID ${deepLinkUuid}.` : `No station matched UUID ${deepLinkUuid}. Opening the main player with a live fallback instead.`}</p></div> : null}
      <MobileAtlasShell stations={stationPool} current={current} query={query} setQuery={setQuery} onCountrySelect={selectCountry} wandererIntent={wandererIntent} setWandererIntent={setWandererIntent} onQueryComplete={centerAppAfterQuery} />
    <main className="hidden h-screen min-h-[720px] w-full overflow-hidden bg-slate-950 md:block">
      <nav className="pointer-events-none fixed left-6 right-6 top-6 z-40 grid grid-cols-[minmax(240px,1fr)_auto_minmax(240px,1fr)] items-center overflow-visible rounded-[1.75rem] border border-white/10 bg-slate-950/60 px-5 py-4 shadow-2xl backdrop-blur-xl xl:left-8 xl:right-8">
        <div className="min-w-0" aria-hidden="true" />
        <div className="flex min-w-0 items-center justify-center gap-4 text-center">
          <Image
            src={WAVEATLAS_LOGO_PATH}
            alt="WaveAtlas logo"
            width={52}
            height={52}
            className="h-14 w-14 object-contain rounded-full"
          />
          <div className="min-w-0">
            <b className="block font-display text-2xl leading-none tracking-tight xl:text-3xl">{BRAND.name}</b>
            <p className="mt-1 font-display text-xs font-semibold uppercase tracking-[0.24em] text-gold/90">
              Explore Humanity Through Sound™
            </p>
          </div>
        </div>
        <div className="flex min-w-0 justify-end overflow-visible">
          <p className="hidden whitespace-nowrap rounded-full border border-gold/20 bg-gold/10 px-[22px] py-2.5 text-[13px] font-semibold normal-case tracking-normal text-gold/90 lg:block">The Entire World. Live.</p>
        </div>
      </nav>
      <div className="absolute inset-0 z-0">
        <div className="hidden"><DailyFlightPanel stations={stationPool} /></div>
        {wandererActive ? <button onClick={() => setWandererActive(false)} className="absolute left-6 top-28 z-40 rounded-[2rem] border border-radio/30 bg-slate-950/75 p-4 text-left font-medium text-radio shadow-2xl backdrop-blur-xl xl:left-8">Wanderer Mode · continuous global exploration active · Exit Wanderer</button> : null}
        <div id="atlas-map" className="h-full w-full scroll-mt-0">
          <WaveAtlasMap station={current} resetSignal={desktopResetSignal} onMapContextChange={setDesktopMapContext} onCountrySelect={selectCountry} searchActive={query.trim().length > 0} />
        </div>
      </div>
      <section className="fixed left-6 top-28 z-30 w-[min(34rem,calc(100vw-3rem))] xl:left-8 xl:w-[38rem]">
        <div className="glass max-h-[calc(100vh-14rem)] overflow-y-auto rounded-[2rem] p-5 shadow-2xl">
          <div className="flex gap-3">
            <Search className="text-sky" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country, city, genre, or language"
              className="w-full bg-transparent outline-none placeholder:text-ivory/40"
            />
          </div>
          {query.trim() ? <CountryAutocomplete query={query} onSelect={selectCountry} /> : null}
          {desktopMode === "Add Signal" ? <div className="mt-5"><AddYourSignalPanel /></div> : null}
          {query.trim() ? <GroupedSearchResults query={query} stations={stationPool} onStationSelect={(station) => { usePlayer.getState().setStation(station); setStationPool((prev) => prev.some((s) => s.id === station.id) ? prev : [station, ...prev]); setSelectedCountry(null); setQuery(""); centerAppAfterQuery(); }} onCountrySelect={selectCountry} setQuery={setQuery} /> : null}
          {selectedCountry ? (
            <div className="mt-4 rounded-3xl border border-gold/20 bg-gold/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{selectedCountry.flag} {selectedCountry.name} · {stationPool.length.toLocaleString()} loaded of {selectedCountry.station_count.toLocaleString()} known stations</p>
                {loadingCountry ? <span className="text-sm text-gold">Acquiring {selectedCountry.name} signals…</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["", "news", "music", "talk", "gospel", "sports", "local"].map((tag) => (
                  <button key={tag || "all"} onClick={() => selectTag(tag)} className={`rounded-full px-4 py-2 text-sm font-medium ${activeTag === tag ? "bg-radio text-midnight" : "border border-white/10 text-ivory/70"}`}>{tag || "All"}</button>
                ))}
              </div>
            </div>
          ) : null}
          {desktopMode !== "Atlas" || query.trim() ? <div className="mt-5 flex flex-wrap gap-2">
            {[
              "Nigeria",
              "Dubai",
              "France",
              "Afrobeat",
              "Amapiano",
              "Jazz",
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => setQuery(chip)}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/70 hover:border-gold/60"
              >
                <Sparkles className="mr-1 inline size-3" />
                {chip}
              </button>
            ))}
          </div> : null}
          {desktopMode !== "Atlas" || query.trim() || selectedCountry ? <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((s) => (
              <button
                key={s.id}
                onClick={() => { usePlayer.getState().setStation(s); setQuery(""); centerAppAfterQuery(); }}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:border-gold/50"
              >
                <b>{s.name}</b>
                <p className="mt-1 text-sm text-ivory/60">
                  {s.country} · {s.tags.slice(0, 3).join(", ") || "live radio"}
                </p>
              </button>
            ))}
          </div> : null}
          {selectedCountry && !visible.length && !loadingCountry ? <p className="mt-5 rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm font-medium text-slate-300">No active stations found for {selectedCountry.name} yet. Try Load More, check another genre, or let Station Steward Agent refresh this region.</p> : null}
          {selectedCountry ? <button disabled={loadingCountry} onClick={() => loadCountryStations(selectedCountry, offset)} className="mt-5 w-full rounded-full bg-radio px-5 py-3 font-medium text-midnight disabled:opacity-50">{loadingCountry ? `Acquiring ${selectedCountry.name} signals…` : "Load More stations"}</button> : null}
        </div>
      </section>
      <div className="fixed inset-x-6 bottom-6 z-[70] mx-auto grid max-w-6xl pointer-events-auto grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[2rem] border border-white/15 bg-midnight/90 p-2 shadow-glow backdrop-blur-xl xl:bottom-8">
        <div className="flex min-w-0 items-center gap-3 px-3">
          <button
            onClick={() => {
              const player = usePlayer.getState();
              if (!player.current) player.setStation(current);
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
          {[[Heart,"Favorites"],[Globe2,"Explore"],[Signal,"Add Signal"],[Plane,"Teleport"],[Compass,wandererActive ? "Exit Wanderer" : "Wanderer"],[Radio,"History"],[Layers,"Settings"]].map(([Icon,label]) => { const I = Icon as typeof Compass; return <button key={label as string} type="button" onClick={() => { const value = label as string; if (value === "Teleport") { setWandererActive(false); setDesktopMode(value); const destination = chooseWonderStation(stationPool, current, "Take me somewhere surprising"); rememberTeleport(destination); usePlayer.getState().setStation(destination); } else if (value === "Wanderer" || value === "Exit Wanderer") { setDesktopMode("Wanderer"); setWandererActive((active) => !active); } else setDesktopMode(value); }} className={`pointer-events-auto rounded-full px-3 py-2 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${(desktopMode === label || ((label === "Wanderer" || label === "Exit Wanderer") && wandererActive)) ? "bg-radio text-midnight" : "text-ivory/70 hover:bg-white/10"}`} aria-label={`${label as string} command`}><I className="mx-auto mb-0.5 size-4" />{label as string}</button>; })}
        </nav>
      </div>
    </main>
    </>
  );
}
