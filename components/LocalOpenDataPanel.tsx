"use client";
import type { WorldContext } from "@/lib/world-engine/types";
export function LocalOpenDataPanel({ context }: { context: WorldContext | null }) { if (!context) return null; return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="font-display text-xs font-semibold text-gold">Local Open Data</p><p className="mt-2 text-sm text-ivory/65">{context.openData.map((item) => item.description).join(" ")}</p></div>; }
