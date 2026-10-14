'use client';
import type { Station } from '@/lib/stations';
import { streamReliability } from '@/lib/maturity/reliability';
export function ReliabilityIndicator({ station, status = '', compact = false }: { station: Station; status?: string; compact?: boolean }) {
  const reliability = streamReliability(station, status);
  if (compact) return <span className="text-[11px] text-ivory/70" aria-label={`Stream reliability: ${reliability.label}`}>{reliability.label}</span>;
  return <details className="rounded-xl border border-white/10 px-3 py-2 text-sm"><summary className="min-h-11 cursor-pointer content-center" aria-label={`Stream reliability: ${reliability.label}. Expand details.`}>Stream · {reliability.label}</summary><p className="pb-2 text-xs text-ivory/65">{reliability.detail}</p></details>;
}
