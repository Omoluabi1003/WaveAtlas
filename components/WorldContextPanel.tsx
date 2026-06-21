"use client";

import { ChevronDown, CloudSun, Database, Globe2, Landmark, Leaf, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { WorldContext } from "@/lib/world-engine/types";
import { buildPlaceDescriptor, buildPlaceLabel } from "@/lib/world-engine/place-labels";

function formatEarthquake(event: { magnitude?: number; place?: string; distanceKm: number }) {
  return `M${event.magnitude ?? "?"} · ${Math.round(event.distanceKm)}km`;
}

function climateChips(climate: WorldContext["climate"]) {
  if (!climate) return [];
  return [
    typeof climate.temperatureC === "number" ? `${climate.temperatureC}°C` : null,
    typeof climate.humidityPercent === "number" ? `${climate.humidityPercent}% humidity` : null,
    typeof climate.rainfallMillimeters === "number" ? `${climate.rainfallMillimeters}mm rain` : null,
    typeof climate.solarRadiation === "number" ? `${climate.solarRadiation} solar` : null,
  ].filter(Boolean).slice(0, 4) as string[];
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium text-ivory/68">{children}</span>;
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-white/8 bg-black/10 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold/80">{icon}{title}</div>{children}</div>;
}

export function WorldContextPanel({ context }: { context: WorldContext | null }) {
  if (!context) return null;
  const earthquakes = (context.environment.recentEarthquakes as Array<{ magnitude?: number; place?: string; distanceKm: number }> | undefined) ?? [];
  const climateItems = climateChips(context.climate);
  const attributions = [...new Set(context.sources.map((source) => source.attribution).filter(Boolean))];
  const landmarks = context.radioDNA.nearbyLandmarks.slice(0, 4);
  const summary = context.radioDNA.culturalSummary || String(context.culture.summary ?? "");
  const defaultFacts = [buildPlaceLabel(context), context.radioDNA.localTime, buildPlaceDescriptor(context)].filter(Boolean).slice(0, 3);

  return (
    <details className="group rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-ivory/70 transition hover:border-white/15 hover:bg-white/[0.045]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">World Context</span>
          <span className="mt-2 flex flex-wrap gap-2">{defaultFacts.map((fact) => <Chip key={fact}>{fact}</Chip>)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[11px] text-ivory/58">Explore layers<ChevronDown className="size-3.5 transition group-open:rotate-180" /></span>
      </summary>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Section icon={<Globe2 className="size-4" />} title="Place"><p className="leading-6 text-ivory/70">{buildPlaceLabel(context)}</p></Section>
        <Section icon={<CloudSun className="size-4" />} title="Atmosphere"><div className="flex flex-wrap gap-2">{climateItems.length ? climateItems.map((item) => <Chip key={item}>{item}</Chip>) : <Chip>Atmosphere pending</Chip>}</div><p className="mt-2 text-[11px] text-ivory/42">NASA POWER optional climate context</p></Section>
        <Section icon={<Sparkles className="size-4" />} title="Culture"><p className="line-clamp-3 leading-6 text-ivory/70">{summary || "Cultural signal pending from open sources."}</p></Section>
        <Section icon={<Landmark className="size-4" />} title="Nearby"><div className="flex flex-wrap gap-2">{landmarks.length ? landmarks.map((item) => <Chip key={item}>{item}</Chip>) : <Chip>Landmarks pending</Chip>}</div></Section>
        <Section icon={<Leaf className="size-4" />} title="Earth"><div className="flex flex-wrap gap-2">{earthquakes.length ? earthquakes.slice(0, 3).map((event) => <Chip key={`${event.place}-${event.distanceKm}`}>{formatEarthquake(event)}</Chip>) : <Chip>No nearby USGS events</Chip>}</div></Section>
        <Section icon={<Database className="size-4" />} title="Sources"><p className="leading-6 text-ivory/58">{attributions.slice(0, 6).join(" · ") || "Local fallback geography"}</p></Section>
      </div>
    </details>
  );
}
