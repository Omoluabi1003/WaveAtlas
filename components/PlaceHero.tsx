"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MapPin, Radio, Waves } from "lucide-react";
import type { WorldContext } from "@/lib/world-engine/types";
import { getAmbientTheme } from "@/lib/world-engine/ambient-theme";
import { buildAtmosphereLine, buildPlaceLabel, buildStationLine } from "@/lib/world-engine/place-labels";
import { ContextChips } from "@/components/ContextChips";

type PlaceHeroProps = {
  context: WorldContext | null;
  stationName: string;
  fallbackPlace?: string;
  isPlaying?: boolean;
};

export function PlaceHero({ context, stationName, fallbackPlace, isPlaying = false }: PlaceHeroProps) {
  const reducedMotion = useReducedMotion();
  const theme = getAmbientTheme(context);
  const label = context ? buildPlaceLabel(context) : fallbackPlace || "Tuning destination";
  const atmosphereLine = buildAtmosphereLine(context, theme);
  const stationLine = buildStationLine(context, stationName);

  return (
    <section
      className="relative isolate overflow-hidden rounded-[2.25rem] border border-white/10 px-5 py-6 text-left shadow-2xl shadow-black/30 sm:px-7 sm:py-8"
      style={{ background: theme.backgroundGradient }}
    >
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/35 to-transparent" />
      <motion.div
        aria-hidden="true"
        className="absolute -right-20 -top-20 size-64 rounded-full bg-radio/10 blur-3xl"
        animate={reducedMotion ? undefined : { opacity: isPlaying ? [0.32, 0.72, 0.32] : [0.18, 0.34, 0.18], scale: isPlaying ? [1, 1.12, 1] : [1, 1.04, 1] }}
        transition={{ duration: isPlaying ? 2.9 : 6.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ boxShadow: theme.glowIntensity }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute left-6 top-8 h-px w-2/3 bg-gradient-to-r from-white/0 via-white/35 to-white/0"
        animate={reducedMotion ? undefined : { opacity: isPlaying ? [0.25, 0.6, 0.25] : [0.18, 0.3, 0.18] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${theme.chipStyle}`}><MapPin className="size-3.5" />Audio Earth</span>
          <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/20 shadow-inner shadow-white/5">
            <motion.span aria-hidden="true" className={`absolute size-3 rounded-full ${isPlaying ? "bg-radio" : "bg-gold"}`} animate={reducedMotion ? undefined : { scale: isPlaying ? [1, 1.35, 1] : [1, 1.08, 1] }} transition={{ duration: isPlaying ? 1.8 : 4.5, repeat: Infinity, ease: "easeInOut" }} />
            <span className={`absolute size-8 rounded-full border ${isPlaying ? "border-radio/45" : "border-gold/35"}`} />
            <Waves className="relative size-5 text-white/70" />
          </span>
        </div>

        <h2 className="mt-7 max-w-4xl font-display text-4xl font-black leading-[0.95] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">{label}</h2>
        <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-ivory/78 sm:text-lg">{atmosphereLine}</p>
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-ivory/70"><Radio className="size-4 text-gold" />{stationLine}</p>
        <ContextChips context={context} theme={theme} />
      </div>
    </section>
  );
}
