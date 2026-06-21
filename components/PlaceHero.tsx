"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Clock3, MapPin, Radio } from "lucide-react";
import type { WorldContext } from "@/lib/world-engine/types";
import { getAmbientTheme } from "@/lib/world-engine/ambient-theme";
import { buildPlaceDescriptor, buildPlaceLabel, buildStationLine } from "@/lib/world-engine/place-labels";

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
  const descriptor = context ? buildPlaceDescriptor(context) : "Resolving local atmosphere";
  const stationLine = buildStationLine(context, stationName);
  const localTime = context?.radioDNA.localTime;

  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 p-5 text-left shadow-2xl shadow-black/25" style={{ background: theme.backgroundGradient }}>
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:36px_36px]" />
      <motion.div
        aria-hidden="true"
        className="absolute -right-14 -top-14 size-44 rounded-full bg-radio/10 blur-2xl"
        animate={reducedMotion ? undefined : { opacity: isPlaying ? [0.35, 0.7, 0.35] : [0.22, 0.38, 0.22], scale: isPlaying ? [1, 1.08, 1] : [1, 1.03, 1] }}
        transition={{ duration: isPlaying ? 2.8 : 5.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ boxShadow: theme.glowIntensity }}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${theme.chipStyle}`}><MapPin className="size-3.5" />Audio Earth</span>
            {localTime ? <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[11px] text-ivory/62"><Clock3 className="size-3.5" />{localTime}</span> : null}
          </div>
          <h2 className="mt-4 font-display text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">{label}</h2>
          <p className="mt-2 text-sm font-medium text-ivory/72">{theme.moodLabel} · {descriptor}</p>
          <p className="mt-2 flex items-center gap-2 text-sm text-ivory/58"><Radio className="size-4 text-gold" />{stationLine}</p>
        </div>
        <span className="relative mt-1 flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20">
          <span className={`absolute size-3 rounded-full ${isPlaying ? "bg-radio" : "bg-gold"}`} />
          <span className={`absolute size-7 rounded-full border ${isPlaying ? "border-radio/45" : "border-gold/35"}`} />
        </span>
      </div>
    </section>
  );
}
