"use client";
import { motion } from "framer-motion";
import { ArrowRight, Globe2, PlaneLanding, Stamp } from "lucide-react";
import type { ArrivalDestination } from "@/lib/discovery/arrival-engine";
import { flagFor } from "@/lib/stations";
export function ArrivalCard({ arrival, replacementReason, onEnter }: { arrival?: ArrivalDestination; replacementReason?: string; onEnter?: () => void }) {
  if (!arrival) return null;
  return <motion.div className="fixed inset-0 z-[90] flex min-h-[100dvh] items-start justify-center overflow-y-auto overflow-x-hidden bg-midnight/55 px-4 py-[max(24px,env(safe-area-inset-top))] pb-[calc(96px+env(safe-area-inset-bottom))] backdrop-blur-xl md:items-center md:px-5 md:py-[5dvh]" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,8,20,.42),rgba(7,17,31,.70))]" />
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(0,214,143,.10),transparent_34%),radial-gradient(circle_at_80%_16%,rgba(212,166,74,.08),transparent_30%)]" />
    <motion.div initial={{ y: 28, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="relative flex max-h-none min-h-[100dvh] w-full max-w-full flex-col overflow-y-auto overflow-x-hidden rounded-[2rem] border border-white/15 bg-slate-950/82 pt-6 backdrop-blur-xl shadow-[0_30px_120px_rgba(0,0,0,.55)] md:min-h-0 md:max-h-[90dvh] md:max-w-[720px]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]">
        <motion.div className="absolute -right-14 -top-14 size-52 rounded-full border border-sky/20 bg-[radial-gradient(circle,rgba(56,189,248,.18),transparent_68%)]" animate={{ rotate: 360, x: [0, -10, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} />
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-5">
        <div className="relative flex items-center justify-between border-b border-white/10 pb-4 font-display text-xs font-semibold text-gold"><span><PlaneLanding className="mr-2 inline size-4" />Now Arriving</span><span>{arrival.mode.replaceAll("-", " ")}</span></div>
        <div className="relative mt-7">{replacementReason ? <p className="mb-4 rounded-2xl border border-gold/25 bg-gold/10 px-4 py-3 text-sm font-medium text-gold">{replacementReason === "weak_signal" ? `${arrival.city} signal was weak. Tuning into a stronger live destination.` : "Finding a stronger live signal…"}</p> : null}<motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="font-display text-[28px] font-medium leading-tight text-radio">Now Arriving</motion.p><motion.h2 initial={{ clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }} transition={{ delay: 0.38, duration: 0.8, ease: "easeOut" }} className="mt-3 font-display text-[36px] font-extrabold leading-[1.08] text-white md:text-[36px]">{arrival.city}, {arrival.country} {flagFor(arrival.station.country_code)}</motion.h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">{[["Continent", arrival.continent], ["Genre", arrival.genre], ["Station", arrival.station.name], ["Local Time", arrival.localTime || "Estimating…"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs font-medium opacity-75 text-ivory/40">{label}</p><p className="mt-2 font-medium text-ivory">{value}</p></div>)}</div>
        </div>
        <motion.div initial={{ rotate: -16, scale: 1.4, opacity: 0 }} animate={{ rotate: -8, scale: 1, opacity: 0.75 }} transition={{ delay: 1, duration: 0.45, ease: "backOut" }} className="pointer-events-none relative z-0 mt-6 hidden w-fit rounded-full border-2 border-radio/60 px-4 py-2 font-mono text-[10px] font-extrabold  text-radio/80 sm:block"><Stamp className="mr-2 inline size-4" />Cleared</motion.div>
      </div>
      <div className="sticky bottom-[max(24px,env(safe-area-inset-bottom))] z-50 mt-2 flex flex-col items-stretch justify-between gap-4 border-t border-white/10 bg-slate-950/70 px-6 pb-5 pt-4 shadow-[0_-18px_44px_rgba(3,8,20,.48)] backdrop-blur-2xl sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
        <p className="flex min-w-0 items-center gap-2 text-xs text-ivory/55 sm:max-w-xs"><Globe2 className="size-7 shrink-0 text-sky/50" /><span>Explore Humanity Through Sound™</span></p>
        <button type="button" onClick={onEnter} className="relative z-50 inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-300 via-radio to-emerald-500 px-6 py-3 text-sm font-semibold text-midnight shadow-[0_0_42px_rgba(16,185,129,.34)] transition hover:scale-[1.02]">Board Flight <ArrowRight className="size-4" /></button>
      </div>
    </motion.div>
  </motion.div>;
}
