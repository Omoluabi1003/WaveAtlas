'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bookmark, Check, Pause, Plane, Play, Radio, RotateCcw, Share2, X } from 'lucide-react';
import { JOURNEY_COUNTRIES, JOURNEY_PRESETS, JOURNEY_SAVED_KEY, decodeJourney, journeyClock, nearbyJourneyStations, journeyRadioCandidates, journeyFlightSeconds, journeyFlightLabel, journeyRouteCountries, journeyDistance, journeyFromStation, journeyPosition, journeyRegion, validJourneyRoute, type JourneyPlace, type JourneyRoute } from '@/lib/atlas-journey';
import type { Station } from '@/lib/stations';
import AtlasJourneyGlobe, { type JourneyCamera } from '@/components/AtlasJourneyGlobe';
import { NewspaperBrief } from '@/components/NewspaperBrief';

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-[#F7F5EF] transition hover:border-[#D4A64A]/70 hover:bg-white/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4A64A]';
const placeKey = (place: JourneyPlace) => `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;

function PlacePicker({ label, value, places, onChange }: { label: string; value: JourneyPlace; places: JourneyPlace[]; onChange: (place: JourneyPlace) => void }) {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<JourneyPlace[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemote([]); setMessage('');
      if (query.trim().length < 3) return;
      setMessage('Searching station locations…');
      try {
        const response = await fetch(`/api/stations/search?${new URLSearchParams({ q: query.trim(), limit: '12' })}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Search unavailable');
        const data = await response.json() as { stations?: Station[] };
        if (controller.signal.aborted) return;
        const found = (data.stations || []).map(journeyFromStation).filter((p): p is JourneyPlace => Boolean(p));
        setRemote(found); setMessage(found.length ? '' : 'Choose a listed city or country below.');
      } catch { if (!controller.signal.aborted) setMessage('Station search unavailable. Listed destinations still work.'); }
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);
  const options = [...places.filter((p) => p.label.toLowerCase().includes(query.toLowerCase())), ...remote].filter((p, index, all) => all.findIndex((other) => placeKey(other) === placeKey(p)) === index).slice(0, 8);
  return <fieldset className="min-w-0 rounded-2xl border border-white/10 bg-white/[.025] p-4">
    <legend className="px-1 text-[10px] font-bold uppercase tracking-[.2em] text-[#D4A64A]">{label}</legend>
    <p className="mb-3 break-words text-sm font-semibold">{value.label}{value.approximate ? <span className="mt-1 block text-[10px] font-normal text-white/50">Approximate country centre</span> : null}</p>
    <label className="sr-only" htmlFor={`journey-${label}`}>Search {label.toLowerCase()} city or country</label>
    <input id={`journey-${label}`} value={query} onChange={(event) => { setQuery(event.target.value); setRemote([]); }} placeholder="Search city or country" className="min-h-11 w-full min-w-0 rounded-xl border border-white/15 bg-[#08111D] px-3 text-xs outline-none focus:border-[#D4A64A]" />
    {message ? <p className="mt-2 text-[11px] text-white/55" role="status">{message}</p> : null}
    <div className="mt-2 max-h-32 overflow-y-auto">{options.map((place) => <button key={placeKey(place)} type="button" onClick={() => { onChange(place); setQuery(''); }} className="block min-h-11 w-full rounded-lg px-2 py-2 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white">{place.label}{place.approximate ? ' · country centre' : ''}</button>)}</div>
  </fieldset>;
}

export default function AtlasJourney({ stations, current, initialRoute, onListen, onClose }: { stations: Station[]; current?: Station | null; initialRoute?: JourneyRoute | null; onListen: (station: Station, candidates?: Station[]) => void; onClose: () => void }) {
  const [route, setRoute] = useState<JourneyRoute>(initialRoute || JOURNEY_PRESETS[0]);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cruise, setCruise] = useState(850);
  const [scheduledMinutes, setScheduledMinutes] = useState('');
  const [autoRadio, setAutoRadio] = useState(true);
  const [guide, setGuide] = useState(true);
  const [caption, setCaption] = useState('Atlas will guide your journey. Regional radio starts when you begin.');
  const [guideStatus, setGuideStatus] = useState('');
  const [departureAt, setDepartureAt] = useState(() => Date.now());
  const lastTune = useRef({ country: '', id: '', at: 0 });
  const announced = useRef('');
  const narrationId = useRef(0);
  const actions = useRef({ onListen, guide });
  useEffect(() => { actions.current = { onListen, guide }; }, [onListen, guide]);
  const [camera, setCamera] = useState<JourneyCamera>('trailing');
  const [saved, setSaved] = useState<JourneyRoute[]>(() => {
    try { const stored: unknown = JSON.parse(window.localStorage.getItem(JOURNEY_SAVED_KEY) || '[]'); return Array.isArray(stored) ? stored.filter(validJourneyRoute).slice(0, 6) : []; } catch { return []; }
  });
  const [notice, setNotice] = useState('');
  const [routeStations, setRouteStations] = useState<Station[]>([]);
  const [stationStatus, setStationStatus] = useState('');
  const [briefStation, setBriefStation] = useState<Station | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  const briefOpen = useRef(false);
  useEffect(() => { briefOpen.current = Boolean(briefStation); }, [briefStation]);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const duration = 240;
  const modeledSeconds = journeyFlightSeconds(route, cruise);
  const flightSeconds = Number(scheduledMinutes) >= 5 && Number(scheduledMinutes) <= 1440 ? Number(scheduledMinutes) * 60 : modeledSeconds;
  const distance = useMemo(() => journeyDistance(route), [route]);
  const position = useMemo(() => journeyPosition(route, progress), [route, progress]);
  const region = useMemo(() => journeyRegion(position), [position]);
  const routeCountry = region?.code && /^[A-Z]{2}$/.test(region.code) ? region.code : progress > 0.8 ? route.to.countryCode : undefined;

  const pool = useMemo(() => [...stations, ...routeStations], [stations, routeStations]);
  const places = useMemo(() => {
    const stationPlaces = stations.map(journeyFromStation).filter((p): p is JourneyPlace => Boolean(p));
    return [...JOURNEY_PRESETS.flatMap((r) => [r.from, r.to]), ...stationPlaces, ...JOURNEY_COUNTRIES].filter((p, index, all) => all.findIndex((other) => placeKey(p) === placeKey(other)) === index);
  }, [stations]);
  const automaticCandidates = useMemo(() => journeyRadioCandidates(pool, position, routeCountry), [pool, position, routeCountry]);
  const selectedNearby = useMemo(() => current ? nearbyJourneyStations([current], position) : [], [current, position]);
  const nearby = [...selectedNearby, ...automaticCandidates.filter(item => !selectedNearby.some(selected => selected.station.station_uuid === item.station.station_uuid))].slice(0, 6);
  const cachedCountries = useRef(new Map<string, Station[]>());

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (briefOpen.current && event.key === 'Escape') return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key === 'Tab') {
        const surface = briefOpen.current ? document.querySelector('[aria-label="WaveAtlas Daily"]') : dialog.current;
        const focusable = [...(surface?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href], [tabindex="0"]') || [])].filter((node) => node.offsetParent !== null);
        const first = focusable[0], last = focusable.at(-1);
        if (!first) return;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    if (!running || briefStation) return;
    let frame = 0, last = 0, display = 0;
    const visibility = () => { last = 0; };
    document.addEventListener('visibilitychange', visibility);
    const tick = (time: number) => {
      if (!last) last = time;
      if (!document.hidden) progressRef.current = Math.min(1, progressRef.current + Math.min(0.25, (time - last) / 1000) * speed / duration);
      last = time;
      if (time - display >= 250 || progressRef.current === 1) { setProgress(progressRef.current); display = time; }
      if (progressRef.current === 1) { setRunning(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility); };
  }, [running, speed, briefStation]);

  // Prefetch the route, not just the country beneath the aircraft. Three
  // workers bound the load and keep ocean crossings connected to the last signal.
  useEffect(() => {
    const controller = new AbortController();
    const regions = journeyRouteCountries(route);
    let index = 0;
    const load = async () => {
      while (index < regions.length && !controller.signal.aborted) {
        const region = regions[index++];
        await Promise.resolve();
        if (controller.signal.aborted) return;
        const cached = cachedCountries.current.get(region.code);
        if (cached) { setRouteStations(previous => [...previous, ...cached]); continue; }
        try {
          const response = await fetch(`/api/stations/by-country?${new URLSearchParams({ countryCode: region.code, country: region.name, limit: '60' })}`, { signal: controller.signal });
          if (!response.ok) throw new Error('Signal lookup unavailable');
          const data = await response.json() as { stations?: Station[] };
          if (controller.signal.aborted) return;
          const found = (data.stations || []).filter(station => station.country_code === region.code).slice(0, 60);
          cachedCountries.current.set(region.code, found);
          if (cachedCountries.current.size > 30) cachedCountries.current.delete(cachedCountries.current.keys().next().value!);
          setRouteStations(previous => [...previous, ...found]);
        } catch { if (!controller.signal.aborted) setStationStatus('Some regional lookups are unavailable. Connected radio can continue.'); }
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, regions.length) }, load));
    return () => controller.abort();
  }, [route]);

  const narrate = (text: string) => {
    setCaption(text);
    if (!actions.current.guide) return;
    const id = ++narrationId.current;
    setGuideStatus('Preparing Omoluabi voice. Radio continues until Atlas speaks.');
    window.dispatchEvent(new CustomEvent('waveatlas:journey-narrate', { detail: { id, text } }));
  };
  useEffect(() => {
    const status = (event: Event) => {
      const detail = (event as CustomEvent<{ id: number; status: string }>).detail;
      if (detail?.id === narrationId.current) setGuideStatus(detail.status);
    };
    window.addEventListener('waveatlas:journey-voice-status', status);
    return () => { window.removeEventListener('waveatlas:journey-voice-status', status); window.dispatchEvent(new Event('waveatlas:journey-narration-stop')); };
  }, []);
  useEffect(() => {
    if (!running || !autoRadio || !automaticCandidates.length) return;
    const candidate = automaticCandidates[0];
    const id = candidate.station.station_uuid || candidate.station.id;
    const country = candidate.station.country_code;
    const previous = lastTune.current;
    if (id === previous.id || (previous.id && country === previous.country) || (previous.id && Date.now() - previous.at < 12000)) return;
    lastTune.current = { id, country, at: Date.now() };
    actions.current.onListen(candidate.station, automaticCandidates.map(item => item.station));
  }, [running, autoRadio, automaticCandidates]);
  useEffect(() => {
    if (!running || !region || announced.current === region.code) return;
    announced.current = region.code;
    if (progressRef.current > 0.02 && progressRef.current < 0.98) {
      const timer = window.setTimeout(() => setCaption(`We are now crossing ${region.name}. Hear the region through its local radio stations.`), 0);
      if (actions.current.guide) window.dispatchEvent(new CustomEvent('waveatlas:journey-narrate', { detail: { id: ++narrationId.current, text: `We are now crossing ${region.name}. Hear the region through its local radio stations.` } }));
      return () => window.clearTimeout(timer);
    }
  }, [running, region]);
  useEffect(() => {
    if (progress !== 1) return;
    const text = `Welcome to ${route.to.label}. Our journey is complete. Keep listening or open the destination brief.`;
    const timer = window.setTimeout(() => setCaption(text), 0);
    if (actions.current.guide) window.dispatchEvent(new CustomEvent('waveatlas:journey-narrate', { detail: { id: ++narrationId.current, text } }));
    return () => window.clearTimeout(timer);
  }, [progress, route.to.label]);

  const changeRoute = (next: JourneyRoute) => { window.dispatchEvent(new Event('waveatlas:journey-narration-stop')); lastTune.current = { country: '', id: '', at: 0 }; announced.current = ''; setDepartureAt(Date.now()); setRouteStations([]); setScheduledMinutes(''); setGuideStatus(''); setRunning(false); setProgress(0); progressRef.current = 0; setRoute(next); setNotice(''); setShareUrl(''); };
  const save = () => {
    if (!validJourneyRoute(route)) return;
    const next = [route, ...saved.filter((r) => placeKey(r.from) !== placeKey(route.from) || placeKey(r.to) !== placeKey(route.to))].slice(0, 6);
    try { window.localStorage.setItem(JOURNEY_SAVED_KEY, JSON.stringify(next)); setSaved(next); setNotice('Journey saved on this device.'); } catch { setNotice('Device storage is unavailable. You can still share this journey.'); }
  };
  const share = async () => {
    if (!validJourneyRoute(route)) return;
    const url = new URL(window.location.origin); url.searchParams.set('journey', JSON.stringify(route));
    setShareUrl(url.toString());
    try { await navigator.clipboard.writeText(url.toString()); setNotice('Journey link copied. It opens as a preview.'); } catch { setNotice('Copy the journey link below.'); }
  };
  const usableRoute = validJourneyRoute(route);
  const selectedOrigin = journeyFromStation(current);

  return <div className="pointer-events-auto fixed inset-0 z-[1001] overflow-y-auto overscroll-contain bg-[#030914]/95 px-3 py-[max(12px,env(safe-area-inset-top))] text-[#F7F5EF] backdrop-blur-xl sm:p-6">
    <section ref={dialog} inert={Boolean(briefStation)} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="journey-title" className="mx-auto max-w-6xl overflow-hidden rounded-[1.6rem] border border-[#D4A64A]/25 bg-[#08111D] shadow-2xl outline-none">
      <header className="flex items-start justify-between gap-3 border-b border-white/10 p-5 sm:p-7"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.25em] text-[#D4A64A]">Explore humanity through sound</p><h2 id="journey-title" className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Atlas Journey<span className="text-[#D4A64A]">.</span></h2><p className="mt-2 text-xs leading-5 text-white/55">Virtual flight simulation · free exploration · no live aircraft tracking</p></div><button type="button" className={`${button} shrink-0 !px-3`} onClick={onClose} aria-label="Close Atlas Journey"><X className="size-5" /></button></header>
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="relative overflow-hidden border-b border-white/10"><AtlasJourneyGlobe route={route} progress={progress} camera={camera} running={running && !briefStation} rate={speed / duration} departureAt={departureAt} flightSeconds={flightSeconds} /><div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3 text-[10px] font-semibold uppercase tracking-[.15em]"><span className="max-w-[65%] break-words rounded-full border border-white/10 bg-[#08111D]/90 px-3 py-2 text-[#D4A64A]">{progress === 1 ? 'Virtual arrival' : region ? `Exploring ${region.name}` : 'Over open water'}</span><span className="rounded-full bg-[#08111D]/90 px-3 py-2 text-white/60">Simulated</span></div><div className="absolute bottom-4 left-4 right-4 flex flex-wrap justify-center gap-2">{(['overview', 'overhead', 'trailing'] as const).map((view) => <button type="button" key={view} aria-pressed={camera === view} onClick={() => setCamera(view)} className={`${button} !min-h-10 bg-[#08111D]/90 capitalize ${camera === view ? '!border-[#D4A64A] !text-[#D4A64A]' : ''}`}>{view === 'overview' ? 'Route view' : view === 'overhead' ? 'Aerial view' : 'Follow aircraft'}</button>)}</div></div>
          <div className="p-5 sm:p-7"><div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="break-words">{route.from.label}</span><ArrowRight className="size-4 shrink-0 text-[#D4A64A]" /><span className="break-words">{route.to.label}</span></div>
            <div className="mt-5 grid grid-cols-3 gap-3">{[['Progress', `${Math.round(progress * 100)}%`], ['Remaining', `${Math.round(distance * (1 - progress)).toLocaleString()} km`], ['Flight time remaining', journeyFlightLabel((1 - progress) * flightSeconds)]].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-white/[.04] p-3"><p className="text-[9px] uppercase tracking-[.1em] text-white/45">{label}</p><p className="mt-2 break-words text-base font-semibold sm:text-xl">{value}</p></div>)}</div>
            <label htmlFor="journey-progress" className="sr-only">Journey progress</label><input id="journey-progress" type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={(event) => { const value = Number(event.target.value) / 1000; progressRef.current = value; lastTune.current.at = 0; setProgress(value); if (value === 1) setRunning(false); }} className="my-5 w-full accent-[#00D68F]" />
            <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!usableRoute} className={`${button} !border-[#D4A64A] !bg-[#D4A64A] !text-[#08111D]`} onClick={() => { if (progress === 1) { progressRef.current = 0; setProgress(0); } if (!running && progressRef.current === 0) { setDepartureAt(Date.now()); narrate(`Welcome aboard Atlas Journey. We are travelling from ${route.from.label} to ${route.to.label}. The estimated flight time is ${journeyFlightLabel(flightSeconds)}. Let us explore the world through sound.`); }
              if (running) window.dispatchEvent(new Event('waveatlas:journey-narration-stop'));
              setRunning((value) => !value); }}>{running ? <Pause className="size-4" /> : <Play className="size-4" />}{running ? 'Pause journey' : progress === 1 ? 'Fly again' : progress > 0 ? 'Resume journey' : 'Begin journey'}</button><button type="button" className={button} onClick={() => changeRoute(route)} aria-label="Reset journey"><RotateCcw className="size-4" /></button><label className="ml-auto text-[11px] text-white/60">Pace <select aria-label="Journey pace" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="ml-2 min-h-11 rounded-xl border border-white/15 bg-[#08111D] px-3 text-white"><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label></div>
            {!usableRoute ? <p className="mt-3 text-xs text-[#D4A64A]" role="alert">Choose destinations at least 1 km apart.</p> : null}
            <p className="mt-4 text-[11px] leading-5 text-white/45">{Math.round(distance).toLocaleString()} km great-circle route. Flight estimate uses 4% route allowance plus 25 minutes for climb and descent. Enter your airline duration for a schedule-based simulation. Actual flights depend on routing, winds, and delays.</p>
            <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 p-4 sm:grid-cols-2">
              <label className="text-xs text-white/65">Cruise speed (km/h)<input type="number" aria-label="Cruise speed" min="400" max="1000" value={cruise} onChange={event => setCruise(Math.max(400, Math.min(1000, Number(event.target.value) || 850)))} className="mt-2 min-h-11 w-full rounded-lg bg-[#08111D] px-3" /></label>
              <label className="text-xs text-white/65">Airline duration (minutes, optional)<input type="number" aria-label="Airline duration" min="5" max="1440" placeholder="Use flight estimate" value={scheduledMinutes} onChange={event => setScheduledMinutes(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg bg-[#08111D] px-3" /></label>
              <p className="text-xs leading-6 text-white/65">{scheduledMinutes && Number(scheduledMinutes) >= 5 && Number(scheduledMinutes) <= 1440 ? 'Entered schedule' : 'Estimated flight'}: {journeyFlightLabel(flightSeconds)}<br />Estimated arrival: {new Date(departureAt + flightSeconds * 1000).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })}</p>
              <p className="text-xs leading-6 text-white/50">Preview remaining: {journeyClock((1 - progress) * duration / speed)}<br />Preview pace compresses flight time. ETA is not live flight status.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3"><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={autoRadio} onChange={event => { setAutoRadio(event.target.checked); if (event.target.checked) lastTune.current = { country: '', id: '', at: 0 }; }} />Automatic regional radio</label><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={guide} onChange={event => { setGuide(event.target.checked); if (!event.target.checked) { window.dispatchEvent(new Event('waveatlas:journey-narration-stop')); setGuideStatus('Atlas guide muted.'); } }} />Atlas spoken guide</label></div>
            <div className="mt-3 rounded-2xl border border-[#D4A64A]/20 bg-[#D4A64A]/5 p-4"><p className="text-[10px] uppercase tracking-widest text-[#D4A64A]">Atlas flight guide</p><p aria-live="polite" className="mt-2 text-sm leading-6">{caption}</p>{guideStatus ? <p role="status" className="mt-2 text-xs text-white/50">{guideStatus}</p> : null}<button type="button" className={`${button} mt-3 !min-h-10`} onClick={() => narrate(caption)}>Hear Atlas</button></div>
            <section className="mt-7 border-t border-white/10 pt-5" aria-labelledby="journey-signals-title"><div className="flex items-center gap-2"><Radio className="size-4 text-[#00D68F]" /><h3 id="journey-signals-title" className="text-sm font-semibold">Hear this part of the world</h3></div><p className="mt-2 text-xs leading-5 text-white/55">Stations within 800 km of your virtual position. Automatic tuning follows the route. The last signal continues across stretches without nearby stations.</p>{stationStatus ? <p role="status" className="mt-2 text-[11px] text-white/45">{stationStatus}</p> : null}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">{nearby.map(({ station, distanceKm, place }) => <article key={station.station_uuid || station.id} className="min-w-0 rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="break-words text-sm font-semibold">{station.name}</p><p className="mt-1 break-words text-[11px] leading-5 text-white/50">{place.label} · {Math.round(distanceKm)} km · {station.language || 'Language unlisted'}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={`${button} !min-h-10 !px-3 !text-[#00D68F]`} onClick={() => { setAutoRadio(false); onListen(station, nearby.map(item => item.station)); }}><Play className="size-3" />Listen</button><button type="button" className={`${button} !min-h-10 !px-3`} onClick={() => { setRunning(false); setBriefStation(station); }}>Destination Brief</button></div></article>)}</div>
              {!nearby.length ? <p className="mt-4 rounded-xl bg-white/[.04] p-4 text-xs leading-6 text-white/55">No located stations are available within this stretch of the route. Your current listening can continue while you explore.</p> : null}
              {current ? <p className="mt-4 text-[11px] text-white/50">Selected station: <span className="text-white/80">{current.name}</span></p> : null}
            </section>
          </div>
        </div>
        <aside className="min-w-0 border-t border-white/10 bg-[#0B1625] p-5 lg:border-l lg:border-t-0"><h3 className="mb-4 text-sm font-semibold">Plan your listening journey</h3><div className="space-y-4"><PlacePicker label="Departure" value={route.from} places={places} onChange={(from) => changeRoute({ ...route, from })} /><PlacePicker label="Destination" value={route.to} places={places} onChange={(to) => changeRoute({ ...route, to })} /></div>
          {selectedOrigin ? <button type="button" className={`${button} mt-4 w-full`} onClick={() => changeRoute({ ...route, from: selectedOrigin })}>Depart from my station</button> : null}
          <p className="mt-5 text-[10px] uppercase tracking-[.16em] text-[#D4A64A]">Featured journeys</p><div className="mt-2 space-y-2">{JOURNEY_PRESETS.map((preset) => <button type="button" key={preset.to.label} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/10 p-3 text-left text-xs text-white/70 hover:bg-white/10" onClick={() => changeRoute(preset)}><Plane className="size-4 shrink-0 text-[#D4A64A]" /><span>{preset.from.label.split(',')[0]} → {preset.to.label.split(',')[0]}</span></button>)}</div>
          <div className="mt-5 flex flex-wrap gap-2"><button type="button" className={button} disabled={!usableRoute} onClick={save}><Bookmark className="size-4" />Save</button><button type="button" className={button} disabled={!usableRoute} onClick={() => void share()}><Share2 className="size-4" />Share</button></div>
          {notice ? <p className="mt-3 text-xs leading-5 text-[#D4A64A]" role="status"><Check className="mr-1 inline size-3" />{notice}</p> : null}
          {shareUrl ? <label className="mt-3 block text-[11px] text-white/60">Journey link<input readOnly value={shareUrl} onFocus={(event) => event.target.select()} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-[#08111D] px-3 text-xs text-white" /></label> : null}
          {saved.length ? <div className="mt-5"><p className="text-[10px] uppercase tracking-[.16em] text-white/50">Saved on this device</p>{saved.map((item, index) => <div key={index} className="mt-2 flex items-center gap-2"><button type="button" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 p-3 text-left text-xs text-white/70" onClick={() => changeRoute(item)}>{item.from.label} → {item.to.label}</button><button type="button" aria-label={`Remove saved journey ${index + 1}`} className={`${button} !px-3`} onClick={() => { const next = saved.filter((_, i) => i !== index); try { window.localStorage.setItem(JOURNEY_SAVED_KEY, JSON.stringify(next)); setSaved(next); } catch { setNotice('Saved journeys could not be updated.'); } }}><X className="size-3" /></button></div>)}</div> : null}
          <p className="mt-6 text-[11px] leading-6 text-white/40">Built with WaveAtlas station locations and Natural Earth geography. No flight subscription or additional API key.</p>
        </aside>
      </div>
    </section>
    {briefStation ? <NewspaperBrief station={briefStation} stations={pool} open onClose={() => { setBriefStation(null); dialog.current?.focus(); }} /> : null}
  </div>;
}
