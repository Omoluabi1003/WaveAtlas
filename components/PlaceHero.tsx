"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, MapPin, Radio, Waves } from "lucide-react";
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
      className="relative isolate max-h-40 overflow-hidden rounded-[1.45rem] border border-white/12 px-3.5 py-3 text-left shadow-2xl shadow-black/20 backdrop-blur-2xl sm:px-4"
      style={{ background: theme.backgroundGradient }}
    >
      <div className="absolute inset-0 bg-slate-950/45" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] [background-size:34px_34px]" />
      <motion.div
        aria-hidden="true"
        className="absolute -right-10 -top-14 size-32 rounded-full bg-radio/10 blur-2xl"
        animate={reducedMotion ? undefined : { opacity: isPlaying ? [0.24, 0.48, 0.24] : [0.16, 0.28, 0.16], scale: isPlaying ? [1, 1.1, 1] : [1, 1.04, 1] }}
        transition={{ duration: isPlaying ? 2.9 : 6.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ boxShadow: theme.glowIntensity }}
      />

      <div className="relative flex min-w-0 items-center gap-3 md:items-start">
        <span className="relative mt-0.5 hidden size-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-black/20 shadow-inner shadow-white/5 sm:flex">
          <motion.span aria-hidden="true" className={`absolute size-2.5 rounded-full ${isPlaying ? "bg-radio" : "bg-gold"}`} animate={reducedMotion ? undefined : { scale: isPlaying ? [1, 1.35, 1] : [1, 1.08, 1] }} transition={{ duration: isPlaying ? 1.8 : 4.5, repeat: Infinity, ease: "easeInOut" }} />
          <span className={`absolute size-7 rounded-full border ${isPlaying ? "border-radio/45" : "border-gold/35"}`} />
          <Waves className="relative size-4 text-white/70" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`hidden shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] sm:inline-flex ${theme.chipStyle}`}><MapPin className="size-3" />Audio Earth</span>
            <h2 className="truncate font-display text-base font-black tracking-[-0.035em] text-white sm:text-xl">{label}</h2>
          </div>
          <p className="mt-1 truncate text-xs font-medium text-ivory/72 sm:text-sm">{atmosphereLine}</p>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold text-ivory/62"><Radio className="size-3 shrink-0 text-gold" /><span className="truncate">{stationLine}</span></p>
          <div className="mt-2 hidden sm:block [&>*:nth-child(n+4)]:hidden">
            <ContextChips context={context} theme={theme} />
          </div>
        </div>
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium text-ivory/70">Explore layers<ChevronDown className="size-3" /></span>
      </div>
    </section>
  );
}
