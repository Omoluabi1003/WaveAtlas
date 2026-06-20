"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import {
  Check,
  Compass,
  Copy,
  Gauge,
  Globe2,
  Heart,
  Languages,
  MapPin,
  Pause,
  Play,
  Radio,
  ScanLine,
  Search,
  Share2,
  Signal,
  Trophy,
  Layers,
  Info,
  SkipForward,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { resolveStationGeo, type ResolvedStationGeo } from "@/lib/geotruth-resolver";
import type { Station } from "@/lib/stations";

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

const countryFallbacks: Record<string, { lat: number; lng: number; tone: GeoPoint["tone"] }> = {
  NG: { lat: 9.082, lng: 8.6753, tone: "green-gold" }, AE: { lat: 23.4241, lng: 53.8478, tone: "blue-gold" }, FR: { lat: 46.2276, lng: 2.2137, tone: "radio-gold" }, GB: { lat: 55.3781, lng: -3.436, tone: "radio-gold" }, US: { lat: 39.8283, lng: -98.5795, tone: "radio-gold" }, BR: { lat: -14.235, lng: -51.9253, tone: "radio-gold" }, ZA: { lat: -30.5595, lng: 22.9375, tone: "green-gold" }, GH: { lat: 7.9465, lng: -1.0232, tone: "green-gold" }, JP: { lat: 36.2048, lng: 138.2529, tone: "radio-gold" }, CN: { lat: 35.8617, lng: 104.1954, tone: "radio-gold" }, IN: { lat: 20.5937, lng: 78.9629, tone: "radio-gold" }, AU: { lat: -25.2744, lng: 133.7751, tone: "radio-gold" }, NZ: { lat: -40.9006, lng: 174.886, tone: "radio-gold" }, SG: { lat: 1.3521, lng: 103.8198, tone: "blue-gold" },
};

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

const LISTENER_HOME = { lat: 28.5383, lng: -81.3792, label: "Florida, USA" };
const PASSPORT_KEY = "waveatlas:signal-passport";
type PassportEntry = { country: string; city: string; station: string; date: string; duration: number };
function distanceKm(a: { lat: number; lng: number }, b: { lat: number | null; lng: number | null }) { if (b.lat === null || b.lng === null) return 0; const r = 6371; const dLat = ((b.lat - a.lat) * Math.PI) / 180; const dLng = ((b.lng - a.lng) * Math.PI) / 180; const lat1 = (a.lat * Math.PI) / 180; const lat2 = (b.lat * Math.PI) / 180; const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2; return Math.round(2 * r * Math.asin(Math.sqrt(h))); }
function localTimeFor(lng: number | null) { if (lng === null) return "Unknown local time"; const offset = Math.round(lng / 15); return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.now() + offset * 3600_000)); }
function estimatedTemperature(geo: GeoPoint) { return geo.lat === null || geo.lng === null ? 72 : Math.round(72 - Math.abs(geo.lat) * 0.28 + ((geo.lng + 180) % 11)); }
function readPassport(): PassportEntry[] { if (typeof window === "undefined") return []; try { const parsed = JSON.parse(window.localStorage.getItem(PASSPORT_KEY) || "[]") as unknown; return Array.isArray(parsed) ? parsed.filter((e): e is PassportEntry => typeof e === "object" && !!e && "country" in e) : []; } catch { return []; } }
function passportBadges(entries: PassportEntry[]) { const countries = new Set(entries.map((e) => e.country)); return [["Explorer", countries.size >= 1], ["Continental Traveler", countries.size >= 3], ["Global Citizen", countries.size >= 6], ["Signal Navigator", entries.reduce((s, e) => s + e.duration, 0) >= 30], ["Master Cartographer", countries.size >= 12]] as const; }
function useSignalPassport(station: Station) {
  const [entries, setEntries] = useState<PassportEntry[]>(() => readPassport());
  useEffect(() => {
    const started = Date.now();
    return () => {
      const duration = Math.max(1, Math.round((Date.now() - started) / 1000));
      const next = [{ country: station.country, city: station.state || station.country, station: station.name, date: new Date().toISOString(), duration }, ...readPassport()].slice(0, 100);
      window.localStorage.setItem(PASSPORT_KEY, JSON.stringify(next));
      setEntries(next);
    };
  }, [station.id, station.country, station.name, station.state]);
  return entries;
}

function getPrimaryGenre(station: Station) {
  return station.tags.find(Boolean) || "Mixed Radio";
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
      <p className="mt-3 text-[10px] uppercase tracking-[0.25em] text-slate-400">
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
    <span className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold ${health.tone}`}>
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
    window.localStorage.setItem("waveatlas:favorites", JSON.stringify(next));
    setSaved(next.includes(key));
  };
  return (
    <button onClick={toggleSave} className="rounded-full border border-white/10 px-4 py-2 text-sm transition hover:bg-white/[0.08]">
      <Heart className={`mr-2 inline size-4 ${saved ? "fill-radio text-radio" : ""}`} />
      {saved ? "Saved" : "Save station"}
    </button>
  );
}

function ShareStationButton({ station }: { station: Station }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const stationUuid = station.station_uuid;
    if (!stationUuid) return;
    const url = `${window.location.origin}?station=${encodeURIComponent(stationUuid)}`;
    const title = `Listen to ${station.name} on WaveAtlas™`;
    const text = `Travel to ${station.country} through sound with ${station.name} on WaveAtlas™.`;
    if (navigator.share) await navigator.share({ title, text, url });
    else await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={share} className="rounded-full border border-white/10 px-4 py-2 text-sm transition hover:bg-white/[0.08]">
      {copied ? <Check className="mr-2 inline size-4 text-radio" /> : typeof navigator !== "undefined" && "share" in navigator ? <Share2 className="mr-2 inline size-4" /> : <Copy className="mr-2 inline size-4" />}
      {copied ? "Station link copied" : "Share station"}
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
        <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Country map</p>
        <p className="mt-2 text-sm font-semibold text-slate-100">{station.country}</p>
        <p className="mt-1 text-xs text-ivory/50">{geo.lat === null || geo.lng === null ? "GeoTruth pending" : `Fly to ${geo.lat.toFixed(2)}, ${geo.lng.toFixed(2)}`}</p>
      </div>
    </button>
  );
}

function SimilarStationsList({ station, stations }: { station: Station; stations: Station[] }) {
  const similar = stations.filter((s) => s.id !== station.id && (s.country_code === station.country_code || s.language === station.language || s.tags.some((tag) => station.tags.includes(tag)))).slice(0, 5);
  return <ListCard title="Similar nearby" items={similar.map((s) => ({ key: s.id, label: s.name, meta: `${s.country} · ${getPrimaryGenre(s)}`, action: () => usePlayer.getState().setStation(s) }))} />;
}

function NearbyCountriesList({ station, setQuery }: { station: Station; setQuery: (q: string) => void }) {
  const countries = (neighboringCountries[station.country_code] || Object.keys(countryFallbacks).map((code) => code)).slice(0, 5);
  return <ListCard title="Nearby countries" items={countries.map((country) => ({ key: country, label: country, meta: "Open active stations", action: () => setQuery(country) }))} />;
}

function ListCard({ title, items }: { title: string; items: { key: string; label: string; meta: string; action: () => void }[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{title}</p>
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
          <p className="font-mono text-xs uppercase tracking-[.3em] text-gold">Station Intelligence</p>
          <p className="mt-1 text-sm text-ivory/55">Live context for this signal</p>
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

function AroundMePanel({ station }: { station: Station }) {
  const geo = useMemo(() => geotruth(station), [station]);
  const genre = getPrimaryGenre(station);
  return <div className="fixed left-4 top-[132px] z-30 max-w-[220px] rounded-3xl border border-white/10 bg-slate-950/62 p-3 text-xs shadow-2xl backdrop-blur-xl"><p className="font-mono text-[10px] uppercase tracking-[.24em] text-radio">Around Me™</p><p className="mt-2 font-semibold text-ivory">You are traveling through sound.</p><div className="mt-3 space-y-1 text-ivory/65"><p>From {LISTENER_HOME.label}</p><p>To {station.country}</p><p>{distanceKm(LISTENER_HOME, geo).toLocaleString()} km · {localTimeFor(geo.lng)}</p><p>{estimatedTemperature(geo)}°F · {station.language || "Unknown"} · {genre}</p><p>Nearby: {(neighboringCountries[station.country_code] || ["regional signals"]).slice(0, 3).join(", ")}</p></div></div>;
}
function SignalPassportPanel({ station }: { station: Station }) {
  const entries = useSignalPassport(station);
  const countries = new Set(entries.map((e) => e.country));
  const duration = entries.reduce((sum, e) => sum + e.duration, 0);
  const favorite = [...countries][0] || station.country;
  return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="font-mono text-[10px] uppercase tracking-[.28em] text-gold">Signal Passport™</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><span className="rounded-xl bg-white/5 p-3"><b className="block text-xl text-radio">{countries.size || 1}</b>Countries explored</span><span className="rounded-xl bg-white/5 p-3"><b className="block text-xl text-sky">{Math.max(1, Math.min(6, countries.size))}</b>Continents explored</span><span className="rounded-xl bg-white/5 p-3">Favorite destination<br/><b>{favorite}</b></span><span className="rounded-xl bg-white/5 p-3">Longest signal route<br/><b>{distanceKm(LISTENER_HOME, geotruth(station)).toLocaleString()} km</b></span></div><div className="mt-3 flex flex-wrap gap-2">{passportBadges(entries).map(([badge, earned]) => <span key={badge} className={`rounded-full border px-3 py-1 text-xs ${earned ? "border-gold/40 bg-gold/15 text-gold" : "border-white/10 text-ivory/35"}`}>{badge}</span>)}</div><p className="mt-3 text-xs text-slate-300">{Math.round(duration / 60)} listening minutes logged locally.</p></div>;
}


const SIGNAL_SPLASH_KEY = "waveatlas:signal-initialized";
const signalInitializationPhases = [
  "Acquiring signal...",
  "Resolving Earth...",
  "Calibrating atlas...",
  "Loading station intelligence...",
  "Traveling through sound...",
];
function SignalInitializationSequence() {
  const [visible, setVisible] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem(SIGNAL_SPLASH_KEY) !== "true");
  const [phase, setPhase] = useState(0);
  const dismiss = useCallback(() => { window.sessionStorage.setItem(SIGNAL_SPLASH_KEY, "true"); setVisible(false); }, []);
  useEffect(() => {
    if (!visible) return;
    const phaseTimer = window.setInterval(() => setPhase((p) => Math.min(p + 1, signalInitializationPhases.length - 1)), 1850);
    const doneTimer = window.setTimeout(dismiss, 9800);
    return () => { window.clearInterval(phaseTimer); window.clearTimeout(doneTimer); };
  }, [dismiss, visible]);
  return <AnimatePresence>{visible ? <motion.div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-[#020617] text-ivory" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .8 }}>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(56,189,248,.2),transparent_24%),radial-gradient(circle_at_50%_58%,rgba(214,168,79,.14),transparent_26%)]" />
    <div className="cloud-layer absolute inset-0 opacity-20" />
    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:52px_52px] opacity-50" />
    <button onClick={dismiss} className="absolute right-5 top-5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[.2em] text-ivory/70 hover:text-white" aria-label="Skip Signal Initialization Sequence">Skip</button>
    <div className="relative flex max-w-xl flex-col items-center px-6 text-center">
      <motion.div className="relative grid size-64 place-items-center rounded-full border border-sky/20 bg-[radial-gradient(circle,rgba(56,189,248,.18),rgba(15,23,42,.35)_55%,transparent_70%)] shadow-[0_0_100px_rgba(56,189,248,.22)]" animate={{ rotate: 360 }} transition={{ duration: 26, repeat: Infinity, ease: "linear" }}>
        <div className="absolute inset-7 rounded-full border border-gold/25" />
        <div className="absolute inset-12 rounded-full border border-radio/20" />
        <Globe2 className="size-28 text-sky/80" />
        <span className="absolute size-5 rounded-full bg-radio shadow-[0_0_0_18px_rgba(88,225,132,.12),0_0_50px_rgba(88,225,132,.8)]" />
      </motion.div>
      <p className="mt-8 font-mono text-xs uppercase tracking-[.4em] text-gold">Signal Initialization Sequence™</p>
      <h1 className="mt-3 text-4xl font-black">WaveAtlas™</h1>
      <p className="mt-2 text-lg text-ivory/70">Experience Humanity Through Sound™</p>
      <AnimatePresence mode="wait"><motion.p key={phase} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-6 font-mono text-sm uppercase tracking-[.28em] text-radio">{signalInitializationPhases[phase]}</motion.p></AnimatePresence>
      <p className="mt-7 max-w-md text-center text-[10px] leading-5 text-ivory/40">Built by ETL GIS Consulting LLC • Geospatial Intelligence • Spatial Analytics • GIS Architecture • Florida, USA</p>
    </div>
  </motion.div> : null}</AnimatePresence>;
}

function AudioEngine() {
  const { current, status, volume, userActivated, setStatus } = usePlayer();
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const element = new Audio();
    element.preload = "none";
    element.volume = 1;
    element.muted = false;
    audio.current = element;
    const onError = () => {
      const code = element.error?.code;
      setStatus(
        "failed",
        `Stream failed${code ? ` (audio error ${code})` : ""}. Try another station.`,
      );
    };
    element.addEventListener("error", onError);

    return () => {
      element.removeEventListener("error", onError);
      element.pause();
      element.removeAttribute("src");
      element.load();
      audio.current = null;
    };
  }, [setStatus]);

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
        element.preload = "none";
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
          setStatus(
            message.toLowerCase().includes("user") ||
              message.toLowerCase().includes("gesture") ||
              message.toLowerCase().includes("allowed")
              ? "blocked"
              : "failed",
            message,
          );
        }
      }
    };

    void playSelectedStream();

    return () => {
      cancelled = true;
    };
  }, [current, status, userActivated, setStatus, volume]);

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
function BasemapSwitcher({ value, onChange, compact = false }: { value: BasemapKey; onChange: (value: BasemapKey) => void; compact?: boolean }) { return <div className={`${compact ? "grid grid-cols-2 gap-1 rounded-2xl p-1" : "grid grid-cols-3 gap-1 rounded-2xl p-1"} border border-white/10 bg-slate-950/80 shadow-xl backdrop-blur-xl`} aria-label="Basemap Cockpit">{(Object.keys(basemapStyles) as BasemapKey[]).map((key) => <button key={key} aria-label={`Switch basemap to ${basemapStyles[key].name}`} onClick={() => onChange(key)} className={`${compact ? "rounded-xl px-2 py-2 text-[10px]" : "rounded-xl px-3 py-2 text-xs"} font-bold transition ${value === key ? "bg-gold text-midnight" : "text-ivory/70 hover:bg-white/10"}`} title={basemapStyles[key].description}>{basemapStyles[key].label}</button>)}</div>; }
function MapStyleController({ map, basemap }: { map: Map | null; basemap: BasemapKey }) { useEffect(() => { if (!map) return; map.setStyle(basemapStyles[basemap].style); window.localStorage.setItem(BASEMAP_STORAGE_KEY, basemap); const resize = () => requestAnimationFrame(() => map.resize()); map.once("styledata", resize); resize(); return () => { map.off("styledata", resize); }; }, [map, basemap]); return null; }

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
      <span className="station-pulse-dot" />
    </div>
  );
}
function MapFlyToController({
  map,
  marker,
  station,
  status,
}: {
  map: Map | null;
  marker: Marker | null;
  station: Station;
  status: PlaybackStatus;
}) {
  const geo = useMemo(() => geotruth(station), [station]);
  useEffect(() => {
    if (!map || !marker) return;
    if (geo.lat === null || geo.lng === null) return;
    marker.setLngLat([geo.lng, geo.lat]);
    map.flyTo({
      center: [geo.lng, geo.lat],
      zoom: geo.precision === "station" ? 7 : geo.precision === "city" ? 6 : 4.4,
      speed: 0.72,
      curve: 1.35,
      essential: true,
    });
  }, [geo, map, marker]);
  useEffect(() => {
    marker
      ?.getElement()
      .classList.toggle("status-playing", status === "playing");
  }, [marker, status]);
  return null;
}

type MapScanContext = { lat: number; lng: number; zoom: number; countryCode?: string; countryName?: string };

function WaveAtlasMap({ station, mobile = false, resetSignal = 0, basemap: controlledBasemap, onBasemapChange, onMapContextChange }: { station: Station; mobile?: boolean; resetSignal?: number; basemap?: BasemapKey; onBasemapChange?: (value: BasemapKey) => void; onMapContextChange?: (context: MapScanContext) => void }) {
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
        '<span class="station-pulse-ring"></span><span class="station-pulse-ring two"></span><span class="station-pulse-dot"></span>';
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
    return () => {
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resize);
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
    map.easeTo({ ...view, essential: true });
    window.setTimeout(() => map.resize(), view.duration + 80);
  }, [map, resetSignal]);
  useEffect(() => {
    if (!map || !marker) return;
    const element = marker.getElement();
    element.className = `station-pulse-marker tone-${geo.tone} status-${status}`;
    element.innerHTML =
      '<span class="station-pulse-ring"></span><span class="station-pulse-ring two"></span><span class="station-pulse-dot"></span>';
    requestAnimationFrame(() => map.resize());
  }, [geo.tone, map, marker, station, status]);
  if (mobile) {
    return (
      <div className="fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden bg-slate-950">
        <div ref={container} className="absolute inset-0 h-full w-full" />
        <MapFlyToController map={map} marker={marker} station={station} status={status} />
        <MapStyleController map={map} basemap={basemap} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_30%,rgba(7,17,31,.28)_64%,rgba(7,17,31,.68)),linear-gradient(180deg,rgba(2,6,23,.28),transparent_32%,rgba(2,6,23,.48))]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
        <div className="day-night-terminator pointer-events-none absolute inset-y-0 w-1/2 opacity-55" />
        <div className="cloud-layer pointer-events-none absolute inset-0 opacity-25" />
        <div className="pointer-events-none absolute left-1/2 top-[45%] z-10 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-radio/15 bg-radio/5 blur-sm shadow-[0_0_80px_rgba(88,225,132,.18)]" />

      </div>
    );
  }
  return (
    <div className="relative w-full rounded-[2rem] border border-slate-700/60 bg-slate-950/80 p-4 shadow-2xl md:p-6">
      <div className="flex w-full flex-col gap-5">
        <div className="relative block h-[360px] w-full overflow-hidden rounded-[1.5rem] border border-slate-700/60 bg-slate-900 shadow-[0_0_48px_rgba(16,185,129,.16)] sm:h-[420px] lg:h-[520px]">
          <div ref={container} className="absolute inset-0 h-full w-full" />
          <MapFlyToController
            map={map}
            marker={marker}
            station={station}
            status={status}
          />
          <MapStyleController map={map} basemap={basemap} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_44%,rgba(7,17,31,.46)),linear-gradient(180deg,rgba(2,6,23,.22),transparent_36%,rgba(2,6,23,.5))]" />
          <div className="pointer-events-none absolute -right-10 -top-10 z-10 size-40 rounded-full border border-radio/10 shadow-[0_0_80px_rgba(52,211,153,.16)]" />
          <div className="pointer-events-none absolute -bottom-14 left-10 z-10 size-32 rounded-full border border-sky/10 shadow-[0_0_70px_rgba(56,189,248,.14)]" />
          <div className="absolute right-4 top-4 z-30 opacity-90"><BasemapSwitcher value={basemap} onChange={setBasemap} compact /></div><div className="pointer-events-none absolute left-4 top-4 z-20 rounded-full border border-white/15 bg-slate-950/75 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.28em] text-emerald-300 shadow-lg backdrop-blur">
            <Signal className="mr-1.5 inline size-3" />
            GIS
          </div>
        </div>
        <div className="flex items-center justify-between rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-sm backdrop-blur">
          <span className="truncate font-bold text-ivory">{station.name}</span>
          <span className="ml-3 shrink-0 text-xs text-ivory/55">{station.country}</span>
        </div>

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
  const currentIndex = stations.findIndex((station) => station.id === current.id);
  const rotated = [...stations.slice(currentIndex + 1), ...stations.slice(0, currentIndex + 1)];
  const matches = rotated.filter((station) => {
    const haystack = `${station.name} ${station.country} ${station.language} ${station.tags.join(" ")}`.toLowerCase();
    if (lower.includes("christian")) return /christian|gospel|worship|religious/.test(haystack);
    if (lower.includes("french")) return /french|français|france|canada|senegal|côte|ivory|belgium/.test(haystack);
    if (lower.includes("busy")) return station.click_count > 500 || station.votes > 100;
    if (lower.includes("quiet") || lower.includes("peaceful") || lower.includes("rainy")) return /classical|ambient|jazz|easy|chill|calm|lounge/.test(haystack);
    if (lower.includes("joyful")) return /pop|dance|gospel|hits|salsa|afro|music/.test(haystack);
    if (lower.includes("waking")) return hourFromLongitude(geotruth(station).lng) >= 5 && hourFromLongitude(geotruth(station).lng) < 10;
    return true;
  });
  return (matches.find((station) => station.id !== current.id && station.is_active) ?? rotated.find((station) => station.id !== current.id && station.is_active) ?? current);
}

function TakeMeSomewhereButton({ stations, current, onTravel }: { stations: Station[]; current: Station; onTravel?: (intent: string) => void }) {
  const travel = () => {
    const intent = WANDERER_INTENTS[Math.floor(Math.random() * WANDERER_INTENTS.length)];
    const destination = chooseWonderStation(stations, current, intent);
    usePlayer.getState().setStation(destination);
    onTravel?.(intent);
  };
  return <button onClick={travel} className="group rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-sm font-black text-ivory shadow-xl backdrop-blur-xl transition hover:border-gold/40"><Globe2 className="mr-2 inline size-5 transition group-hover:rotate-12" />🌎 Take Me Somewhere™</button>;
}

function PresenceCompanion({ station, intent }: { station: Station; intent: string }) {
  const experience = useMemo(() => getWandererExperience(station, intent), [station, intent]);
  return <section className="rounded-[2rem] border border-gold/20 bg-[radial-gradient(circle_at_top_left,rgba(214,168,79,.16),transparent_34%),rgba(255,255,255,.045)] p-5 shadow-glow"><p className="font-mono text-[10px] uppercase tracking-[.3em] text-gold">Presence AI™ · Wanderer™ Agent</p><h2 className="mt-3 text-2xl font-black">{experience.intent}</h2><p className="mt-3 text-sm leading-6 text-ivory/75">{experience.narration}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><span className="rounded-2xl bg-white/5 p-3 text-sm"><b className="block text-radio">Human Presence Index™</b>{experience.presenceIndex}/100 · {experience.earthMood}</span><span className="rounded-2xl bg-white/5 p-3 text-sm"><b className="block text-sky">Signal Passport™ memory</b>{experience.memoryLine}</span></div></section>;
}

function RadioDial({ stations }: { stations: Station[] }) {
  const [index, setIndex] = useState(0);
  const current = stations[index] ?? stations[0];
  const setStation = usePlayer((s) => s.setStation);
  const ticks = useMemo(() => Array.from({ length: 49 }, (_, i) => i), []);
  const tune = (delta: number) => {
    const next = (index + delta + stations.length) % stations.length;
    setIndex(next);
    setStation(stations[next]);
  };
  return (
    <section className="glass overflow-hidden rounded-[2rem] p-5 shadow-glow md:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex-1">
          <p className="mb-3 font-mono text-xs uppercase tracking-[.35em] text-gold">
            <Radio className="mr-2 inline size-4" />
            Global terrestrial dial
          </p>
          <h1 className="text-4xl font-black tracking-tight md:text-7xl">
            Experience Humanity Through Sound.
          </h1>
          <p className="mt-4 max-w-2xl text-ivory/70">
            Not stations. Not playlists. A living atlas where Earth is the interface, sound is the vehicle, and wonder is the destination.
          </p>
        </div>
        <button
          onClick={() => tune(1)}
          className="min-h-14 rounded-full bg-gold px-6 font-bold text-midnight shadow-lg shadow-gold/20"
        >
          <SkipForward className="mr-2 inline" />
          Scan the World
        </button>
      </div>
      <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-midnight/70 p-4">
        <div
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (e.buttons) tune(e.movementX < 0 ? 1 : -1);
          }}
          className="dial-texture relative h-40 cursor-grab select-none overflow-hidden rounded-3xl border border-sky/20"
        >
          <div className="absolute inset-x-1/2 top-0 h-full w-px bg-gold shadow-[0_0_24px_#D6A84F]" />
          <div className="flex h-full items-end justify-around px-6 pb-6">
            {ticks.map((t) => (
              <span
                key={t}
                className={`w-px rounded ${t % 5 === 0 ? "h-24 bg-ivory/80" : "h-12 bg-ivory/35"}`}
              />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              className="absolute left-1/2 top-7 -translate-x-1/2 rounded-full border border-gold/50 bg-gold/10 px-4 py-2 font-mono text-sm text-gold"
              key={current?.station_uuid}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
            >
              {(88 + index * 0.7).toFixed(1)} WA · {current?.country_code}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
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
          <p className="font-mono text-xs uppercase tracking-[.3em] text-radio">
            Now playing
          </p>
          <h2 className="mt-2 text-3xl font-black">{station.name}</h2>
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
          className="min-h-14 rounded-full bg-radio px-7 font-bold text-midnight"
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
          <Share2 />
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

function MobileBrandBar({ logoLoaded, logoFailed, setLogoLoaded, setLogoFailed }: { logoLoaded: boolean; logoFailed: boolean; setLogoLoaded: (v: boolean) => void; setLogoFailed: (v: boolean) => void }) {
  return (
    <div className="fixed left-0 right-0 top-0 z-40 px-4 pt-3">
      <div className="flex items-center justify-between rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-sky/15 text-sky">
            {(!logoLoaded || logoFailed) && <Globe2 className="size-5 animate-pulse" />}
            {!logoFailed && <Image src="/assets/logo/waveatlas-logo.png" alt="WaveAtlas Logo" width={40} height={40} priority className={`absolute inset-0 h-full w-full object-contain transition-opacity ${logoLoaded ? "opacity-100" : "opacity-0"}`} onLoad={() => setLogoLoaded(true)} onError={() => setLogoFailed(true)} />}
          </div>
          <div><b className="text-sm leading-none">WaveAtlas™</b></div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[.18em] text-radio"><span className="size-2 rounded-full bg-radio shadow-[0_0_12px_rgba(88,225,132,.9)]" />Live</span>
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
          <span className="flex items-center gap-3"><span className="text-xl">{country.flag}</span><span><b className="block text-sm">{country.name}</b><span className="text-xs text-ivory/50">{country.code} · {country.station_count.toLocaleString()} stations</span></span></span>
          <MapPin className="size-4 text-gold" />
        </button>
      ))}
    </div>
  );
}


function SearchResultStationCard({ station, onSelect }: { station: Station; onSelect: (station: Station) => void }) {
  const health = getStreamHealth(station);
  const location = [station.state || station.city, station.country].filter(Boolean).join(" · ");
  return <button onClick={() => onSelect(station)} className="mb-3 w-full rounded-2xl border border-white/10 bg-slate-900 p-4 text-left shadow-lg transition active:scale-[0.99] hover:border-gold/50 hover:bg-slate-800"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-base font-bold text-white">{station.name}</b><p className="mt-1 text-xs font-medium text-slate-300">{location || "Global"} · {station.language || "Unknown language"}</p></div><span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-300"><span className={`mr-1 inline-block size-2 rounded-full ${health.dot}`} />{health.label}</span></div><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">{station.codec || "Unknown codec"}</span><span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">{station.bitrate ? `${station.bitrate} kbps` : "Live stream"}</span><span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">{station.country_code}</span>{station.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100">{tag}</span>)}</div></button>;
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
  return <div className="rounded-3xl border border-white/15 bg-slate-950/98 p-3 shadow-2xl backdrop-blur-2xl"><div className="mb-3 flex items-center justify-between px-1"><p className="font-mono text-[10px] uppercase tracking-[.28em] text-gold">{countryIntentActive && resultMeta?.countryName ? `Stations in ${resultMeta.countryName}` : "Station command results"}</p>{loading ? <span className="text-xs font-semibold text-sky">{countryIntentActive && resultMeta?.countryName ? `Acquiring ${resultMeta.countryName} signals…` : "Searching…"}</span> : null}</div><div className="grid gap-3 lg:grid-cols-[1.25fr_.75fr]"><div>{stationResults.length ? stationResults.map((station) => <SearchResultStationCard key={station.id} station={station} onSelect={onStationSelect} />) : <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm font-medium text-slate-300">{countryIntentActive && resultMeta?.countryName ? `No active stations found for ${resultMeta.countryName} yet. Try Load More, check another genre, or let Station Steward Agent refresh this region.` : "No active station found. Try country or genre search."}</p>}</div><div className="grid content-start gap-3"><SearchGroup title="Countries" items={countries.slice(0, 6).map((c) => ({ key: c.code, label: `${c.flag} ${c.name}`, meta: `${c.station_count.toLocaleString()} stations`, action: () => onCountrySelect(c) }))} /><SearchGroup title="Genres" items={genres.map((g) => ({ key: g, label: g, meta: "Search format", action: () => setQuery(g) }))} /><SearchGroup title="Languages" items={languages.map((l) => ({ key: l, label: l, meta: "Search language", action: () => setQuery(l) }))} /></div></div></div>;
}
function SearchGroup({ title, items }: { title: string; items: { key: string; label: string; meta: string; action: () => void }[] }) {
  return <div className="rounded-3xl border border-white/10 bg-slate-900 p-4 shadow-lg"><p className="font-mono text-[10px] uppercase tracking-[.28em] text-gold">{title}</p><div className="mt-3 space-y-2">{items.length ? items.map((item) => <button key={item.key} onClick={item.action} className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-slate-800 px-3 py-2 text-left text-slate-100 hover:border-sky/40"><span><b className="block text-sm">{item.label}</b><span className="text-xs text-slate-300">{item.meta}</span></span><MapPin className="size-4 text-gold" /></button>) : <p className="text-sm text-ivory/45">No matches yet.</p>}</div></div>;
}
function DeveloperAttribution({ compact = false }: { compact?: boolean }) { return <a href="https://etl-gis-consulting-llc.vercel.app" target="_blank" rel="noreferrer" className={`${compact ? "text-[10px]" : "text-xs"} inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono uppercase tracking-[.18em] text-ivory/55 transition hover:border-gold/40 hover:text-gold`}><Info className="size-3" />Built by ETL GIS Consulting LLC</a>; }
function AboutWaveAtlasModal() { return <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5"><p className="font-mono text-[10px] uppercase tracking-[.28em] text-gold">About WaveAtlas™</p><p className="mt-3 text-sm leading-6 text-ivory/70">Experience Humanity Through Sound™ — the Living Atlas of Human Presence™ built by ETL GIS Consulting LLC.</p><p className="mt-2 text-xs leading-5 text-ivory/50">ETL GIS Consulting LLC delivers geospatial intelligence, GIS architecture, spatial analytics, and location-based technology solutions from Florida, USA.</p><a href="https://etl-gis-consulting-llc.vercel.app" target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-bold text-gold">Visit ETL GIS Consulting LLC</a></div>; }


type SignalCandidate = { station: Station; distanceKm?: number; signalStrength?: number };

type SignalDialProps = {
  mapContext: MapScanContext | null;
  selectedCountry?: CountryResult | null;
  stations: Station[];
  current: Station;
  mobile?: boolean;
  onStationResolved?: (station: Station) => void;
};

function SignalCandidatePreview({ candidate, state, onTune, onNext }: { candidate: SignalCandidate | null; state: "idle" | "scanning" | "found" | "none"; onTune: () => void; onNext: () => void }) {
  if (state === "idle") return null;
  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="fixed bottom-[166px] left-4 right-4 z-50 rounded-3xl border border-white/10 bg-slate-950/92 p-3 text-white shadow-2xl backdrop-blur-xl md:absolute md:bottom-4 md:left-auto md:right-4 md:w-80">
    <p className="font-mono text-[10px] uppercase tracking-[.24em] text-gold">{state === "scanning" ? "Scanning signal" : state === "none" ? "No signal" : "Candidate lock"}</p>
    {candidate ? <div className="mt-2 flex items-center justify-between gap-3"><div className="min-w-0"><b className="block truncate text-sm">{candidate.station.name}</b><p className="truncate text-xs text-ivory/65">{candidate.station.city || candidate.station.state || candidate.station.country} · {candidate.signalStrength ?? candidate.station.health_score}% confidence</p></div><div className="flex shrink-0 gap-2"><button onClick={onNext} className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-ivory">Next</button><button onClick={onTune} className="rounded-full bg-radio px-3 py-2 text-xs font-black text-midnight">Lock</button></div></div> : <p className="mt-2 text-sm text-ivory/70">No verified station matched this map focus. Try another country or long-press for Wander.</p>}
  </motion.div>;
}

function SignalDial({ mapContext, selectedCountry, stations, current, mobile = false, onStationResolved }: SignalDialProps) {
  const [state, setState] = useState<"idle" | "scanning" | "found" | "none">("idle");
  const [mode, setMode] = useState<"Global" | "Nearby" | "Unvisited" | "Mood">("Global");
  const [candidates, setCandidates] = useState<SignalCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const timer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const candidate = candidates[index] ?? null;
  const fallbackCandidates = useCallback(() => {
    const countryCode = mode === "Nearby" ? selectedCountry?.code : undefined;
    const pool = stations.filter((station) => station.is_active && station.url && station.failure_count <= 2 && (!countryCode || station.country_code === countryCode));
    return pool.map((station) => ({ station, signalStrength: station.health_score })).slice(0, 8);
  }, [mode, selectedCountry?.code, stations]);
  const scan = useCallback(async (wander = false) => {
    setState("scanning");
    const params = new URLSearchParams({ limit: "6" });
    if (!wander && mode === "Nearby" && selectedCountry) {
      params.set("countryCode", selectedCountry.code);
      params.set("country", selectedCountry.name);
    } else if (!wander && mode === "Nearby" && mapContext) {
      params.set("lat", String(mapContext.lat));
      params.set("lng", String(mapContext.lng));
      params.set("zoom", String(mapContext.zoom));
    } else {
      params.set("global", "true");
    }
    try {
      const res = await fetch(`/api/stations/nearby?${params}`);
      if (!res.ok) throw new Error("Scan failed");
      const data = (await res.json()) as { candidates?: SignalCandidate[]; bestCandidate?: SignalCandidate | null };
      const next = (data.candidates?.length ? data.candidates : data.bestCandidate ? [data.bestCandidate] : fallbackCandidates()).filter((item) => item.station.id !== current.id || data.candidates?.length === 1);
      setCandidates(next);
      setIndex(0);
      setState(next.length ? "found" : "none");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState("idle"), 8000);
    } catch {
      const next = fallbackCandidates();
      setCandidates(next);
      setIndex(0);
      setState(next.length ? "found" : "none");
    }
  }, [current.id, fallbackCandidates, mapContext, mode, selectedCountry]);
  const tune = () => {
    if (!candidate) return;
    usePlayer.getState().setStation(candidate.station);
    onStationResolved?.(candidate.station);
    setState("idle");
  };
  return <>
    <div className={`${mobile ? "fixed bottom-[166px] right-5 z-50" : "absolute bottom-5 right-5 z-40"}`}>
      <button type="button" onClick={() => { if (longPressTriggered.current) { longPressTriggered.current = false; return; } void scan(false); }} onContextMenu={(e) => { e.preventDefault(); void scan(true); }} onPointerDown={() => { if (timer.current) window.clearTimeout(timer.current); longPressTriggered.current = false; timer.current = window.setTimeout(() => { longPressTriggered.current = true; void scan(true); }, 650); }} onPointerUp={() => { if (timer.current) window.clearTimeout(timer.current); }} className="group relative grid size-20 place-items-center rounded-full border border-white/15 bg-slate-950/75 text-white shadow-2xl backdrop-blur-xl">
        <span className="absolute inset-1 rounded-full border border-gold/45 bg-[conic-gradient(from_90deg,rgba(214,168,79,.75),rgba(88,225,132,.85),transparent_62%)] opacity-80 transition group-hover:rotate-45" />
        <span className="absolute inset-3 rounded-full bg-slate-950/90" />
        <span className="relative text-center"><ScanLine className="mx-auto size-6 text-radio" /><span className="mt-1 block text-[10px] font-black uppercase tracking-[.18em] text-gold">Scan</span></span>
      </button>
      <div className="mt-2 flex justify-center gap-1 text-[9px] font-black uppercase tracking-[.18em] text-ivory/60"><span>Scan</span><span>•</span><span>Next</span><span>•</span><span>Lock</span></div>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-slate-950/70 p-1 text-[9px] font-black uppercase tracking-[.12em] backdrop-blur">{(["Global", "Nearby", "Unvisited", "Mood"] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={`rounded-xl px-2 py-1 ${mode === item ? "bg-radio text-midnight" : "text-ivory/55"}`}>{item}</button>)}</div>
    </div>
    <AnimatePresence><SignalCandidatePreview candidate={candidate} state={state} onTune={tune} onNext={() => setIndex((n) => candidates.length ? (n + 1) % candidates.length : 0)} /></AnimatePresence>
  </>;
}

function MobileSearchPill({ query, setQuery, onCountrySelect, stations, onStationSelect }: { query: string; setQuery: (q: string) => void; onCountrySelect: (country: CountryResult) => void; stations: Station[]; onStationSelect: (station: Station) => void }) {
  return <><label className="fixed left-4 right-4 top-[76px] z-40 flex min-h-12 items-center gap-3 rounded-full border border-white/10 bg-slate-950/90 px-4 shadow-2xl backdrop-blur-xl"><Search className="size-4 text-sky" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search country, city, station..." className="w-full bg-transparent text-sm outline-none placeholder:text-ivory/55" /></label><div className="fixed left-4 right-4 top-[132px] z-50 max-h-[55dvh] overflow-y-auto"><GroupedSearchResults query={query} stations={stations} onStationSelect={onStationSelect} onCountrySelect={onCountrySelect} setQuery={setQuery} /></div></>;
}

function MobileNowPlayingMini({ station, onOpen }: { station: Station; onOpen: () => void }) {
  const { playing, status, toggle, setStation } = usePlayer();
  const play = () => { if (!usePlayer.getState().current) setStation(station); else toggle(); };
  return <div onClick={onOpen} className="fixed bottom-[82px] left-4 right-4 z-40 h-[72px] rounded-3xl border border-white/10 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-xl">
    <div className="flex h-full items-center gap-3"><button onClick={(e) => { e.stopPropagation(); play(); }} className="grid size-11 shrink-0 place-items-center rounded-full bg-radio text-midnight">{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{station.name}</p><p className="truncate text-xs text-ivory/60">{station.country} · {status}</p></div><div className="flex h-7 items-end gap-0.5">{[30,55,40,75,50].map((h,i)=><span key={i} style={{height:`${h}%`}} className="w-1 rounded-full bg-radio/80" />)}</div></div>
  </div>;
}

function MobileBasemapSheet({ open, value, onChange, onClose }: { open: boolean; value: BasemapKey; onChange: (value: BasemapKey) => void; onClose: () => void }) {
  return <AnimatePresence>{open ? <motion.section initial={{ y: 280, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 280, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-50 rounded-[2rem] border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
    <button onClick={onClose} className="mx-auto mb-4 block h-1.5 w-14 rounded-full bg-white/30" aria-label="Close basemap cockpit" />
    <p className="mb-3 font-mono text-[10px] uppercase tracking-[.28em] text-gold">Basemap Cockpit</p>
    <div className="grid grid-cols-2 gap-2">{(Object.keys(basemapStyles) as BasemapKey[]).map((key) => <button key={key} onClick={() => { onChange(key); onClose(); }} className={`rounded-2xl border px-3 py-3 text-left text-sm font-bold ${value === key ? "border-gold bg-gold text-midnight" : "border-white/10 bg-white/5 text-ivory"}`}><span className="block">{basemapStyles[key].label}</span><span className="mt-1 block text-[11px] font-medium opacity-70">{basemapStyles[key].description}</span></button>)}</div>
  </motion.section> : null}</AnimatePresence>;
}

function MobileWanderSheet({ open, stations, current, onTravel, onClose }: { open: boolean; stations: Station[]; current: Station; onTravel: (intent: string) => void; onClose: () => void }) {
  const options = ["Surprise Me", "Unvisited Country", "Unvisited Continent", "Somewhere Waking Up", "Somewhere Falling Asleep", "Somewhere Rainy", "Somewhere Spiritual", "Somewhere Busy", "Somewhere Peaceful", "Spin the Globe"];
  const travel = (option: string) => {
    const intent = option === "Surprise Me" ? "Take me somewhere surprising" : option === "Spin the Globe" ? "Tonight we are going global" : option;
    usePlayer.getState().setStation(chooseWonderStation(stations, current, intent));
    onTravel(intent);
    onClose();
  };
  return <AnimatePresence>{open ? <motion.section initial={{ y: 360, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 360, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-50 rounded-[2rem] border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
    <button onClick={onClose} className="mx-auto mb-4 block h-1.5 w-14 rounded-full bg-white/30" aria-label="Close Wander" />
    <p className="mb-1 font-mono text-[10px] uppercase tracking-[.28em] text-gold">Wander</p><h2 className="mb-3 text-xl font-black">Tonight we are going somewhere.</h2>
    <div className="grid grid-cols-2 gap-2">{options.map((option) => <button key={option} onClick={() => travel(option)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm font-bold text-ivory active:scale-[.98]">{option}</button>)}</div>
  </motion.section> : null}</AnimatePresence>;
}

function PresenceToast({ station, intent, visible }: { station: Station; intent: string; visible: boolean }) {
  const experience = useMemo(() => getWandererExperience(station, intent), [station, intent]);
  return <AnimatePresence>{visible ? <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-[166px] left-4 right-4 z-40 rounded-3xl border border-gold/20 bg-slate-950/90 p-4 text-sm leading-6 text-ivory shadow-2xl backdrop-blur-xl">{experience.narration}</motion.div> : null}</AnimatePresence>;
}

function MobileMapControls({ onOpenBasemap }: { onRecenter: () => void; onOpenBasemap: () => void; onOpenSearch: () => void; onOpenFavorites: () => void; onScan: () => void }) {
  return <button onClick={onOpenBasemap} aria-label="Basemap" className="fixed right-4 top-[146px] z-40 grid size-10 place-items-center rounded-full border border-white/10 bg-slate-950/70 text-ivory shadow-xl backdrop-blur-xl hover:border-gold/40"><Layers className="size-4" /></button>;
}

function MobileStationSheet({ station, stations, setQuery, open, setOpen }: { station: Station; stations: Station[]; setQuery: (q: string) => void; open: boolean; setOpen: (v: boolean) => void }) {
  return <motion.section drag="y" dragConstraints={{ top: 0, bottom: 0 }} onDragEnd={(_, info) => setOpen(info.offset.y < -40 ? true : info.offset.y > 40 ? false : open)} initial={{ y: 680 }} animate={{ y: open ? 64 : 680 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-white/10 bg-slate-950/95 px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-3 shadow-2xl backdrop-blur-xl">
    <button onClick={() => setOpen(!open)} className="mx-auto block h-1.5 w-14 rounded-full bg-white/30" aria-label="Toggle Station Intelligence" />
    <StationIntelligencePanel station={station} stations={stations} setQuery={setQuery} />
  </motion.section>;
}

function MobileCommandDock({ mode, setMode }: { mode: string; setMode: (m: string) => void }) {
  return <nav className="fixed bottom-0 left-0 right-0 z-[60] px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2"><div className="grid grid-cols-4 gap-1 rounded-full border border-white/10 bg-slate-950/90 p-1 shadow-2xl backdrop-blur-xl">{[[Compass,"Atlas"],[Radio,"Dial"],[Globe2,"Wander"],[Heart,"Library"]].map(([Icon,label]) => { const I = Icon as typeof Compass; return <button key={label as string} onClick={() => setMode(label as string)} className={`rounded-full px-2 py-2 text-[11px] font-bold ${mode === label ? "bg-radio text-midnight" : "text-ivory/70"}`}><I className="mx-auto mb-0.5 size-4" />{label as string}</button>; })}</div></nav>;
}

function MobileAtlasShell({ stations, current, query, setQuery, onCountrySelect, logoLoaded, logoFailed, setLogoLoaded, setLogoFailed, wandererIntent, setWandererIntent }: { stations: Station[]; current: Station; query: string; setQuery: (q: string) => void; onCountrySelect: (country: CountryResult) => void; logoLoaded: boolean; logoFailed: boolean; setLogoLoaded: (v: boolean) => void; setLogoFailed: (v: boolean) => void; wandererIntent: string; setWandererIntent: (intent: string) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState("Atlas");
  const [resetSignal, setResetSignal] = useState(0);
  const [basemap, setBasemap] = useState<BasemapKey>(() => getInitialBasemap(true));
  const [basemapOpen, setBasemapOpen] = useState(false);
  const [wanderOpen, setWanderOpen] = useState(false);
  const [presenceVisible, setPresenceVisible] = useState(false);
  const [mapContext, setMapContext] = useState<MapScanContext | null>(null);
  const handleTravel = (intent: string) => {
    setWandererIntent(intent);
    setPresenceVisible(true);
    window.setTimeout(() => setPresenceVisible(false), 5000);
  };
  return <section className="md:hidden relative h-[100dvh] min-h-[100dvh] overflow-hidden overflow-x-hidden bg-slate-950 text-white">
    <WaveAtlasMap station={current} mobile resetSignal={resetSignal} basemap={basemap} onBasemapChange={setBasemap} onMapContextChange={setMapContext} />
    <MobileBrandBar logoLoaded={logoLoaded} logoFailed={logoFailed} setLogoLoaded={setLogoLoaded} setLogoFailed={setLogoFailed} />
    {mode !== "Dial" ? <MobileSearchPill query={query} setQuery={setQuery} onCountrySelect={onCountrySelect} stations={stations} onStationSelect={(station) => usePlayer.getState().setStation(station)} /> : null}
    <SignalDial mobile mapContext={mapContext} stations={stations} current={current} selectedCountry={null} />
    <MobileMapControls onRecenter={() => usePlayer.getState().setStation(current)} onOpenBasemap={() => setBasemapOpen(true)} onOpenSearch={() => document.querySelector<HTMLInputElement>('input[placeholder="Search country, city, station..."]')?.focus()} onOpenFavorites={() => setQuery("favorites")} onScan={() => usePlayer.getState().setStation(stations[(stations.findIndex((s) => s.id === current.id) + 1) % stations.length])} />
    <PresenceToast station={current} intent={wandererIntent} visible={presenceVisible} />
    <MobileBasemapSheet open={basemapOpen} value={basemap} onChange={setBasemap} onClose={() => setBasemapOpen(false)} />
    <MobileWanderSheet open={wanderOpen} stations={stations} current={current} onTravel={handleTravel} onClose={() => setWanderOpen(false)} />
    <MobileNowPlayingMini station={current} onOpen={() => setSheetOpen(true)} />
    <MobileStationSheet station={current} stations={stations} setQuery={setQuery} open={sheetOpen || mode === "Library"} setOpen={setSheetOpen} />
    <MobileCommandDock mode={mode} setMode={(m) => { setMode(m); if (m === "Wander") setWanderOpen(true); else if (m === "Library") setSheetOpen(true); else setSheetOpen(false); }} />
  </section>;
}

export default function WaveAtlasApp({ stations }: { stations: Station[] }) {
  const [stationPool, setStationPool] = useState(stations);
  const current = usePlayer((s) => s.current) ?? stationPool[0] ?? stations[0];
  const [query, setQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<CountryResult | null>(null);
  const [activeTag, setActiveTag] = useState("");
  const [offset, setOffset] = useState(stations.length);
  const [loadingCountry, setLoadingCountry] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [desktopResetSignal, setDesktopResetSignal] = useState(0);
  const [deepLinkStatus, setDeepLinkStatus] = useState<"idle" | "loading" | "unavailable">("idle");
  const [wandererIntent, setWandererIntent] = useState("Take me somewhere surprising");
  const [desktopMode, setDesktopMode] = useState("Atlas");
  const [desktopMapContext, setDesktopMapContext] = useState<MapScanContext | null>(null);
  const [deepLinkUuid] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("station")?.trim() || "");
  const initialStationPoolRef = useRef(stationPool);

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
  const selectCountry = (country: CountryResult) => {
    setSelectedCountry(country);
    setQuery(country.name);
    setActiveTag("");
    void loadCountryStations(country, 0, "");
  };
  const selectTag = (tag: string) => {
    setActiveTag(tag);
    if (selectedCountry) void loadCountryStations(selectedCountry, 0, tag);
  };
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
      <AudioEngine />
      <SignalInitializationSequence />
      {deepLinkStatus !== "idle" ? <div className="fixed left-1/2 top-4 z-[80] w-[min(92vw,34rem)] -translate-x-1/2 rounded-3xl border border-white/10 bg-slate-950/90 p-4 text-sm text-ivory shadow-2xl backdrop-blur-xl"><b className="block text-base text-white">{deepLinkStatus === "loading" ? "Resolving shared station…" : "Station unavailable or moved"}</b><p className="mt-1 text-ivory/70">{deepLinkStatus === "loading" ? `Looking up exact station UUID ${deepLinkUuid}.` : `No station matched UUID ${deepLinkUuid}. WaveAtlas will not substitute another station for this shared link.`}</p></div> : null}
      <MobileAtlasShell stations={stationPool} current={current} query={query} setQuery={setQuery} onCountrySelect={selectCountry} logoLoaded={logoLoaded} logoFailed={logoFailed} setLogoLoaded={setLogoLoaded} setLogoFailed={setLogoFailed} wandererIntent={wandererIntent} setWandererIntent={setWandererIntent} />
    <main className="hidden min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#12385a,transparent_35%),#07111F] p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:block md:p-8">
      <nav className="mx-auto mb-6 flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sky/15 text-sky">
            {(!logoLoaded || logoFailed) && (
              <Globe2 className="h-7 w-7 animate-pulse" aria-hidden="true" />
            )}
            {!logoFailed && (
              <Image
                src="/assets/logo/waveatlas-logo.png"
                alt="WaveAtlas Logo"
                width={56}
                height={56}
                priority
                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
                  logoLoaded ? "opacity-100" : "opacity-0"
                }`}
                onLoad={() => setLogoLoaded(true)}
                onError={() => setLogoFailed(true)}
              />
            )}
          </div>
          <div>
            <b className="text-xl">WaveAtlas™</b>
            <p className="font-mono text-[10px] uppercase tracking-[.28em] text-gold">
              EXPERIENCE HUMANITY THROUGH SOUND™
            </p>
          </div>
        </div>
        <div className="hidden gap-2 md:flex">
          {["Atlas", "Dial", "Wander", "Library"].map((x) => (
            <button
              type="button"
              onClick={() => setDesktopMode(x)}
              className={`rounded-full border border-white/10 px-4 py-2 text-sm ${desktopMode === x ? "bg-radio text-midnight" : "text-ivory/70"}`}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
      </nav>
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.65fr_.75fr]">
        <div id="atlas-map" className="scroll-mt-6">
          <div className="relative"><WaveAtlasMap station={current} resetSignal={desktopResetSignal} onMapContextChange={setDesktopMapContext} />{desktopMode === "Dial" ? <SignalDial mapContext={desktopMapContext} stations={stationPool} current={current} selectedCountry={selectedCountry} /> : null}</div>
          <div className="mt-3 flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-slate-950/55 p-3 backdrop-blur-xl">
            <TakeMeSomewhereButton stations={stationPool} current={current} onTravel={setWandererIntent} />
            <button aria-label="Scan global stations" onClick={() => usePlayer.getState().setStation(stationPool[(stationPool.findIndex((s) => s.id === current.id) + 1) % stationPool.length])} className="rounded-full bg-gold px-4 py-2 font-black text-midnight"><ScanLine className="mr-2 inline size-4" />Scan</button>
            <button aria-label="Recenter on current playing station" onClick={() => usePlayer.getState().setStation(current)} className="rounded-full border border-white/10 px-4 py-2 text-ivory"><MapPin className="mr-2 inline size-4" />Recenter</button>
            <button aria-label="Reset Earth" onClick={() => setDesktopResetSignal((n) => n + 1)} className="rounded-full border border-white/10 px-4 py-2 text-ivory"><Compass className="mr-2 inline size-4" />Reset Earth</button>
          </div>
        </div>
        <div className="space-y-6"><NowPlaying station={current} stations={stationPool} setQuery={setQuery} /></div>
      </div>
      <section className="mx-auto mt-6 max-w-7xl">
        <div className="glass rounded-[2rem] p-6">
          <div className="flex gap-3">
            <Search className="text-sky" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country, city, station, genre, or language"
              className="w-full bg-transparent outline-none placeholder:text-ivory/40"
            />
          </div>
          <CountryAutocomplete query={query} onSelect={selectCountry} />
          <GroupedSearchResults query={query} stations={stationPool} onStationSelect={(station) => { usePlayer.getState().setStation(station); setStationPool((prev) => prev.some((s) => s.id === station.id) ? prev : [station, ...prev]); }} onCountrySelect={selectCountry} setQuery={setQuery} />
          {selectedCountry ? (
            <div className="mt-4 rounded-3xl border border-gold/20 bg-gold/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold">{selectedCountry.flag} {selectedCountry.name} · {stationPool.length.toLocaleString()} loaded of {selectedCountry.station_count.toLocaleString()} known stations</p>
                {loadingCountry ? <span className="text-sm text-gold">Acquiring {selectedCountry.name} signals…</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["", "news", "music", "talk", "gospel", "sports", "local"].map((tag) => (
                  <button key={tag || "all"} onClick={() => selectTag(tag)} className={`rounded-full px-4 py-2 text-sm font-bold ${activeTag === tag ? "bg-radio text-midnight" : "border border-white/10 text-ivory/70"}`}>{tag || "All"}</button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              "Nigeria",
              "Dubai",
              "France",
              "United States",
              "News",
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
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((s) => (
              <button
                key={s.id}
                onClick={() => usePlayer.getState().setStation(s)}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:border-gold/50"
              >
                <b>{s.name}</b>
                <p className="mt-1 text-sm text-ivory/60">
                  {s.country} · {s.tags.slice(0, 3).join(", ") || "live radio"}
                </p>
              </button>
            ))}
          </div>
          {selectedCountry && !visible.length && !loadingCountry ? <p className="mt-5 rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm font-medium text-slate-300">No active stations found for {selectedCountry.name} yet. Try Load More, check another genre, or let Station Steward Agent refresh this region.</p> : null}
          {selectedCountry ? <button disabled={loadingCountry} onClick={() => loadCountryStations(selectedCountry, offset)} className="mt-5 w-full rounded-full bg-radio px-5 py-3 font-black text-midnight disabled:opacity-50">{loadingCountry ? `Acquiring ${selectedCountry.name} signals…` : "Load More stations"}</button> : null}
        </div>
      </section>
      <div className="fixed inset-x-3 bottom-3 z-20 mx-auto flex max-w-md items-center justify-between rounded-full border border-white/15 bg-midnight/90 p-2 pl-4 shadow-glow backdrop-blur md:hidden">
        <span className="truncate text-sm">
          <Compass className="mr-2 inline size-4 text-gold" />
          {current.name}
        </span>
        <button
          onClick={() => {
            const player = usePlayer.getState();
            if (!player.current) player.setStation(current);
            else player.toggle();
          }}
          className="rounded-full bg-radio p-3 text-midnight"
        >
          {usePlayer.getState().playing ? <Pause /> : <Play />}
        </button>
      </div>
    </main>
    </>
  );
}
