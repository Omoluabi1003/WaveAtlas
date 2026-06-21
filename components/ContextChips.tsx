"use client";

import { Clock3, CloudSun, Database, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { WorldContext } from "@/lib/world-engine/types";
import type { AmbientTheme } from "@/lib/world-engine/ambient-theme";

function chipTone(confidence?: number) {
  if (typeof confidence !== "number") return "border-white/12 bg-white/[0.055] text-ivory/70";
  if (confidence >= 75) return "border-radio/25 bg-radio/10 text-radio";
  if (confidence >= 50) return "border-gold/25 bg-gold/10 text-gold";
  return "border-white/12 bg-white/[0.055] text-ivory/66";
}

function ContextChip({ icon, label, value, tone = "border-white/12 bg-white/[0.055] text-ivory/72" }: { icon: ReactNode; label: string; value: string; tone?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-lg shadow-black/10 backdrop-blur-xl ${tone}`}>
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="min-w-0 truncate"><span className="text-ivory/42">{label}</span> {value}</span>
    </span>
  );
}

export function ContextChips({ context, theme }: { context: WorldContext | null; theme: AmbientTheme }) {
  const sourceCount = context?.sources.filter((source) => source.status === "success").length ?? 0;
  const confidence = context?.radioDNA.geoConfidence;
  const confidenceLabel = typeof confidence === "number" ? `${Math.round(confidence)}%` : "Estimating";
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      <ContextChip icon={<Clock3 className="size-3.5" />} label="Local" value={context?.radioDNA.localTime ?? "Time pending"} />
      <ContextChip icon={<CloudSun className="size-3.5" />} label="Mood" value={theme.moodLabel} tone={theme.chipStyle} />
      <ContextChip icon={<ShieldCheck className="size-3.5" />} label="Geo" value={confidenceLabel} tone={chipTone(confidence)} />
      <ContextChip icon={<Database className="size-3.5" />} label="Sources" value={sourceCount ? `${sourceCount}` : "Fallback"} />
    </div>
  );
}
