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
  Radar,
  Radio,
  ScanLine,
  Search,
  Share2,
  Signal,
  Trophy,
  SkipForward,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import type { Station } from "@/lib/stations";

type GeoPoint = {
  lat: number;
  lng: number;
  label: string;
  precision: "station" | "city" | "country";
  tone: "green-gold" | "blue-gold" | "radio-gold";
};
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

const countryFallbacks: Record<
  string,
  Omit<GeoPoint, "label" | "precision">
> = {
  NG: { lat: 9.082, lng: 8.6753, tone: "green-gold" },
  AE: { lat: 23.4241, lng: 53.8478, tone: "blue-gold" },
  FR: { lat: 46.2276, lng: 2.2137, tone: "radio-gold" },
  GB: { lat: 55.3781, lng: -3.436, tone: "radio-gold" },
  US: { lat: 39.8283, lng: -98.5795, tone: "radio-gold" },
  BR: { lat: -14.235, lng: -51.9253, tone: "radio-gold" },
  ZA: { lat: -30.5595, lng: 22.9375, tone: "green-gold" },
  GH: { lat: 7.9465, lng: -1.0232, tone: "green-gold" },
  JP: { lat: 36.2048, lng: 138.2529, tone: "radio-gold" },
};
const cityFallbacks: Record<string, Omit<GeoPoint, "label" | "precision">> = {
  lagos: { lat: 6.5244, lng: 3.3792, tone: "green-gold" },
  abuja: { lat: 9.0765, lng: 7.3986, tone: "green-gold" },
  dubai: { lat: 25.2048, lng: 55.2708, tone: "blue-gold" },
  paris: { lat: 48.8566, lng: 2.3522, tone: "radio-gold" },
  london: { lat: 51.5072, lng: -0.1276, tone: "radio-gold" },
  "new york": { lat: 40.7128, lng: -74.006, tone: "radio-gold" },
};

function resolveStationGeo(station: Station): GeoPoint {
  if (
    typeof station.latitude === "number" &&
    typeof station.longitude === "number"
  )
    return {
      lat: station.latitude,
      lng: station.longitude,
      label: station.state || station.country,
      precision: "station",
      tone:
        station.country_code === "NG"
          ? "green-gold"
          : station.country_code === "AE"
            ? "blue-gold"
            : "radio-gold",
    };
  const city =
    cityFallbacks[(station.state || "").toLowerCase()] ||
    cityFallbacks[station.country.toLowerCase()];
  if (city)
    return {
      ...city,
      label: station.state || station.country,
      precision: "city",
    };
  const country = countryFallbacks[station.country_code] || countryFallbacks.US;
  return { ...country, label: station.country, precision: "country" };
}

function getStationStreamUrl(station?: Station) {
  return station?.url?.trim() ?? "";
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
    const url = `${window.location.origin}?station=${encodeURIComponent(station.station_uuid || station.id)}`;
    const text = `Listen to ${station.name} on WaveAtlas`;
    if (navigator.share) await navigator.share({ title: station.name, text, url });
    else await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={share} className="rounded-full border border-white/10 px-4 py-2 text-sm transition hover:bg-white/[0.08]">
      {copied ? <Check className="mr-2 inline size-4 text-radio" /> : typeof navigator !== "undefined" && "share" in navigator ? <Share2 className="mr-2 inline size-4" /> : <Copy className="mr-2 inline size-4" />}
      {copied ? "Link copied" : "Share station"}
    </button>
  );
}

function MiniCountryMapCard({ station }: { station: Station }) {
  const geo = useMemo(() => resolveStationGeo(station), [station]);
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
        <p className="mt-1 text-xs text-ivory/50">Fly to {geo.lat.toFixed(2)}, {geo.lng.toFixed(2)}</p>
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

function AudioEngine() {
  const { current, status, volume, userActivated, setStatus } = usePlayer();
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const element = new Audio();
    element.preload = "none";
    element.volume = 1;
    element.muted = false;
    audio.current = element;
    console.info("[WaveAtlas audio] created persistent HTMLAudioElement");

    const onError = () => {
      const code = element.error?.code;
      console.error("[WaveAtlas audio] audio error", {
        code,
        src: element.currentSrc || element.src,
      });
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
    console.info("[WaveAtlas audio] selected stream URL", streamUrl);

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
        console.info("[WaveAtlas audio] play attempt", {
          src: element.src,
          station: current.name,
        });
        element.load();
        await element.play();
        if (!cancelled) {
          console.info("[WaveAtlas audio] play success", {
            src: element.currentSrc || element.src,
            station: current.name,
          });
          setStatus("playing");
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Playback was blocked or the stream failed.";
          console.error("[WaveAtlas audio] play failure", { streamUrl, error });
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
  const geo = useMemo(() => resolveStationGeo(station), [station]);
  useEffect(() => {
    if (!map || !marker) return;
    marker.setLngLat([geo.lng, geo.lat]);
    map.flyTo({
      center: [geo.lng, geo.lat],
      zoom: geo.precision === "station" ? 7 : 4.4,
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

function WaveAtlasMap({ station, mobile = false }: { station: Station; mobile?: boolean }) {
  const status = usePlayer((s) => s.status);
  const container = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<Map | null>(null);
  const [marker, setMarker] = useState<Marker | null>(null);
  const geo = useMemo(() => resolveStationGeo(station), [station]);
  const initialGeo = useRef(geo);
  useEffect(() => {
    if (!container.current) return;
    const start = initialGeo.current;
    const m = new maplibregl.Map({
      container: container.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [start.lng, start.lat],
      zoom: 3.1,
      attributionControl: false,
    });
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    const markerRoot = document.createElement("div");
    markerRoot.className = `station-pulse-marker tone-${start.tone} status-playing`;
    markerRoot.innerHTML =
      '<span class="station-pulse-ring"></span><span class="station-pulse-ring two"></span><span class="station-pulse-dot"></span>';
    const mk = new maplibregl.Marker({ element: markerRoot, anchor: "center" })
      .setLngLat([start.lng, start.lat])
      .addTo(m);
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
      m.remove();
    };
  }, []);
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
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_28%,rgba(7,17,31,.35)_64%,rgba(7,17,31,.72))]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
        <div className="pointer-events-none absolute left-1/2 top-[45%] z-10 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-radio/15 bg-radio/5 blur-sm shadow-[0_0_80px_rgba(88,225,132,.18)]" />
        <div className="pointer-events-none absolute left-1/2 top-[45%] z-20 -translate-x-1/2 -translate-y-1/2"><StationPulseMarker geo={geo} status={status} /></div>
        <div className="pointer-events-none absolute left-4 top-36 z-10 rounded-full border border-radio/20 bg-slate-950/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.22em] text-radio backdrop-blur-xl">
          <Signal className="mr-1 inline size-3" /> Live beacon · {geo.label}
        </div>
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
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(7,17,31,.5))]" />
          <div className="pointer-events-none absolute -right-10 -top-10 z-10 size-40 rounded-full border border-radio/10 shadow-[0_0_80px_rgba(52,211,153,.16)]" />
          <div className="pointer-events-none absolute -bottom-14 left-10 z-10 size-32 rounded-full border border-sky/10 shadow-[0_0_70px_rgba(56,189,248,.14)]" />
          <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-full border border-white/15 bg-slate-950/80 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[.35em] text-emerald-300 shadow-lg backdrop-blur">
            <Signal className="mr-2 inline size-4" />
            Live GIS beacon
          </div>
          <div className="sr-only">
            <StationPulseMarker geo={geo} status={status} />
          </div>
        </div>
        <div className="relative w-full rounded-[1.5rem] border border-slate-700/60 bg-slate-950/90 p-5 shadow-glow backdrop-blur md:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[.28em] text-gold">
            Fly-to signal lock
          </p>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div>
              <b className="text-lg">{station.name}</b>
              <p className="mt-1 text-sm text-ivory/70">
                {station.country} · {station.language || "Unknown language"}
              </p>
              <p className="mt-1 text-xs text-ivory/50">
                {geo.precision} coordinates · {geo.lat.toFixed(3)},{" "}
                {geo.lng.toFixed(3)}
              </p>
            </div>
            <span className="rounded-full bg-radio px-3 py-1 text-xs font-bold text-midnight">
              {status}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
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
            Tune the World.
          </h1>
          <p className="mt-4 max-w-2xl text-ivory/70">
            Spin across live stations with an analog receiver feel: static,
            signal locks, and a map that travels as the audio changes.
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
      <StationIntelligencePanel station={station} stations={stations} setQuery={setQuery} />
    </aside>
  );
}

function MobileBrandBar({ logoLoaded, logoFailed, setLogoLoaded, setLogoFailed }: { logoLoaded: boolean; logoFailed: boolean; setLogoLoaded: (v: boolean) => void; setLogoFailed: (v: boolean) => void }) {
  return (
    <div className="fixed left-0 right-0 top-0 z-40 px-4 pt-3">
      <div className="flex items-center justify-between rounded-full border border-white/10 bg-slate-950/65 px-3 py-2 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-sky/15 text-sky">
            {(!logoLoaded || logoFailed) && <Globe2 className="size-5 animate-pulse" />}
            {!logoFailed && <Image src="/assets/logo/waveatlas-logo.png" alt="WaveAtlas Logo" width={40} height={40} priority className={`absolute inset-0 h-full w-full object-contain transition-opacity ${logoLoaded ? "opacity-100" : "opacity-0"}`} onLoad={() => setLogoLoaded(true)} onError={() => setLogoFailed(true)} />}
          </div>
          <div><b className="text-sm leading-none">WaveAtlas™</b><p className="font-mono text-[9px] uppercase tracking-[.22em] text-gold">Tune the World</p></div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[.18em] text-radio"><span className="size-2 rounded-full bg-radio shadow-[0_0_12px_rgba(88,225,132,.9)]" />Live</span>
      </div>
    </div>
  );
}

function MobileSearchPill({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  return <label className="fixed left-4 right-4 top-[76px] z-40 flex min-h-12 items-center gap-3 rounded-full border border-white/10 bg-slate-950/65 px-4 shadow-2xl backdrop-blur-xl"><Search className="size-4 text-sky" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search country, city, genre, language" className="w-full bg-transparent text-sm outline-none placeholder:text-ivory/45" /></label>;
}

function MobileNowPlayingMini({ station, onOpen }: { station: Station; onOpen: () => void }) {
  const { playing, status, toggle, setStation } = usePlayer();
  const play = () => { if (!usePlayer.getState().current) setStation(station); else toggle(); };
  return <div onClick={onOpen} className="fixed bottom-[78px] left-4 right-4 z-40 rounded-3xl border border-white/10 bg-slate-950/85 p-4 shadow-2xl backdrop-blur-xl">
    <div className="flex items-center gap-3"><button onClick={(e) => { e.stopPropagation(); play(); }} className="grid size-12 shrink-0 place-items-center rounded-full bg-radio text-midnight">{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{station.name}</p><p className="truncate text-xs text-ivory/60">{station.country} · {status}</p><div className="mt-2 flex h-4 items-end gap-0.5">{[30,55,40,75,50,68,35,58].map((h,i)=><span key={i} style={{height:`${h}%`}} className="w-1 rounded-full bg-radio/80" />)}</div></div><SignalMeter score={station.health_score} /></div>
  </div>;
}

function FloatingScanButton({ stations, current }: { stations: Station[]; current: Station }) {
  return <button onClick={() => usePlayer.getState().setStation(stations[(stations.findIndex((s) => s.id === current.id) + 1) % stations.length])} className="fixed bottom-[160px] right-4 z-40 min-h-12 rounded-full border border-gold/40 bg-gold px-4 font-black text-midnight shadow-2xl shadow-gold/20"><ScanLine className="mr-1 inline size-4" />Scan</button>;
}

function MobileMapControls({ setQuery }: { setQuery: (q: string) => void }) {
  return <div className="fixed right-4 top-[140px] z-40 grid gap-2">{[[MapPin,"Locate",()=>setQuery("near me")],[Globe2,"Reset globe",()=>setQuery("")],[Search,"Filter",()=>setQuery("News")],[Heart,"Favorites",()=>setQuery("favorites")]].map(([Icon,label,action]) => { const I = Icon as typeof MapPin; return <button key={label as string} onClick={action as () => void} aria-label={label as string} className="grid size-11 place-items-center rounded-full border border-white/10 bg-slate-950/70 text-ivory shadow-xl backdrop-blur-xl"><I className="size-4" /></button>; })}</div>;
}

function MobileStationSheet({ station, stations, setQuery, open, setOpen }: { station: Station; stations: Station[]; setQuery: (q: string) => void; open: boolean; setOpen: (v: boolean) => void }) {
  return <motion.section drag="y" dragConstraints={{ top: 0, bottom: 0 }} onDragEnd={(_, info) => setOpen(info.offset.y < -40 ? true : info.offset.y > 40 ? false : open)} initial={{ y: 680 }} animate={{ y: open ? 64 : 680 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[2rem] border border-white/10 bg-slate-950/95 px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-3 shadow-2xl backdrop-blur-xl">
    <button onClick={() => setOpen(!open)} className="mx-auto block h-1.5 w-14 rounded-full bg-white/30" aria-label="Toggle Station Intelligence" />
    <StationIntelligencePanel station={station} stations={stations} setQuery={setQuery} />
  </motion.section>;
}

function MobileCommandDock({ mode, setMode }: { mode: string; setMode: (m: string) => void }) {
  return <nav className="fixed bottom-0 left-0 right-0 z-[60] border-t border-white/10 bg-slate-950/85 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl"><div className="grid grid-cols-4 gap-2 rounded-full border border-white/10 bg-white/5 p-1">{[[Compass,"Atlas"],[Radio,"Dial"],[Search,"Discover"],[Heart,"Library"]].map(([Icon,label]) => { const I = Icon as typeof Compass; return <button key={label as string} onClick={() => setMode(label as string)} className={`rounded-full px-2 py-2 text-[11px] font-bold ${mode === label ? "bg-radio text-midnight" : "text-ivory/70"}`}><I className="mx-auto mb-0.5 size-4" />{label as string}</button>; })}</div></nav>;
}

function MobileAtlasShell({ stations, current, query, setQuery, logoLoaded, logoFailed, setLogoLoaded, setLogoFailed }: { stations: Station[]; current: Station; query: string; setQuery: (q: string) => void; logoLoaded: boolean; logoFailed: boolean; setLogoLoaded: (v: boolean) => void; setLogoFailed: (v: boolean) => void }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState("Atlas");
  return <section className="md:hidden relative h-[100dvh] min-h-[100dvh] overflow-hidden overflow-x-hidden bg-slate-950 text-white">
    <WaveAtlasMap station={current} mobile />
    <MobileBrandBar logoLoaded={logoLoaded} logoFailed={logoFailed} setLogoLoaded={setLogoLoaded} setLogoFailed={setLogoFailed} />
    <MobileSearchPill query={query} setQuery={setQuery} />
    <MobileMapControls setQuery={setQuery} />
    <FloatingScanButton stations={stations} current={current} />
    <MobileNowPlayingMini station={current} onOpen={() => setSheetOpen(true)} />
    <MobileStationSheet station={current} stations={stations} setQuery={setQuery} open={sheetOpen || mode !== "Atlas"} setOpen={setSheetOpen} />
    <MobileCommandDock mode={mode} setMode={(m) => { setMode(m); if (m !== "Atlas") setSheetOpen(true); }} />
  </section>;
}

export default function WaveAtlasApp({ stations }: { stations: Station[] }) {
  const current = usePlayer((s) => s.current) ?? stations[0];
  const [query, setQuery] = useState("");
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const visible = stations
    .slice(0, 9)
    .filter(
      (s) =>
        !query ||
        `${s.name} ${s.country} ${s.state} ${s.tags.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  return (
    <>
      <AudioEngine />
      <MobileAtlasShell stations={stations} current={current} query={query} setQuery={setQuery} logoLoaded={logoLoaded} logoFailed={logoFailed} setLogoLoaded={setLogoLoaded} setLogoFailed={setLogoFailed} />
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
              TUNE THE WORLD
            </p>
          </div>
        </div>
        <div className="hidden gap-2 md:flex">
          {["Dial", "Atlas", "Discover", "Library"].map((x) => (
            <span
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-ivory/70"
              key={x}
            >
              {x}
            </span>
          ))}
        </div>
      </nav>
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <RadioDial stations={stations} />
        <NowPlaying station={current} stations={stations} setQuery={setQuery} />
      </div>
      <section className="mx-auto mt-6 grid max-w-7xl gap-6 lg:grid-cols-3">
        <div id="atlas-map" className="scroll-mt-6 lg:col-span-2">
          <WaveAtlasMap station={current} />
        </div>
        <div className="glass rounded-[2rem] p-6">
          <p className="font-mono text-xs uppercase tracking-[.3em] text-gold">
            Atlas scan
          </p>
          <div className="mt-5 aspect-video rounded-3xl border border-sky/20 bg-[radial-gradient(circle,#38BDF833_1px,transparent_2px)] [background-size:28px_28px] p-5">
            <Radar className="animate-pulse text-sky" />
            <p className="mt-16 text-sm text-ivory/60">
              Country clusters ready · {stations.length} validated signals
            </p>
          </div>
          <button
            onClick={() =>
              usePlayer
                .getState()
                .setStation(
                  stations[
                    (stations.findIndex((s) => s.id === current.id) + 1) %
                      stations.length
                  ],
                )
            }
            className="mt-4 w-full rounded-full border border-radio/30 py-3 text-radio"
          >
            <ScanLine className="mr-2 inline" />
            Auto-skip to next healthy signal
          </button>
        </div>
        <div className="glass rounded-[2rem] p-6 lg:col-span-3">
          <div className="flex gap-3">
            <Search className="text-sky" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try: Nigeria, Dubai, jazz, gospel"
              className="w-full bg-transparent outline-none placeholder:text-ivory/40"
            />
          </div>
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
