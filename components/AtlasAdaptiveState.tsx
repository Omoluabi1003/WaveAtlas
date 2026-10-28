"use client";

import { useEffect, useMemo, useState } from 'react';
import type { ReciprocalAtlasSignal } from '@/lib/atlas-reciprocal-intelligence';

type VisibleMode = Exclude<ReciprocalAtlasSignal['mode'], 'ambient'>;

const COPY: Record<VisibleMode, { eyebrow: string; label: string; detail: string }> = {
  discovery: {
    eyebrow: 'Atlas adapting',
    label: 'Local discovery',
    detail: 'Nearby, verified signals are receiving more relevance.',
  },
  focused: {
    eyebrow: 'Atlas adapting',
    label: 'Context refined',
    detail: 'This session is being tuned around your current exploration.',
  },
  resilience: {
    eyebrow: 'Signal recovery',
    label: 'Reliability priority',
    detail: 'Healthier streams are being prioritized after playback trouble.',
  },
  awareness: {
    eyebrow: 'Local awareness',
    label: 'Trusted signals elevated',
    detail: 'Verified local and official information is receiving more relevance.',
  },
};

export function AtlasAdaptiveState() {
  const [signal, setSignal] = useState<ReciprocalAtlasSignal | null>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const next = (event as CustomEvent<ReciprocalAtlasSignal>).detail;
      if (!next) return;
      setSignal((previous) => {
        if (previous?.mode !== next.mode) setVisible(next.mode !== 'ambient');
        return next;
      });
    };

    window.addEventListener('waveatlas:reciprocal-context', handler);
    window.dispatchEvent(new Event('waveatlas:request-reciprocal-context'));
    return () => window.removeEventListener('waveatlas:reciprocal-context', handler);
  }, []);

  useEffect(() => {
    if (!signal || signal.mode === 'ambient' || signal.mode === 'awareness' || signal.mode === 'resilience' || !visible) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      setExpanded(false);
    }, 4800);
    return () => window.clearTimeout(timer);
  }, [signal?.mode, visible]);

  const copy = useMemo(() => signal && signal.mode !== 'ambient' ? COPY[signal.mode] : null, [signal]);
  if (!signal || !copy || !visible) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[95] w-[min(92vw,25rem)] -translate-x-1/2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${copy.eyebrow}: ${copy.label}`}
        onClick={() => setExpanded((value) => !value)}
        className="pointer-events-auto mx-auto block max-w-full rounded-full border border-white/15 bg-slate-950/72 px-3.5 py-2 text-left text-white shadow-[0_12px_36px_rgba(0,0,0,.32)] backdrop-blur-xl transition hover:border-emerald-300/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300/55" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-300" />
          </span>
          <span className="min-w-0">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-200/80">{copy.eyebrow}</span>
            <span className="block truncate text-[12px] font-semibold tracking-wide text-white/95">{copy.label}</span>
          </span>
        </span>
        {expanded ? (
          <span className="mt-2 block max-w-[21rem] border-t border-white/10 pt-2 text-[11px] leading-4 text-white/68">
            {copy.detail} Listener control remains unchanged.
          </span>
        ) : null}
      </button>
    </div>
  );
}
