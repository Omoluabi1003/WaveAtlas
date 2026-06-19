"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import { AnimatePresence, motion } from "framer-motion";
import {
  Compass,
  Globe2,
  Heart,
  MapPin,
  Pause,
  Play,
  Radar,
  Radio,
  ScanLine,
  Search,
  Share2,
  Signal,
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

function WaveAtlasMap({ station }: { station: Station }) {
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
    requestAnimationFrame(() => m.resize());
    m.once("load", () => requestAnimationFrame(() => m.resize()));
    return () => m.remove();
  }, []);
  useEffect(() => {
    if (!map || !marker) return;
    const element = marker.getElement();
    element.className = `station-pulse-marker tone-${geo.tone} status-${status}`;
    element.innerHTML =
      '<span class="station-pulse-ring"></span><span class="station-pulse-ring two"></span><span class="station-pulse-dot"></span>';
    requestAnimationFrame(() => map.resize());
  }, [geo.tone, map, marker, station, status]);
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
function NowPlaying({ station }: { station: Station }) {
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
    </aside>
  );
}

export default function WaveAtlasApp({ stations }: { stations: Station[] }) {
  const current = usePlayer((s) => s.current) ?? stations[0];
  const [query, setQuery] = useState("");
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
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#12385a,transparent_35%),#07111F] p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:p-8">
      <AudioEngine />
      <nav className="mx-auto mb-6 flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-sky/15 p-3 text-sky">
            <Globe2 />
          </div>
          <div>
            <b className="text-xl">WaveAtlas</b>
            <p className="font-mono text-[10px] uppercase tracking-[.28em] text-gold">
              Tune the World
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
        <NowPlaying station={current} />
      </div>
      <section className="mx-auto mt-6 grid max-w-7xl gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
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
  );
}
