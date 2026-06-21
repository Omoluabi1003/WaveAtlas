"use client";

import type { WorldContext } from "@/lib/world-engine/types";

export function WorldContextPanel({ context }: { context: WorldContext | null }) {
  if (!context) return null;
  const earthquakes = (context.environment.recentEarthquakes as Array<{ magnitude?: number; place?: string; distanceKm: number }> | undefined) ?? [];
  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-ivory/72">
      <summary className="cursor-pointer font-display text-xs font-semibold uppercase tracking-[0.22em] text-gold">World Context · open data</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><b className="text-white">Place</b><p className="mt-1">{String(context.place.nearestCity ?? context.place.country ?? "Fallback geography active")}</p></div>
        <div><b className="text-white">People</b><p className="mt-1">{context.radioDNA.languages.join(", ") || "Languages pending"} · {context.radioDNA.currency ?? "Currency pending"}</p></div>
        <div><b className="text-white">Environment</b><p className="mt-1">{earthquakes.length ? earthquakes.map((q) => `M${q.magnitude ?? "?"} ${q.place} (${q.distanceKm}km)`).join("; ") : "No recent nearby USGS events found."}</p></div>
        <div><b className="text-white">Open Data</b><p className="mt-1">{context.openData.map((d) => d.name).join(" · ")}</p></div>
      </div>
      <p className="mt-4 text-xs text-ivory/45">Attribution: {context.sources.map((s) => s.attribution).filter(Boolean).join(" · ")}</p>
    </details>
  );
}
