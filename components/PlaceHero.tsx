"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Clock3, MapPin, Radio, ShieldCheck, Waves } from "lucide-react";
import type { WorldContext } from "@/lib/world-engine/types";
import { getAmbientTheme } from "@/lib/world-engine/ambient-theme";
import { buildAtmosphereLine, buildPlaceLabel, buildStationLine } from "@/lib/world-engine/place-labels";

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
  const confidence = context?.radioDNA.geoConfidence;
  const confidenceLabel = typeof confidence === "number" ? `${Math.round(confidence)}% geo` : "Geo estimating";
  const localTime = context?.radioDNA.localTime ?? "Local time pending";

  return (
    <section
      className="relative isolate overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950/58 px-3 py-2.5 text-left shadow-[0_14px_45px_rgba(0,0,0,.24)] backdrop-blur-xl sm:px-4"
      style={{ boxShadow: theme.glowIntensity }}
    >
      <div className="absolute inset-0 opacity-65" style={{ background: theme.backgroundGradient }} />
      <div className="absolute inset-0 bg-slate-950/62" />
      <div className="relative flex min-w-0 items-center gap-3">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full border border-white/12 bg-black/20 shadow-inner shadow-white/5">
          <motion.span aria-hidden="true" className={`absolute size-2.5 rounded-full ${isPlaying ? "bg-radio" : "bg-gold"}`} animate={reducedMotion ? undefined : { scale: isPlaying ? [1, 1.35, 1] : [1, 1.08, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: isPlaying ? 1.8 : 4.5, repeat: Infinity, ease: "easeInOut" }} />
          <span className={`absolute size-7 rounded-full border ${isPlaying ? "border-radio/45" : "border-gold/35"}`} />
          <Waves className="relative size-4 text-white/70" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="size-3.5 shrink-0 text-gold" />
            <h2 className="truncate font-display text-sm font-black tracking-[-0.025em] text-white sm:text-base">{label}</h2>
            <span className="hidden truncate text-xs font-medium text-ivory/46 sm:inline">{stationLine}</span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-ivory/64">
            <span className="inline-flex min-w-0 items-center gap-1"><Radio className="size-3 shrink-0 text-radio" /><span className="truncate">{stationName}</span></span>
            <span className="inline-flex items-center gap-1"><Clock3 className="size-3 text-sky" />{localTime}</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3 text-gold" />{confidenceLabel}</span>
            <span className="hidden truncate sm:inline">{atmosphereLine}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
