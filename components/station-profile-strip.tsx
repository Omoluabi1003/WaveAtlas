"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  station: string;
  detail: string;
  state: string;
};

const LINE_PATTERN = /([^\n]{3,90}?)\s*[·•]\s*(playing|buffering|paused|failed|blocked)/i;

function readSnapshot(): Snapshot | null {
  if (typeof document === "undefined") return null;
  const text = document.body.innerText || "";
  const match = text.match(LINE_PATTERN);
  if (!match) return null;
  const station = match[1].trim().replace(/\s+/g, " ");
  const state = match[2].toLowerCase();
  const placeMatch = text.match(/\b([A-Z][a-zA-Z .'-]+),\s*(Nigeria|Ghana|United States|United Kingdom|France|Germany|Japan|Brazil|Canada|Australia|South Africa|Kenya)\b/);
  return { station, state, detail: placeMatch?.[0] || "Live destination" };
}

function headingFor(state: string) {
  if (state === "playing") return "Now Playing";
  if (state === "paused") return "Paused Broadcast";
  return "Live Broadcast";
}

export function StationProfileStrip() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;
    let frame = 0;
    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setSnapshot(readSnapshot()));
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!snapshot) return null;

  return (
    <aside className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-3 z-[58] w-[min(22rem,calc(100vw-1.5rem))] md:bottom-6 md:right-6 md:w-[21rem]">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="pointer-events-auto w-full rounded-[1.35rem] border border-white/12 bg-slate-950/78 p-3 text-left text-ivory shadow-2xl backdrop-blur-2xl transition hover:border-radio/35 hover:bg-slate-950/88" aria-expanded={expanded}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-radio/85">Signal Intelligence</p>
            <h2 className="mt-1 truncate text-sm font-bold text-white">{snapshot.station}</h2>
            <p className="mt-0.5 truncate text-[11px] text-ivory/55">{snapshot.detail}</p>
          </div>
          <span className="shrink-0 rounded-full border border-radio/20 bg-radio/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-radio">LIVE</span>
        </div>
        <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.055] px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gold/80">{headingFor(snapshot.state)}</p>
          <p className="mt-1 truncate text-xs font-semibold text-white">Metadata unavailable</p>
          <p className="mt-0.5 truncate text-[11px] text-ivory/48">Track data will appear when the station exposes it.</p>
        </div>
        {expanded ? <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2"><p className="font-black uppercase tracking-[0.16em] text-gold/75">Source</p><p className="mt-1 text-ivory/70">Station profile</p></div><div className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2"><p className="font-black uppercase tracking-[0.16em] text-gold/75">Track feed</p><p className="mt-1 text-ivory/70">Pending</p></div></div> : null}
      </button>
    </aside>
  );
}
