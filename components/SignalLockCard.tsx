'use client';

import { Signal } from 'lucide-react';
import type { GeoFocus } from '@/lib/geo-focus';
import type { RankedStationCandidate } from '@/lib/station-ranking';
import type { EarthTunerState } from '@/hooks/useEarthTuner';
import { StationCandidateSheet } from './StationCandidateSheet';

export function SignalLockCard({ state, focus, best, candidates, error, onTune, onPick }: { state: EarthTunerState; focus: GeoFocus | null; best: RankedStationCandidate | null; candidates: RankedStationCandidate[]; error?: string; onTune: () => void; onPick: (candidate: RankedStationCandidate) => void }) {
  return <div className="absolute bottom-[10.75rem] left-3 right-3 z-50 rounded-3xl border border-white/10 bg-slate-950/90 p-3 text-white shadow-2xl backdrop-blur-xl md:bottom-4 md:left-4 md:right-4">
    <div className="flex min-h-[72px] items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[.24em] text-gold">{state === 'no_signal' ? 'No signal here' : state === 'scanning' ? 'Scanning…' : state === 'weak_signal' ? 'Weak Signal' : 'Signal Lock'}</p>
        <h3 className="truncate text-base font-black">{focus?.countryName ?? focus?.label ?? 'Move Earth to tune'}</h3>
        <p className="truncate text-xs text-ivory/65">{best ? `${best.station.name} · ${best.station.country} · ${best.distanceKm} km` : error || 'Drag, zoom, or rotate the map to scan.'}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden h-10 items-end gap-1 sm:flex">{[20, 28, 36, 44].map((h, i) => <span key={h} className={`w-1.5 rounded-full ${best && best.signalStrength / 25 > i ? 'bg-radio' : 'bg-white/20'}`} style={{ height: h }} />)}</div>
        <button disabled={!best} onClick={onTune} className="rounded-full bg-radio px-4 py-2 text-sm font-black text-midnight disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40"><Signal className="mr-1 inline size-4" />Tune</button>
      </div>
    </div>
    <StationCandidateSheet candidates={candidates} onPick={onPick} />
  </div>;
}
