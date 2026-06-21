"use client";

import { ChevronDown, Clock3, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import type { WorldContext } from "@/lib/world-engine/types";

type RadioDNAStatus = "idle" | "loading" | "ready" | "empty";

function compactList(values: Array<string | undefined>, fallback: string) {
  const clean = values.filter(Boolean) as string[];
  return clean.length ? clean.join(" · ") : fallback;
}

function confidenceTone(confidence: number) {
  if (confidence >= 75) return "border-radio/30 bg-radio/10 text-radio";
  if (confidence >= 50) return "border-gold/30 bg-gold/10 text-gold";
  return "border-white/10 bg-white/[0.04] text-ivory/58";
}

function confidenceLabel(confidence: number) {
  if (confidence >= 75) return "High confidence";
  if (confidence >= 50) return "Medium confidence";
  return "Low confidence";
}

export function RadioDNA({ context, status = "idle" }: { context: WorldContext | null; status?: RadioDNAStatus }) {
  const dna = context?.radioDNA;
  const successfulSources = context?.sources.filter((source) => source.status === "success" && source.source !== "NASA POWER") ?? [];
  const sourceCount = successfulSources.length;
  const openDataCount = context?.openData.length ?? 0;

  if (status === "loading") {
    return (
      <section className="rounded-[1.5rem] border border-white/8 bg-white/[0.025] p-4 text-left shadow-lg shadow-black/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">Radio DNA</p>
            <div className="mt-3 h-5 w-44 animate-pulse rounded-full bg-white/10" />
          </div>
          <div className="h-7 w-24 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-white/[0.055]" />)}
        </div>
      </section>
    );
  }

  if (!dna || (!dna.country && !dna.nearestCity && !dna.localTime)) {
    return (
      <section className="rounded-[1.5rem] border border-white/8 bg-white/[0.025] p-4 text-left">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">Radio DNA</p>
        <p className="mt-2 text-sm text-ivory/62">Place context will appear when open-data geography is available for this station.</p>
      </section>
    );
  }

  const place = compactList([dna.nearestCity, dna.region, dna.country], "Place inferred");
  const geoConfidence = Math.max(0, Math.min(100, dna.geoConfidence ?? 0));
  const isLowConfidence = geoConfidence < 50;

  return (
    <details className="group overflow-hidden rounded-[1.5rem] border border-white/8 bg-white/[0.025] p-4 text-left shadow-lg shadow-black/10">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">Radio DNA</p>
          <h3 className="mt-1.5 text-base font-semibold tracking-tight text-white/88">Station signal profile</h3>
          <p className="mt-1 text-xs text-ivory/48">Playback-safe metadata and supporting context.</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${confidenceTone(geoConfidence)}`}>{geoConfidence}% geo</span>
      </summary>

      {isLowConfidence ? <p className="mt-4 rounded-2xl border border-gold/20 bg-gold/10 px-3 py-2 text-xs leading-5 text-gold/85">Low confidence: treating this as country-level context until stronger station geography is available.</p> : null}

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-ivory/58">
        <span className="rounded-full border border-white/8 bg-black/10 px-2.5 py-1"><MapPin className="mr-1 inline size-3 text-gold/80" />{place}</span>
        <span className="rounded-full border border-white/8 bg-black/10 px-2.5 py-1"><Clock3 className="mr-1 inline size-3 text-gold/80" />{dna.localTime ?? "Time pending"}</span>
        <span className={`rounded-full border px-2.5 py-1 ${confidenceTone(geoConfidence)}`}><ShieldCheck className="mr-1 inline size-3" />{confidenceLabel(geoConfidence)}</span>
        <span className="rounded-full border border-white/8 bg-black/10 px-2.5 py-1">{openDataCount ? "Open data ready" : "Open data pending"}</span>
      </div>

      <details className="group/support mt-4 rounded-2xl border border-white/8 bg-black/10 px-3.5 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-ivory/58 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><Sparkles className="size-3.5 text-gold" />Supporting intelligence</span>
          <ChevronDown className="size-3.5 transition group-open/support:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-2 text-sm leading-6 text-ivory/70 sm:grid-cols-2">
          <p><b className="text-ivory/90">Culture:</b> {dna.culturalSummary || "Pending."}</p>
          <p><b className="text-ivory/90">Nearby:</b> {dna.nearbyLandmarks.length ? dna.nearbyLandmarks.slice(0, 4).join(" · ") : "Pending."}</p>
          <p><b className="text-ivory/90">People:</b> {compactList([dna.languages.join(", "), dna.currency], "Pending")}</p>
          <p><b className="text-ivory/90">Sources:</b> {sourceCount ? successfulSources.map((source) => source.source).slice(0, 4).join(" · ") : "Fallback"}</p>
        </div>
      </details>
    </details>
  );
}
