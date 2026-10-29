'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, Car, Footprints, Plane, Radio, Route } from 'lucide-react';
import { atlasTravelProgress, buildAtlasTravelModeSession, corridorStationQueue, type AtlasTravelModeSession, type AtlasTravelProfile } from '@/lib/atlas-travel-mode';
import type { JourneyRoute } from '@/lib/atlas-journey';
import type { Station } from '@/lib/stations';

const PROFILE_LABELS: Record<AtlasTravelProfile, string> = { flight: 'Flight', drive: 'Drive', bicycle: 'Bicycle', walk: 'Walk' };
const PROFILE_ICONS = { flight: Plane, drive: Car, bicycle: Bike, walk: Footprints } as const;
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 text-[11px] font-semibold transition hover:border-[#D4A64A]/70 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4A64A]';

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export default function AtlasCorridorTravelPanel({ route, stations, progress, running, onListen, onTakeover }: {
  route: JourneyRoute;
  stations: Station[];
  progress: number;
  running: boolean;
  onListen: (station: Station, candidates?: Station[]) => void;
  onTakeover: () => void;
}) {
  const [profile, setProfile] = useState<AtlasTravelProfile>('flight');
  const [session, setSession] = useState<AtlasTravelModeSession | null>(null);
  const [status, setStatus] = useState('Preparing corridor intelligence…');
  const [corridorAuto, setCorridorAuto] = useState(false);
  const generation = useRef(0);
  const lastTune = useRef({ id: '', at: 0 });

  useEffect(() => {
    const id = ++generation.current;
    setSession(null);
    setStatus(profile === 'flight' ? 'Mapping the listening corridor…' : 'Finding a road-aware route…');
    void buildAtlasTravelModeSession(route, stations, { profile }).then((next) => {
      if (generation.current !== id) return;
      setSession(next);
      if (next.source === 'valhalla') setStatus(`Road-aware corridor ready · ${next.corridor.stations.length} located signals`);
      else if (next.source === 'great-circle-fallback') setStatus(`Router unavailable for this trip · using geographic corridor · ${next.corridor.stations.length} located signals`);
      else setStatus(`Geographic corridor ready · ${next.corridor.stations.length} located signals`);
    }).catch(() => {
      if (generation.current === id) setStatus('Corridor intelligence is temporarily unavailable. Regional radio remains active.');
    });
  }, [route, stations, profile]);

  const state = useMemo(() => session ? atlasTravelProgress(session, progress) : null, [session, progress]);
  const queue = useMemo(() => session ? corridorStationQueue(session, progress, 5) : [], [session, progress]);
  const stationById = useMemo(() => new Map(stations.map((station) => [station.station_uuid || station.id, station])), [stations]);
  const queueStations = useMemo(() => queue.map((item) => stationById.get(item.id)).filter((station): station is Station => Boolean(station)), [queue, stationById]);

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
  const durationLabel = formatDuration(session?.durationSeconds);

  return <section className="mt-5 rounded-2xl border border-[#00D68F]/20 bg-[#00D68F]/[.035] p-4" aria-labelledby="atlas-corridor-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><div className="flex items-center gap-2"><Route className="size-4 text-[#00D68F]" /><h3 id="atlas-corridor-title" className="text-sm font-semibold">Atlas Corridor Intelligence</h3></div><p className="mt-1 text-[11px] leading-5 text-white/50">Choose how this journey moves through geography. Corridor stations are ordered along the route instead of selected only by a broad regional radius.</p></div>
      <span className="rounded-full border border-white/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[.16em] text-[#00D68F]">Travel Mode</span>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{(['flight', 'drive', 'bicycle', 'walk'] as AtlasTravelProfile[]).map((item) => { const Icon = PROFILE_ICONS[item]; return <button type="button" key={item} aria-pressed={profile === item} onClick={() => { setProfile(item); setCorridorAuto(false); lastTune.current = { id: '', at: 0 }; }} className={`${button} ${profile === item ? '!border-[#00D68F] !bg-[#00D68F]/10 !text-[#00D68F]' : 'text-white/65'}`}><Icon className="size-3.5" />{PROFILE_LABELS[item]}</button>; })}</div>

    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/40">Route source</p><p className="mt-1 text-xs font-semibold">{session ? sourceLabel : 'Calculating…'}</p></div>
      <div className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/40">Corridor signals</p><p className="mt-1 text-xs font-semibold">{session ? session.corridor.stations.length : '—'}</p></div>
      <div className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-[.14em] text-white/40">Route estimate</p><p className="mt-1 text-xs font-semibold">{[distanceLabel, durationLabel].filter(Boolean).join(' · ') || (profile === 'flight' ? 'Atlas flight model' : 'Calculating…')}</p></div>
    </div>

    <p role="status" className="mt-3 text-[11px] leading-5 text-white/50">{status}</p>

    {state && queue.length ? <div className="mt-4"><div className="flex items-center gap-2"><Radio className="size-3.5 text-[#D4A64A]" /><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#D4A64A]">Signals ahead</p></div><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{queue.map((station, index) => <div key={station.id} className={`min-w-[145px] rounded-xl border p-3 ${index === 0 ? 'border-[#00D68F]/35 bg-[#00D68F]/[.05]' : 'border-white/10 bg-white/[.025]'}`}><p className="truncate text-xs font-semibold">{station.name}</p><p className="mt-1 text-[10px] text-white/45">{index === 0 ? 'Current corridor signal' : `Ahead · ${Math.round(station.distanceKm)} km off route`}</p></div>)}</div></div> : null}

    <label className="mt-4 flex min-h-11 items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={corridorAuto} disabled={!session || !queueStations.length} onChange={(event) => { const enabled = event.target.checked; setCorridorAuto(enabled); lastTune.current = { id: '', at: 0 }; if (enabled) onTakeover(); }} />Follow corridor radio automatically</label>
    <p className="text-[10px] leading-5 text-white/40">Opt-in only. When enabled, corridor ordering takes over automatic station progression for this Journey. If routing fails, WaveAtlas keeps the journey usable through its geographic fallback.</p>
  </section>;
}
