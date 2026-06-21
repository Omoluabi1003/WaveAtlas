"use client";

import type { AmbientTheme } from "@/lib/world-engine/ambient-theme";

export function SpatialAtmosphere({ theme, intensity = "strong" }: { theme: AmbientTheme; intensity?: "subtle" | "strong" }) {
  const opacity = intensity === "strong" ? 0.54 : 0.26;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" style={{ opacity }}>
      <div className="absolute inset-0 mix-blend-screen" style={{ background: theme.backgroundGradient }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,transparent_0,transparent_32%,rgba(2,6,23,.22)_70%,rgba(2,6,23,.42)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.028)_1px,transparent_1px)] bg-[size:52px_52px] opacity-20" />
      <div className="absolute left-[18%] top-[18%] h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(88,225,132,.09)", boxShadow: theme.glowIntensity }} />
      <div className="absolute right-[12%] top-[12%] h-72 w-72 rounded-full bg-sky/5 blur-3xl" />
      <div className="absolute bottom-0 left-0 right-0 h-56 bg-gradient-to-t from-slate-950/38 to-transparent" />
    </div>
  );
}
