"use client";

import { ChevronDown, Clock3, Database, Landmark, MapPin, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
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

function PanelSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-white/8 bg-white/[0.035] px-3.5 py-3 transition hover:border-white/14 hover:bg-white/[0.055]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-ivory/58 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">{icon}{title}</span>
        <ChevronDown className="size-3.5 transition group-open:rotate-180" />
      </summary>
      <div className="mt-3 text-sm leading-6 text-ivory/70">{children}</div>
    </details>
  );
}

export function RadioDNA({ context, status = "idle" }: { context: WorldContext | null; status?: RadioDNAStatus }) {
  const dna = context?.radioDNA;
  const successfulSources = context?.sources.filter((source) => source.status === "success" && source.source !== "NASA POWER") ?? [];
  const sourceCount = successfulSources.length;
  const openDataCount = context?.openData.length ?? 0;

  if (status === "loading") {
    return (
      <section className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025))] p-4 text-left shadow-2xl shadow-black/20">
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
      <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-4 text-left">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">Radio DNA</p>
        <p className="mt-2 text-sm text-ivory/62">Place context will appear when open-data geography is available for this station.</p>
      </section>
    );
  }

  const place = compactList([dna.nearestCity, dna.region, dna.country], "Place inferred");
  const geoConfidence = Math.max(0, Math.min(100, dna.geoConfidence ?? 0));
  const isLowConfidence = geoConfidence < 50;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(214,168,79,.13),transparent_34%),linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.026))] p-4 text-left shadow-2xl shadow-black/25">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">Radio DNA</p>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-white">{dna.country ?? "Open-data place context"}</h3>
          <p className="mt-1 text-xs text-ivory/48">A calm geographic read on the station you are hearing.</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${confidenceTone(geoConfidence)}`}>{geoConfidence}% geo</span>
      </div>

      {isLowConfidence ? <p className="mt-4 rounded-2xl border border-gold/20 bg-gold/10 px-3 py-2 text-xs leading-5 text-gold/85">Low confidence: treating this as country-level context until stronger station geography is available.</p> : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-black/10 p-3"><MapPin className="mb-2 size-4 text-gold" /><p className="text-[11px] uppercase tracking-[0.18em] text-ivory/42">Place</p><p className="mt-1 truncate text-sm font-semibold text-white">{place}</p></div>
        <div className="rounded-2xl border border-white/8 bg-black/10 p-3"><Clock3 className="mb-2 size-4 text-gold" /><p className="text-[11px] uppercase tracking-[0.18em] text-ivory/42">Local time</p><p className="mt-1 text-sm font-semibold text-white">{dna.localTime ?? "Pending"}</p></div>
        <div className="rounded-2xl border border-white/8 bg-black/10 p-3"><ShieldCheck className="mb-2 size-4 text-gold" /><p className="text-[11px] uppercase tracking-[0.18em] text-ivory/42">Confidence</p><p className="mt-1 text-sm font-semibold text-white">{confidenceLabel(geoConfidence)}</p></div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${confidenceTone(geoConfidence)}`}>{confidenceLabel(geoConfidence)}</span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-ivory/60">{sourceCount} sources</span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-ivory/60">{openDataCount ? "Open data ready" : "Open data pending"}</span>
      </div>

      <div className="mt-4 space-y-2">
        <PanelSection icon={<Sparkles className="size-3.5 text-gold" />} title="Cultural signal"><p>{dna.culturalSummary || "Cultural summary pending."}</p></PanelSection>
        <PanelSection icon={<Landmark className="size-3.5 text-gold" />} title="Landmarks"><p>{dna.nearbyLandmarks.length ? dna.nearbyLandmarks.slice(0, 5).join(" · ") : "Nearby landmarks pending."}</p></PanelSection>
        <PanelSection icon={<UsersRound className="size-3.5 text-gold" />} title="People"><p>{compactList([dna.languages.join(", "), dna.currency], "People data pending")}</p></PanelSection>
        <PanelSection icon={<Database className="size-3.5 text-gold" />} title="Sources"><p>{successfulSources.map((source) => source.attribution).filter(Boolean).slice(0, 4).join(" · ") || "Local fallback geography"}</p></PanelSection>
      </div>
    </section>
  );
}
