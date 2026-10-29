'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bike, Car, Footprints, Plane, Radio, Route } from 'lucide-react';
import { atlasTravelProgress, type AtlasTravelModeSession, type AtlasTravelProfile } from '@/lib/atlas-travel-mode';
import { atlasTravelDurationLabel } from '@/lib/atlas-travel-presentation';
import { journeySoundPhase, journeySoundPhaseLabel, journeySoundPhaseQueue } from '@/lib/journey-sound-phases';
import { setJourneyProgressFromTimeline } from '@/lib/journey-progress-bridge';
import type { Station } from '@/lib/stations';
import AtlasJourneyArrival from '@/components/AtlasJourneyArrival';

const PROFILE_LABELS: Record<AtlasTravelProfile, string> = { flight: 'Flight', drive: 'Drive', bicycle: 'Bicycle', walk: 'Walk' };
const PROFILE_ICONS = { flight: Plane, drive: Car, bicycle: Bike, walk: Footprints } as const;
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 px-3 py-2 text-[11px] font-semibold transition hover:border-[#D4A64A]/70 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4A64A]';
const TRAVEL_PROFILES: AtlasTravelProfile[] = ['flight', 'drive', 'bicycle', 'walk'];

function isTravelProfile(value: string | null): value is AtlasTravelProfile {
  return Boolean(value && TRAVEL_PROFILES.includes(value as AtlasTravelProfile));
}

function remainingDuration(seconds: number | undefined, progress: number) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return atlasTravelDurationLabel(Math.max(0, seconds * (1 - progress)));
}

function closeJourney() {
  document.querySelector<HTMLButtonElement>('[role="dialog"][aria-labelledby="journey-title"] button[aria-label="Close Atlas Journey"]')?.click();
}

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
  const soundPhase = journeySoundPhase(progress);
  const queue = useMemo(() => session ? journeySoundPhaseQueue(session, progress, 5) : [], [session, progress]);
  const stationById = useMemo(() => new Map(stations.map((station) => [station.station_uuid || station.id, station])), [stations]);
  const queueStations = useMemo(() => queue.map((item) => stationById.get(item.id)).filter((station): station is Station => Boolean(station)), [queue, stationById]);
  const currentStation = state?.currentStationId ? stationById.get(state.currentStationId) : undefined;
  const currentPlace = currentStation ? [currentStation.city || currentStation.state, currentStation.country].filter(Boolean).join(' · ') : '';
  const eta = remainingDuration(session?.durationSeconds, progress);
  const remainingKm = session?.distanceKm ? Math.max(0, session.distanceKm * (1 - progress)) : null;
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
    const applyProfile = (next: AtlasTravelProfile) => {
      if (next === profile) return;
      setCorridorAuto(false);
      lastTune.current = { id: '', at: 0 };
      onProfileChange(next);
    };
    const fromUrl = new URLSearchParams(window.location.search).get('journeyMode');
    if (isTravelProfile(fromUrl)) applyProfile(fromUrl);
    const onLaunchProfile = (event: Event) => {
      const next = (event as CustomEvent<{ profile?: string }>).detail?.profile || null;
      if (isTravelProfile(next)) applyProfile(next);
    };
    window.addEventListener('waveatlas:journey-profile', onLaunchProfile);
    return () => window.removeEventListener('waveatlas:journey-profile', onLaunchProfile);
  }, [onProfileChange, profile]);

  useEffect(() => {
    if (!corridorAuto || !running || !queueStations.length) return;
    const candidate = queueStations[0];
    const id = candidate.station_uuid || candidate.id;
    if (!id || id === lastTune.current.id || Date.now() - lastTune.current.at < 12000) return;
    lastTune.current = { id, at: Date.now() };
    onListen(candidate, queueStations);
  }, [corridorAuto, running, queueStations, onListen]);

  const arrivalStation = progress >= 1 ? queueStations[0] || currentStation : undefined;

  return <section className="mt-5 rounded-2xl border border-[#00D68F]/20 bg-[#00D68F]/[.035] p-4" aria-labelledby="atlas-corridor-title">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2"><Route className="size-4 shrink-0 text-[#00D68F]" /><div className="min-w-0"><h3 id="atlas-corridor-title" className="text-sm font-semibold">Live Journey</h3><p className="truncate text-[10px] text-white/45">{journeySoundPhaseLabel(soundPhase)}{currentPlace ? ` · ${currentPlace}` : ''}</p></div></div>
      <span className="shrink-0 rounded-full border border-[#00D68F]/25 bg-[#00D68F]/10 px-3 py-1 text-[10px] font-bold tabular-nums text-[#00D68F]">{Math.round(progress * 100)}%</span>
    </div>

    <div className="mt-3 grid grid-cols-3 gap-2">
      <div className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-[.12em] text-white/35">Mode</p><p className="mt-1 truncate text-xs font-semibold">{PROFILE_LABELS[profile]}</p></div>
      <div className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-[.12em] text-white/35">Remaining</p><p className="mt-1 truncate text-xs font-semibold">{remainingKm !== null ? `${Math.round(remainingKm).toLocaleString()} km` : 'Route'}</p></div>
      <div className="rounded-xl bg-white/[.035] p-3"><p className="text-[9px] uppercase tracking-[.12em] text-white/35">ETA</p><p className="mt-1 truncate text-xs font-semibold">{eta || (running ? 'In progress' : progress >= 1 ? 'Arrived' : 'Ready')}</p></div>
    </div>

    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{TRAVEL_PROFILES.map((item) => { const Icon = PROFILE_ICONS[item]; return <button type="button" key={item} aria-pressed={profile === item} onClick={() => { onProfileChange(item); setCorridorAuto(false); lastTune.current = { id: '', at: 0 }; }} className={`${button} min-w-[92px] ${profile === item ? '!border-[#00D68F] !bg-[#00D68F]/10 !text-[#00D68F]' : 'text-white/65'}`}><Icon className="size-3.5" />{PROFILE_LABELS[item]}</button>; })}</div>

    {status ? <p role="status" className="mt-2 truncate text-[10px] text-white/40">{status}</p> : null}

    {session && timelineSignals.length ? <div className="mt-3 rounded-2xl border border-white/10 bg-[#08111D]/55 p-3" aria-label="Journey signal timeline">
      <div className="flex items-center justify-between gap-3"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#D4A64A]">Route timeline</p><span className="text-[9px] text-white/35">Drag to explore</span></div>
      <div className="relative mt-3 h-12">
        <div className="absolute left-0 right-0 top-4 h-px bg-white/15" />
        <div className="absolute left-0 top-4 h-px bg-[#00D68F]" style={{ width: `${Math.round(progress * 100)}%` }} />
        <input type="range" min="0" max="1000" value={Math.round(progress * 1000)} aria-label="Scrub Journey geography" onChange={(event) => setJourneyProgressFromTimeline(Number(event.target.value) / 1000)} className="absolute inset-x-0 top-0 z-[5] h-9 w-full cursor-ew-resize opacity-0" />
        <div className="pointer-events-none absolute top-[10px] z-20 size-3 -translate-x-1/2 rounded-full border-2 border-[#08111D] bg-[#D4A64A] shadow-[0_0_14px_rgba(212,166,74,.75)]" style={{ left: `${Math.round(progress * 100)}%` }} aria-hidden="true" />
        {timelineSignals.map((signal) => {
          const passed = signal.position < progress;
          const near = Math.abs(signal.position - progress) < .02;
          const title = `${signal.name} · ${Math.round(signal.distanceKm)} km off route`;
          return signal.station ? <button key={signal.id} type="button" title={title} aria-label={`Listen to ${signal.name} from the route timeline`} onClick={() => { setCorridorAuto(false); onTakeover(); onListen(signal.station!, queueStations.length ? queueStations : [signal.station!]); }} className={`absolute top-[11px] z-10 size-2.5 -translate-x-1/2 rounded-full border border-[#08111D] transition hover:scale-150 focus-visible:scale-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4A64A] ${near ? 'bg-[#D4A64A] shadow-[0_0_12px_rgba(212,166,74,.65)]' : passed ? 'bg-white/35' : 'bg-[#00D68F]'}`} style={{ left: `${signal.position * 100}%` }} /> : <span key={signal.id} title={title} className={`pointer-events-none absolute top-[11px] z-10 size-2.5 -translate-x-1/2 rounded-full border border-[#08111D] ${passed ? 'bg-white/25' : 'bg-[#00D68F]/70'}`} style={{ left: `${signal.position * 100}%` }} />;
        })}
        <span className="pointer-events-none absolute bottom-0 left-0 text-[9px] text-white/30">Start</span><span className="pointer-events-none absolute bottom-0 right-0 text-[9px] text-white/30">Arrival</span>
      </div>
    </div> : null}

    {state && queue.length ? <div className="mt-3"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Radio className="size-3.5 text-[#D4A64A]" /><p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#D4A64A]">{journeySoundPhaseLabel(soundPhase)}</p></div><label className="flex items-center gap-1.5 text-[9px] text-white/45"><input type="checkbox" checked={corridorAuto} disabled={!session || !queueStations.length} onChange={(event) => { const enabled = event.target.checked; setCorridorAuto(enabled); lastTune.current = { id: '', at: 0 }; if (enabled) onTakeover(); }} />Auto</label></div><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{queue.slice(0, 4).map((station, index) => <button type="button" onClick={() => { const candidate = stationById.get(station.id); if (!candidate) return; setCorridorAuto(false); onTakeover(); onListen(candidate, queueStations.length ? queueStations : [candidate]); }} key={station.id} className={`min-w-[132px] rounded-xl border p-3 text-left transition hover:border-[#D4A64A]/40 ${index === 0 ? 'border-[#00D68F]/35 bg-[#00D68F]/[.05]' : 'border-white/10 bg-white/[.025]'}`}><p className="truncate text-xs font-semibold">{station.name}</p><p className="mt-1 text-[9px] text-white/40">{index === 0 ? (soundPhase === 'departure' ? 'Origin signal' : soundPhase === 'arrival' ? 'Arrival signal' : 'Current signal') : `${Math.round(station.distanceKm)} km off route`}</p></button>)}</div></div> : null}

    {progress >= 1 && session ? <AtlasJourneyArrival
      destination={session.route.to}
      station={arrivalStation}
      queue={queueStations}
      onListen={(station, candidates) => { setCorridorAuto(false); onTakeover(); onListen(station, candidates); }}
      onBrief={(station) => {
        setCorridorAuto(false);
        onTakeover();
        onListen(station, queueStations.length ? queueStations : [station]);
        closeJourney();
        window.setTimeout(() => window.dispatchEvent(new Event('waveatlas:open-mobile-brief')), 0);
      }}
      onExplore={(station, candidates) => {
        if (station) {
          setCorridorAuto(false);
          onTakeover();
          onListen(station, candidates?.length ? candidates : [station]);
        }
        closeJourney();
      }}
    /> : null}
  </section>;
}
