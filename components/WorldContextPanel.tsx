"use client";

import { ChevronDown, CloudSun, Database, Globe2, Leaf, UsersRound } from "lucide-react";
import type { WorldContext } from "@/lib/world-engine/types";

function formatEarthquake(event: { magnitude?: number; place?: string; distanceKm: number }) {
  return `M${event.magnitude ?? "?"} ${event.place ?? "nearby event"} · ${event.distanceKm}km`;
}

function climateChips(climate: WorldContext["climate"]) {
  if (!climate) return [];
  return [
    typeof climate.temperatureC === "number" ? `🌡 ${climate.temperatureC}°C` : null,
    typeof climate.humidityPercent === "number" ? `💧 ${climate.humidityPercent}%` : null,
    typeof climate.windSpeedMetersPerSecond === "number" ? `💨 ${climate.windSpeedMetersPerSecond} m/s` : null,
    typeof climate.rainfallMillimeters === "number" ? `🌧 ${climate.rainfallMillimeters} mm` : null,
    typeof climate.solarRadiation === "number" ? `☀️ ${climate.solarRadiation} kWh/m²` : null,
  ].filter(Boolean).slice(0, 4) as string[];
}

export function WorldContextPanel({ context }: { context: WorldContext | null }) {
  if (!context) return null;
  const earthquakes = (context.environment.recentEarthquakes as Array<{ magnitude?: number; place?: string; distanceKm: number }> | undefined) ?? [];
  const attributions = context.sources.map((source) => source.attribution).filter(Boolean);
  const hasCoordinates = typeof (context.place.coordinates as { lat?: unknown; lng?: unknown } | undefined)?.lat === "number" && typeof (context.place.coordinates as { lat?: unknown; lng?: unknown } | undefined)?.lng === "number";
  const climateSource = context.sources.find((source) => source.source === "NASA POWER");
  const climateItems = climateChips(context.climate);

  return (
    <details className="group rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4 text-sm text-ivory/70 transition hover:border-white/15 hover:bg-white/[0.05]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">World Context</span>
          <span className="mt-1 block text-xs text-ivory/45">Open-data appendix, collapsed by default.</span>
        </span>
        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[11px] text-ivory/58">
          {context.openData.length} data layers
          <ChevronDown className="size-3.5 transition group-open:rotate-180" />
        </span>
      </summary>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
          <Globe2 className="mb-2 size-4 text-gold" />
          <b className="text-white">Place</b>
          <p className="mt-1 leading-6">{String(context.place.nearestCity ?? context.place.country ?? "Fallback geography active")}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
          <UsersRound className="mb-2 size-4 text-gold" />
          <b className="text-white">People</b>
          <p className="mt-1 leading-6">{context.radioDNA.languages.join(", ") || "Languages pending"} · {context.radioDNA.currency ?? "Currency pending"}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
          <Leaf className="mb-2 size-4 text-gold" />
          <b className="text-white">Environment</b>
          <p className="mt-1 leading-6">{earthquakes.length ? earthquakes.slice(0, 3).map(formatEarthquake).join("; ") : "No recent nearby USGS events found."}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
          <Database className="mb-2 size-4 text-gold" />
          <b className="text-white">Open Data</b>
          <p className="mt-1 leading-6">{context.openData.map((data) => data.name).join(" · ") || "Open-data layers pending."}</p>
        </div>
      </div>

      {hasCoordinates ? (
        <details className="group/climate mt-4 rounded-2xl border border-white/8 bg-black/10 p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <CloudSun className="size-4 text-gold" />
              <span>
                <b className="block text-white">Climate Context</b>
                <span className="text-xs text-ivory/45">NASA POWER atmosphere, optional and secondary.</span>
              </span>
            </span>
            <ChevronDown className="size-3.5 text-ivory/55 transition group-open/climate:rotate-180" />
          </summary>
          <div className="mt-3">
            {climateSource?.status === "success" && climateItems.length ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {climateItems.map((item) => <span key={item} className="rounded-full border border-gold/20 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-ivory/78 shadow-inner">{item}</span>)}
                </div>
                <p className="mt-2 text-[11px] text-ivory/42">Daily point context{context.climate?.date ? ` · ${context.climate.date}` : ""} · NASA POWER</p>
              </>
            ) : (
              <p className="text-xs leading-5 text-ivory/48">{climateSource?.status === "error" || climateSource?.status === "unavailable" ? "Climate data unavailable for this location." : "NASA climate context unavailable."}</p>
            )}
          </div>
        </details>
      ) : null}
      <p className="mt-4 text-xs leading-5 text-ivory/42">Attribution: {attributions.join(" · ") || "Local fallback geography"}</p>
    </details>
  );
}
