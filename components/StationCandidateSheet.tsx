'use client';

import { Radio } from 'lucide-react';
import type { RankedStationCandidate } from '@/lib/station-ranking';

export function StationCandidateSheet({ candidates, onPick }: { candidates: RankedStationCandidate[]; onPick: (candidate: RankedStationCandidate) => void }) {
  if (candidates.length <= 1) return null;
  return <div className="mt-2 grid gap-1 sm:grid-cols-2">
    {candidates.slice(1, 5).map((candidate) => <button key={candidate.station.id} onClick={() => onPick(candidate)} className="truncate rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-xs text-ivory/75 hover:bg-white/10"><Radio className="mr-1 inline size-3 text-gold" />{candidate.station.name} · {candidate.signalStrength}% · {candidate.distanceKm} km</button>)}
  </div>;
}
