"use client";
import { motion } from "framer-motion";
import { ArrowRight, Globe2, PlaneLanding, Stamp } from "lucide-react";
import type { ArrivalDestination } from "@/lib/discovery/arrival-engine";
import { flagFor } from "@/lib/stations";
export function ArrivalCard({ arrival, onEnter }: { arrival?: ArrivalDestination; onEnter?: () => void }) {
  if (!arrival) return null;
  return <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-midnight/85 px-5 backdrop-blur-2xl" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
    <motion.div initial={{ y: 28, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -18, opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950/90 p-6 shadow-[0_30px_120px_rgba(0,0,0,.55)]">
      <motion.div className="absolute -right-14 -top-14 size-52 rounded-full border border-sky/20 bg-[radial-gradient(circle,rgba(56,189,248,.18),transparent_68%)]" animate={{ rotate: 360, x: [0, -10, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} />
      <div className="relative flex items-center justify-between border-b border-white/10 pb-4 font-mono text-[10px] uppercase tracking-[.32em] text-gold"><span><PlaneLanding className="mr-2 inline size-4" />Arrival Board</span><span>{arrival.mode.replaceAll("-", " ")}</span></div>
      <div className="relative mt-7"><motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="text-sm uppercase tracking-[.45em] text-radio">Now arriving</motion.p><motion.h2 initial={{ clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }} transition={{ delay: 0.38, duration: 0.8, ease: "easeOut" }} className="mt-3 text-4xl font-black text-white md:text-5xl">{arrival.city}, {arrival.country} {flagFor(arrival.station.country_code)}</motion.h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">{[["Continent", arrival.continent], ["Genre", arrival.genre], ["Station", arrival.station.name], ["Local Time", arrival.localTime || "Estimating…"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="font-mono text-[10px] uppercase tracking-[.25em] text-ivory/40">{label}</p><p className="mt-2 font-bold text-ivory">{value}</p></div>)}</div>
      </div>
      <div className="relative mt-7 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-xs text-xs text-ivory/55">Explore Humanity Through Sound™</p>
        <button type="button" onClick={onEnter} className="inline-flex items-center gap-2 rounded-full bg-radio px-5 py-3 text-sm font-black text-midnight shadow-[0_0_40px_rgba(88,225,132,.24)] transition hover:scale-[1.02]">Board Flight <ArrowRight className="size-4" /></button>
      </div>
      <motion.div initial={{ rotate: -16, scale: 1.4, opacity: 0 }} animate={{ rotate: -8, scale: 1, opacity: 0.9 }} transition={{ delay: 1, duration: 0.45, ease: "backOut" }} className="absolute bottom-5 right-6 hidden rounded-full border-2 border-radio/70 px-5 py-3 font-mono text-xs font-black uppercase tracking-[.28em] text-radio sm:block"><Stamp className="mr-2 inline size-4" />Cleared</motion.div><Globe2 className="absolute bottom-7 left-7 size-7 text-sky/50" />
    </motion.div>
  </motion.div>;
}
