"use client";

import { CloudSun, Mic, Newspaper, X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Station } from '@/lib/stations';

type CoordinatedContext = {
  placeLabel?: string;
  weatherTitle?: string;
  weatherSummary?: string;
  voicePrompt?: string;
};

type WeatherResponse = {
  ok: boolean;
  weather?: {
    observedAt?: string;
    timezone?: string;
    condition?: string;
    temperatureC?: number;
    apparentTemperatureC?: number;
    humidityPercent?: number;
    precipitationMm?: number;
    windSpeedKmh?: number;
    highC?: number;
    lowC?: number;
    precipitationProbabilityPercent?: number;
  };
  source?: { name?: string; attribution?: string; url?: string };
  error?: string;
};

function stationPlace(station?: Station | null) {
  return [station?.city || station?.state, station?.country].filter(Boolean).join(', ');
}

function weatherSummary(payload?: WeatherResponse | null) {
  const weather = payload?.weather;
  if (!weather) return '';
  const headline = [
    weather.condition,
    typeof weather.temperatureC === 'number' ? `${Math.round(weather.temperatureC)}°C` : null,
    typeof weather.apparentTemperatureC === 'number' ? `feels ${Math.round(weather.apparentTemperatureC)}°C` : null,
  ].filter(Boolean).join(' · ');
  const detail = [
    typeof weather.highC === 'number' && typeof weather.lowC === 'number' ? `High ${Math.round(weather.highC)}° / Low ${Math.round(weather.lowC)}°` : null,
    typeof weather.humidityPercent === 'number' ? `${Math.round(weather.humidityPercent)}% humidity` : null,
    typeof weather.windSpeedKmh === 'number' ? `${Math.round(weather.windSpeedKmh)} km/h wind` : null,
    typeof weather.precipitationProbabilityPercent === 'number' ? `${Math.round(weather.precipitationProbabilityPercent)}% precipitation` : null,
  ].filter(Boolean).join(' · ');
  return [headline, detail].filter(Boolean).join('\n');
}

async function fetchWeather(station: Station, signal: AbortSignal): Promise<WeatherResponse> {
  if (typeof station.latitude !== 'number' || typeof station.longitude !== 'number') {
    return { ok: false, error: 'Verified destination coordinates are unavailable.' };
  }
  const params = new URLSearchParams({ lat: String(station.latitude), lng: String(station.longitude) });
  const response = await fetch(`/api/weather?${params.toString()}`, { signal });
  const payload = await response.json() as WeatherResponse;
  if (!response.ok || !payload.ok) return { ...payload, ok: false };
  return payload;
}

function briefIsOpen() {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"][aria-label="WaveAtlas Daily"]'));
}

function LivingContextIcon({ active }: { active: boolean }) {
  return (
    <span className="relative grid size-7 place-items-center" aria-hidden="true">
      <span className={`absolute inset-[2px] rounded-full border ${active ? 'border-radio/40' : 'border-white/10'}`} />
      <span className="relative z-[1] grid size-5 place-items-center overflow-hidden rounded-[0.3rem] shadow-[0_0_9px_rgba(68,156,255,.24),0_0_10px_rgba(255,31,142,.22)]">
        <img src="/atlas-context-star.png" alt="" width="20" height="20" decoding="async" className="size-5 object-cover" />
      </span>
    </span>
  );
}

export function AtlasContextDock() {
  const [station, setStation] = useState<Station | null>(null);
  const [coordinated, setCoordinated] = useState<CoordinatedContext | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [weatherAttempted, setWeatherAttempted] = useState(false);
  const [weatherResult, setWeatherResult] = useState<WeatherResponse | null>(null);
  const [surfaceBlocked, setSurfaceBlocked] = useState(false);
  const [mobileDockTarget, setMobileDockTarget] = useState<HTMLElement | null>(null);
  const reducedMotion = Boolean(useReducedMotion());

  useEffect(() => {
    const onStation = (event: Event) => {
      const next = (event as CustomEvent<Station | null>).detail;
      if (next?.name) {
        setStation(next);
        setCoordinated(null);
        setWeatherResult(null);
        setWeatherAttempted(false);
        setLoadingWeather(false);
        setOpen(false);
      }
    };
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<CoordinatedContext>).detail;
      if (detail) setCoordinated(detail);
    };
    window.addEventListener('waveatlas:station-context', onStation);
    window.addEventListener('waveatlas:coordinated-context', onContext);
    window.dispatchEvent(new Event('waveatlas:request-station-context'));
    return () => {
      window.removeEventListener('waveatlas:station-context', onStation);
      window.removeEventListener('waveatlas:coordinated-context', onContext);
    };
  }, []);

  useEffect(() => {
    const syncSurfaceState = () => {
      const blocked = briefIsOpen();
      setSurfaceBlocked(blocked);
      if (blocked) setOpen(false);
    };
    syncSurfaceState();
    const observer = new MutationObserver(syncSurfaceState);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (surfaceBlocked) {
      setMobileDockTarget(null);
      return;
    }
    let target: HTMLElement | null = null;
    let previousGridTemplate = '';
    const syncDock = () => {
      const next = document.querySelector<HTMLElement>('.waveatlas-mobile-dock > div');
      if (!next) return;
      if (target !== next) {
        if (target) target.style.gridTemplateColumns = previousGridTemplate;
        target = next;
        previousGridTemplate = next.style.gridTemplateColumns;
        setMobileDockTarget(next);
      }
      if (next.style.gridTemplateColumns !== 'repeat(4, minmax(0px, 1fr))' && next.style.gridTemplateColumns !== 'repeat(4,minmax(0,1fr))') {
        next.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';
      }
    };
    syncDock();
    const observer = new MutationObserver(syncDock);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (target) target.style.gridTemplateColumns = previousGridTemplate;
      setMobileDockTarget(null);
    };
  }, [surfaceBlocked]);

  const place = coordinated?.placeLabel || stationPlace(station) || station?.name;
  const voicePrompt = coordinated?.voicePrompt || (place ? `Ask Atlas about ${place}.` : 'Ask Atlas about this station.');
  const weatherLabel = useMemo(() => coordinated?.weatherTitle || "Uncle Paul's Weather Forecast", [coordinated?.weatherTitle]);
  const forecast = weatherSummary(weatherResult);
  const weatherSource = weatherResult?.source?.attribution || weatherResult?.source?.name || 'Open-Meteo Best Match forecast';

  if (!station || surfaceBlocked) return null;

  const openBrief = () => {
    setOpen(false);
    window.dispatchEvent(new Event('waveatlas:open-mobile-brief'));
  };
  const openVoice = () => window.dispatchEvent(new Event('waveatlas:open-atlas-voice'));
  const showWeather = async () => {
    setOpen(true);
    if (loadingWeather) return;
    setWeatherAttempted(true);
    setLoadingWeather(true);
    setWeatherResult(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    try {
      setWeatherResult(await fetchWeather(station, controller.signal));
    } catch {
      setWeatherResult({ ok: false, error: 'Verified destination weather is temporarily unavailable.', source: { attribution: 'Open-Meteo Best Match forecast' } });
    } finally {
      window.clearTimeout(timeout);
      setLoadingWeather(false);
    }
  };

  const actions = (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" onClick={openBrief} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:bg-white/[0.07]"><Newspaper className="size-3.5 text-gold" />Brief</button>
      <button type="button" onClick={showWeather} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:bg-white/[0.07]"><CloudSun className="size-3.5 text-sky-200" />Weather</button>
      <button type="button" onClick={openVoice} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-semibold text-white/82 transition hover:bg-white/[0.07]"><Mic className="size-3.5 text-emerald-200" />Voice</button>
    </div>
  );

  const weatherPanel = (weatherAttempted || loadingWeather) ? (
    <div className="mt-2.5 rounded-xl border border-sky-300/12 bg-sky-300/[0.045] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-sky-200/75">{weatherLabel}</p>
          <p className="mt-1 whitespace-pre-line text-[11px] leading-4 text-white/68">{loadingWeather ? 'Loading verified destination weather…' : forecast || weatherResult?.error || 'Verified destination weather is unavailable.'}</p>
          {!loadingWeather ? <p className="mt-1.5 text-[9px] leading-4 text-white/38">Source: {weatherSource}</p> : null}
        </div>
        <button type="button" onClick={() => { setWeatherAttempted(false); setWeatherResult(null); }} aria-label="Clear weather context" className="shrink-0 rounded-full p-1 text-white/35 hover:text-white/70"><X className="size-3.5" /></button>
      </div>
    </div>
  ) : null;

  const mobileTrigger = mobileDockTarget ? createPortal(
    <motion.button
      type="button"
      onClick={() => setOpen(value => !value)}
      aria-expanded={open}
      aria-label={`Atlas Context for ${place || station.name}`}
      title="Atlas Context"
      whileTap={reducedMotion ? undefined : { scale: 0.94 }}
      className={`pointer-events-auto relative z-[1] grid min-h-12 w-full place-items-center overflow-visible rounded-[1.05rem] px-1 py-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:hidden ${open ? 'bg-radio text-midnight shadow-[0_0_22px_rgba(0,214,143,.2)]' : 'text-ivory/70 hover:bg-white/10'}`}
    >
      <LivingContextIcon active={open} />
      <span className="sr-only">Atlas Context</span>
    </motion.button>,
    mobileDockTarget,
  ) : null;

  return (
    <>
      {mobileTrigger}
      <div className="sm:hidden">
        {open ? (
          <aside className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+11.5rem)] z-[92]" aria-label="Atlas Context">
            <div className="pointer-events-auto rounded-[1.1rem] border border-white/12 bg-slate-950/88 p-3.5 text-white shadow-[0_18px_44px_rgba(0,0,0,.42)] backdrop-blur-2xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0"><span className="block text-[8px] font-semibold uppercase tracking-[0.2em] text-emerald-200/75">Atlas Context</span><span className="mt-0.5 block truncate text-[12px] font-semibold text-white/94">{place || station.name}</span></div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close Atlas Context" className="rounded-full p-1 text-white/42 hover:text-white/75"><X className="size-4" /></button>
              </div>
              {actions}
              {weatherPanel}
              <p className="mt-2.5 truncate text-[9px] leading-4 text-white/42">{voicePrompt}</p>
            </div>
          </aside>
        ) : null}
      </div>

      <aside className="pointer-events-none fixed right-[max(.75rem,env(safe-area-inset-right))] top-[max(4.5rem,calc(env(safe-area-inset-top)+4.5rem))] z-[92] hidden w-[min(92vw,22rem)] sm:block" aria-label="Atlas Context">
        <div className="pointer-events-auto ml-auto overflow-hidden rounded-[1.15rem] border border-white/15 bg-slate-950/78 text-white shadow-[0_14px_38px_rgba(0,0,0,.34)] backdrop-blur-xl">
          <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70" aria-expanded={open}>
            <span className="flex min-w-0 items-center gap-2.5"><LivingContextIcon active={open} /><span className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-200/80">Atlas Context</span><span className="block truncate text-[12px] font-semibold text-white/95">{place || station.name}</span></span></span>
            <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/55">{open ? 'Hide' : 'Open'}</span>
          </button>
          {open ? <div className="border-t border-white/10 px-3.5 pb-3 pt-3">{actions}{weatherPanel}<p className="mt-2.5 text-[10px] leading-4 text-white/50">{voicePrompt}</p></div> : null}
        </div>
      </aside>
    </>
  );
}
