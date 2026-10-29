'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, Car, Footprints, Plane, Radio, Route } from 'lucide-react';
import { atlasTravelProgress, corridorStationQueue, type AtlasTravelModeSession, type AtlasTravelProfile } from '@/lib/atlas-travel-mode';
import { atlasTravelDurationLabel } from '@/lib/atlas-travel-presentation';
import type { Station } from '@/lib/stations';

const PROFILE_LABELS: Record<AtlasTravelProfile, string> = { flight: 'Flight', drive: 'Drive', bicycle: 'Bicycle', walk: 'Walk' };
const PROFILE_ICONS = { flight: Plane, drive: Car, bicycle: Bike, walk: Footprints } as const;
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 text-[11px] font-semibold transition hover:border-[#D4A64A]/70 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4A64A]';

export default function AtlasCorridorTravelPanel({ profile, session, status, stations, progress, running, onProfileChange, onListen, onTakeover }: {
  profile: AtlasTravelProfile;
  session: AtlasTravelModeSession | null;
  status: string;
  stations: Station[];
  progress: number;
  running: boolean;
  onProfileChange: (profile: AtlasTravelProfile) => void;
  onListen: (station: Station, candidates?: Station[]) => void;
  onTakeover: () => void;
}) {
  const [corridorAuto, setCorridorAuto] = useState(false);
  const lastTune = useRef({ id: '', at: 0 });
  const state = useMemo(() => session ? atlasTravelProgress(session, progress) : null, [session, progress]);
  const queue = useMemo(() => session ? corridorStationQueue(session, progress, 5) : [], [session, progress]);
  const stationById = useMemo(() => new Map(stations.map((station) => [station.station_uuid || station.id, station])), [stations]);
  const queueStations = useMemo(() => queue.map((item) => stationById.get(item.id)).filter((station): station is Station => Boolean(station)), [queue, stationById]);
  const timelineSignals = useMemo(() => {
    if (!session?.points.length) return [];
    const denominator = Math.max(1, session.points.length - 1);
    return session.corridor.stations.slice(0, 40).map((signal) => ({
      ...signal,
      position: Math.max(0, Math.min(1, signal.routeIndex / denominator)),
      station: stationById.get(signal.id),
    }));
  }, [session, stationById]);

  useEffect(() => {
    if (!corridorAuto || !running || !queueStations.length) return;
    const candidate = queueStations[0];
    const id = candidate.station_uuid || candidate.id;
    if (!id || id === lastTune.current.id || Date.now() - lastTune.current.at < 12000) return;
    lastTune.current = { id, at: Date.now() };
    onListen(candidate, queueStations);
  }, [corridorAuto, running, queueStations, onListen]);

  const sourceLabel = session?.source === 'valhalla' ? 'Road-aware route' : session?.source === 'great-circle-fallback' ? 'Geographic fallback' : 'Geographic route';
  const distanceLabel = session?.distanceKm ? `${Math.round(session.distanceKm).toLocaleString()} km` : null;
  const durationLabel = atlasTravelDurationLabel(session?.durationSeconds);

  return <section className="mt-5 rounded-2xl border border-[#00D68F]/20 bg-[#00D68F]/[.035] p-4" aria-labelledby="atlas-corridor-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><div className="flex items-center gap-2"><Route className="size-4 text-[#00D68F]" /><h3 id="atlas-corridor-title" className="text-sm font-semibold">Atlas Corridor Intelligence</h3></div><p className="mt-1 text-[11px] leading-5 text-white/50">Choose how this journey moves through geography. Ground modes follow routed geometry; Flight keeps the great-circle air corridor.</p></div>
      <span className="rounded-full border border-white/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[.16em] text-[#00D68F]">Travel Mode</span>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{(['flight', 'drive', 'bicycle', 'walk'] as AtlasTravelProfile[]).map((item) => { const Icon = PROFILE_ICONS[item]; return <button type="button" key={item} aria-pressed={profile === item} onClick={() => { onProfileChange(item); setCorridorAuto(false); lastTune.current = { id: '', at: 0 }; }} className={`${button} ${profile === item ? '!border-[#00D68F] !bg-[#00D68F]/10 !text-[#00D68F]' : 'text-white/65'}`}><Icon className="size-3.5" />{PROFILE_LABELS[item]}</button>; })}</div>

    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/40">Route source</p><p className="mt-1 text-xs font-semibold">{session ? sourceLabel : 'Calculating…'}</p></div>
      <div className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/40">Corridor signals</p><p className="mt-1 text-xs font-semibold">{session ? session.corridor.stations.length : '—'}</p></div>
      <div className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/40">Route estimate</p><p className="mt-1 text-xs font-semibold">{[distanceLabel, durationLabel].filter(Boolean).join(' · ') || (profile === 'flight' ? 'Atlas flight model' : 'Calculating…')}</p></div>
    </div>

    <p role="status" className="mt-3 text-[11px] leading-5 text-white/50">{status}</p>

    {session && timelineSignals.length ? <div className="mt-4 rounded-2xl border border-white/10 bg-[#08111D]/55 p-3" aria-label="Journey signal timeline">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#D4A64A]">Route intelligence timeline</p><p className="mt-1 text-[10px] text-white/40">Stations are positioned where their signal intersects this journey.</p></div><span className="text-[10px] tabular-nums text-white/55">{Math.round(progress * 100)}%</span></div>
      <div className="relative mt-5 h-12" role="img" aria-label={`${timelineSignals.length} located radio signals along the route`}>
        <div className="absolute left-0 right-0 top-5 h-px bg-white/15" />
        <div className="absolute left-0 top-5 h-px bg-[#00D68F]" style={{ width: `${Math.round(progress * 100)}%` }} />
        <div className="absolute top-[14px] z-20 size-3 -translate-x-1/2 rounded-full border-2 border-[#08111D] bg-[#D4A64A] shadow-[0_0_14px_rgba(212,166,74,.75)]" style={{ left: `${Math.round(progress * 100)}%` }} aria-hidden="true" />
        {timelineSignals.map((signal) => {
          const passed = signal.position < progress;
          const near = Math.abs(signal.position - progress) < .02;
          const title = `${signal.name} · ${Math.round(signal.distanceKm)} km off route`;
          return signal.station ? <button key={signal.id} type="button" title={title} aria-label={`Listen to ${signal.name} from the route timeline`} onClick={() => { setCorridorAuto(false); onTakeover(); onListen(signal.station!, queueStations.length ? queueStations : [signal.station!]); }} className={`absolute top-[15px] z-10 size-2.5 -translate-x-1/2 rounded-full border border-[#08111D] transition hover:scale-150 focus-visible:scale-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4A64A] ${near ? 'bg-[#D4A64A] shadow-[0_0_12px_rgba(212,166,74,.65)]' : passed ? 'bg-white/35' : 'bg-[#00D68F]'}`} style={{ left: `${signal.position * 100}%` }} /> : <span key={signal.id} title={title} className={`absolute top-[15px] size-2.5 -translate-x-1/2 rounded-full border border-[#08111D] ${passed ? 'bg-white/25' : 'bg-[#00D68F]/70'}`} style={{ left: `${signal.position * 100}%` }} />;
        })}
        <span className="absolute bottom-0 left-0 text-[9px] text-white/35">Start</span><span className="absolute bottom-0 right-0 text-[9px] text-white/35">Arrival</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-white/40"><span><i className="mr-1 inline-block size-2 rounded-full bg-white/35" />Passed</span><span><i className="mr-1 inline-block size-2 rounded-full bg-[#D4A64A]" />Current area</span><span><i className="mr-1 inline-block size-2 rounded-full bg-[#00D68F]" />Ahead</span></div>
    </div> : null}

    {state && queue.length ? <div className="mt-4"><div className="flex items-center gap-2"><Radio className="size-3.5 text-[#D4A64A]" /><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#D4A64A]">Signals ahead</p></div><p className="mt-1 text-[10px] text-white/40">These same signals now appear directly on the Journey map.</p><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{queue.map((station, index) => <button type="button" onClick={() => { const candidate = stationById.get(station.id); if (!candidate) return; setCorridorAuto(false); onTakeover(); onListen(candidate, queueStations.length ? queueStations : [candidate]); }} key={station.id} className={`min-w-[145px] rounded-xl border p-3 text-left transition hover:border-[#D4A64A]/40 ${index === 0 ? 'border-[#00D68F]/35 bg-[#00D68F]/[.05]' : 'border-white/10 bg-white/[.025]'}`}><p className="truncate text-xs font-semibold">{station.name}</p><p className="mt-1 text-[10px] text-white/45">{index === 0 ? 'Current corridor signal' : `Ahead · ${Math.round(station.distanceKm)} km off route`}</p></button>)}</div></div> : null}

    <label className="mt-4 flex min-h-11 items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={corridorAuto} disabled={!session || !queueStations.length} onChange={(event) => { const enabled = event.target.checked; setCorridorAuto(enabled); lastTune.current = { id: '', at: 0 }; if (enabled) onTakeover(); }} />Follow corridor radio automatically</label>
    <p className="text-[10px] leading-5 text-white/40">Opt-in only. Corridor ordering can take over station progression without changing the main player. If routing fails, WaveAtlas keeps the journey usable through its geographic fallback.</p>
  </section>;
}
