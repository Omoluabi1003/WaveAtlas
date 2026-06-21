"use client";

import { Globe2, Landmark, Languages, MapPin } from "lucide-react";
import type { WorldContext } from "@/lib/world-engine/types";

function formatPopulation(value?: number) {
  return typeof value === "number" ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value) : "Population unavailable";
}

export function RadioDNA({ context }: { context: WorldContext | null }) {
  const dna = context?.radioDNA;
  if (!dna || (!dna.country && !dna.culturalSummary && !dna.nearbyLandmarks.length)) return null;
  const facts = [dna.localTime, dna.languages[0], dna.currency].filter(Boolean).slice(0, 3);
  return (
    <section className="rounded-2xl border border-radio/20 bg-radio/10 p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-radio">Radio DNA</p>
          <h3 className="mt-1 text-base font-semibold text-white">{dna.country ?? "Open-data place context"}</h3>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-ivory/70">Geo {dna.geoConfidence}%</span>
      </div>
      {dna.culturalSummary ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-ivory/72">{dna.culturalSummary}</p> : null}
      <div className="mt-3 grid gap-2 text-xs text-ivory/70 sm:grid-cols-3">
        <span><MapPin className="mr-1 inline size-3 text-gold" />{dna.nearestCity ?? dna.region ?? "Place inferred"}</span>
        <span><Languages className="mr-1 inline size-3 text-gold" />{facts.join(" · ") || "Local facts pending"}</span>
        <span><Globe2 className="mr-1 inline size-3 text-gold" />{formatPopulation(dna.population)}</span>
      </div>
      {dna.nearbyLandmarks.length ? <p className="mt-2 text-xs text-ivory/55"><Landmark className="mr-1 inline size-3 text-gold" />Nearby: {dna.nearbyLandmarks.slice(0, 3).join(", ")}</p> : null}
      <p className="mt-3 text-[11px] text-ivory/45">Sources: {context.sources.filter((s) => s.status === "success").map((s) => s.attribution).slice(0, 4).join(" · ") || "local fallback geography"}</p>
    </section>
  );
}
