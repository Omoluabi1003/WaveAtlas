'use client';

import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import type { EarthTunerState } from '@/hooks/useEarthTuner';

export function TuningReticle({ state, strength }: { state: EarthTunerState; strength: number }) {
  const label = state === 'locked' || state === 'playing' ? 'Locked' : state === 'candidate_found' ? 'Good Signal' : state === 'no_signal' ? 'Weak Signal' : 'Scanning';
  return <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 text-center">
    <motion.div className={`grid size-28 place-items-center rounded-full border ${state === 'no_signal' ? 'border-amber-300/45' : 'border-radio/55'} bg-slate-950/15 shadow-[0_0_70px_rgba(88,225,132,.24)] backdrop-blur-[2px]`} animate={{ scale: state === 'scanning' || state === 'tuning' ? [1, 1.08, 1] : 1 }} transition={{ repeat: state === 'scanning' || state === 'tuning' ? Infinity : 0, duration: 1.1 }}>
      <div className="absolute size-44 rounded-full border border-white/10" />
      <div className="absolute h-px w-40 bg-gradient-to-r from-transparent via-radio/70 to-transparent" />
      <div className="absolute h-40 w-px bg-gradient-to-b from-transparent via-radio/70 to-transparent" />
      <Radio className="size-7 text-radio" />
    </motion.div>
    <div className="mt-3 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 font-mono text-[10px] uppercase tracking-[.24em] text-ivory/80">{label} · {strength}%</div>
  </div>;
}
