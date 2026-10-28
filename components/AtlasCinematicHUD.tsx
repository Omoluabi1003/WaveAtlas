"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import type { AtlasAudioSpectrum } from "@/lib/atlas-audio-spectrum";

type StationContext = {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  station_uuid?: string;
  id?: string;
} | null;

type PlaybackContext = { status?: string };

const EMPTY_SPECTRUM: AtlasAudioSpectrum = { energy: 0, bass: 0, mid: 0, treble: 0, source: "unavailable" };

function locationLabel(station: StationContext) {
  if (!station) return "GLOBAL SIGNAL";
  return [station.city || station.state, station.country].filter(Boolean).join(" · ") || "GLOBAL SIGNAL";
}

export function AtlasCinematicHUD() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [station, setStation] = useState<StationContext>(null);
  const [status, setStatus] = useState("idle");
  const [spectrum, setSpectrum] = useState<AtlasAudioSpectrum>(EMPTY_SPECTRUM);
  const [lockPulse, setLockPulse] = useState(0);
  const reducedMotion = Boolean(useReducedMotion());

  useEffect(() => {
    const sync = () => setTarget(document.querySelector<HTMLElement>(".waveatlas-globe-shell"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let pulseTimer = 0;
    const onStation = (event: Event) => {
      const next = (event as CustomEvent<StationContext>).detail;
      setStation(next);
      setLockPulse(value => value + 1);
      window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => setLockPulse(value => value + 1), 1450);
    };
    const onPlayback = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackContext>).detail;
      if (detail?.status) setStatus(detail.status);
    };
    const onSpectrum = (event: Event) => {
      const detail = (event as CustomEvent<AtlasAudioSpectrum>).detail;
      if (detail) setSpectrum(detail);
    };
    window.addEventListener("waveatlas:station-context", onStation);
    window.addEventListener("waveatlas:playback-context", onPlayback);
    window.addEventListener("waveatlas:audio-spectrum", onSpectrum);
    window.dispatchEvent(new Event("waveatlas:request-station-context"));
    window.dispatchEvent(new Event("waveatlas:request-playback-context"));
    return () => {
      window.clearTimeout(pulseTimer);
      window.removeEventListener("waveatlas:station-context", onStation);
      window.removeEventListener("waveatlas:playback-context", onPlayback);
      window.removeEventListener("waveatlas:audio-spectrum", onSpectrum);
    };
  }, []);

  const active = status === "playing" || status === "buffering";
  const bands = useMemo(() => [spectrum.bass, spectrum.mid, spectrum.treble], [spectrum.bass, spectrum.mid, spectrum.treble]);
  if (!target || !station) return null;

  const hud = (
    <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden" aria-hidden="true" data-cinematic-hud="v1">
      <div className="absolute left-[6%] top-[7%] h-7 w-7 border-l border-t border-emerald-200/45" />
      <div className="absolute right-[6%] top-[7%] h-7 w-7 border-r border-t border-sky-200/35" />
      <div className="absolute bottom-[8%] left-[6%] h-7 w-7 border-b border-l border-sky-200/30" />
      <div className="absolute bottom-[8%] right-[6%] h-7 w-7 border-b border-r border-emerald-200/40" />

      <AnimatePresence mode="wait">
        <motion.div
          key={`${station.station_uuid || station.id || station.name}-${lockPulse}`}
          initial={reducedMotion ? false : { opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: 5 }}
          transition={{ duration: reducedMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-1/2 top-[8%] -translate-x-1/2 rounded-full border border-emerald-200/20 bg-slate-950/45 px-3 py-1.5 text-center shadow-[0_0_28px_rgba(86,245,187,.10)] backdrop-blur-md"
        >
          <div className="font-mono text-[7px] font-bold uppercase tracking-[.28em] text-emerald-200/70">Signal lock</div>
          <div className="mt-0.5 max-w-[62vw] truncate font-display text-[10px] font-semibold text-white/90">{station.name}</div>
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-[10%] left-[8%] max-w-[42%]">
        <div className="font-mono text-[7px] font-bold uppercase tracking-[.22em] text-sky-200/55">Live Earth</div>
        <div className="mt-1 truncate font-display text-[10px] font-semibold text-white/78">{locationLabel(station)}</div>
      </div>

      <div className="absolute bottom-[9%] right-[8%] min-w-[92px]">
        <div className="flex items-center justify-end gap-1.5">
          {bands.map((value, index) => {
            const fallback = active ? [0.62, 0.46, 0.32][index] : 0.12;
            const level = spectrum.source === "analyser" ? Math.max(0.08, value) : fallback;
            return (
              <motion.span
                key={index}
                className="block w-1 rounded-full bg-gradient-to-t from-emerald-300/55 via-sky-300/75 to-amber-200/80 shadow-[0_0_8px_rgba(98,217,255,.22)]"
                animate={{ height: 5 + level * 22, opacity: 0.42 + level * 0.58 }}
                transition={{ duration: 0.12, ease: "linear" }}
              />
            );
          })}
        </div>
        <div className="mt-1 text-right font-mono text-[6px] font-bold uppercase tracking-[.18em] text-white/38">
          {spectrum.source === "analyser" ? "Live spectrum" : active ? "State reactive" : "Signal idle"}
        </div>
      </div>

      <motion.div
        key={`pulse-${lockPulse}`}
        initial={reducedMotion ? false : { opacity: 0.55, scale: 0.72 }}
        animate={reducedMotion ? { opacity: 0.14 } : { opacity: 0, scale: 1.18 }}
        transition={{ duration: reducedMotion ? 0 : 1.25, ease: "easeOut" }}
        className="absolute left-1/2 top-1/2 aspect-square w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/25 shadow-[0_0_56px_rgba(86,245,187,.10)]"
      />
    </div>
  );

  return createPortal(hud, target);
}
