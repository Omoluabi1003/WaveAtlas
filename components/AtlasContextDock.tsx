"use client";

import { CloudSun, Mic, Newspaper, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Station } from '@/lib/stations';
import type { WorldContext } from '@/lib/world-engine/types';

type CoordinatedContext = {
  placeLabel?: string;
  weatherTitle?: string;
  weatherSummary?: string;
  voicePrompt?: string;
};

function stationPlace(station?: Station | null) {
  return [station?.city || station?.state, station?.country].filter(Boolean).join(', ');
}

function climateSummary(context?: WorldContext | null) {
  const climate = context?.climate;
  if (!climate) return undefined;
  const parts = [
    typeof climate.temperatureC === 'number' ? `${Math.round(climate.temperatureC)}°C` : null,
    typeof climate.humidityPercent === 'number' ? `${Math.round(climate.humidityPercent)}% humidity` : null,
    typeof climate.windSpeedMetersPerSecond === 'number' ? `${Math.round(climate.windSpeedMetersPerSecond)} m/s wind` : null,
    typeof climate.rainfallMillimeters === 'number' ? `${climate.rainfallMillimeters} mm rain` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

async function fetchContext(station: Station, signal: AbortSignal) {
  const params = new URLSearchParams();
  params.set('stationName', station.name);
  if (station.city) params.set('city', station.city);
  if (station.state) params.set('state', station.state);
  if (station.country) params.set('country', station.country);
  if (station.country_code) params.set('countryCode', station.country_code);
  if (station.language) params.set('language', station.language);
  if (typeof station.latitude === 'number') params.set('lat', String(station.latitude));
  if (typeof station.longitude === 'number') params.set('lng', String(station.longitude));
  const response = await fetch(`/api/world-context?${params.toString()}`, { signal });
  return response.ok ? await response.json() as WorldContext : null;
}

export function AtlasContextDock() {
  const [station, setStation] = useState<Station | null>(null);
  const [context, setContext] = useState<WorldContext | null>(null);
  const [coordinated, setCoordinated] = useState<CoordinatedContext | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingWeather, setLoadingWeather] = useState(false);

  useEffect(() => {
    const onStation = (event: Event) => {
      const next = (event as CustomEvent<Station | null>).detail;
      if (next?.name) {
        setStation(next);
        setContext(null);
        setCoordinated(null);
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

  const place = coordinated?.placeLabel || context?.radioDNA.placeLabel || stationPlace(station) || station?.name;
  const weather = coordinated?.weatherSummary || climateSummary(context);
  const voicePrompt = coordinated?.voicePrompt || (place ? `Ask Atlas about ${place}.` : 'Ask Atlas about this station.');

  const weatherLabel = useMemo(() => coordinated?.weatherTitle || "Uncle Paul's Weather Forecast", [coordinated?.weatherTitle]);

  if (!station) return null;

  const openBrief = () => window.dispatchEvent(new Event('waveatlas:open-mobile-brief'));
  const openVoice = () => window.dispatchEvent(new Event('waveatlas:open-atlas-voice'));
  const showWeather = async () => {
    setOpen(true);
    if (weather || context || loadingWeather) return;
    setLoadingWeather(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      setContext(await fetchContext(station, controller.signal));
    } catch {
      setContext(null);
    } finally {
      window.clearTimeout(timeout);
      setLoadingWeather(false);
    }
  };

  return (
    <aside className="pointer-events-none fixed right-[max(.75rem,env(safe-area-inset-right))] top-[max(4.5rem,calc(env(safe-area-inset-top)+4.5rem))] z-[92] w-[min(92vw,22rem)]" aria-label="Atlas Context">
      <div className="pointer-events-auto ml-auto overflow-hidden rounded-[1.15rem] border border-white/15 bg-slate-950/78 text-white shadow-[0_14px_38px_rgba(0,0,0,.34)] backdrop-blur-xl">
        <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70" aria-expanded={open}>
          <span className="flex min-w-0 items-center gap-2.5">
            <Sparkles className="size-4 shrink-0 text-emerald-200" />
            <span className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-200/80">Atlas Context</span><span className="block truncate text-[12px] font-semibold text-white/95">{place || station.name}</span></span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/55">{open ? 'Hide' : 'Open'}</span>
        </button>

        {open ? (
          <div className="border-t border-white/10 px-3.5 pb-3 pt-3">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={openBrief} className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2.5 text-center text-[10px] font-semibold text-white/82 transition hover:bg-white/[0.07]"><Newspaper className="mx-auto mb-1 size-4 text-gold" />Daily Brief</button>
              <button type="button" onClick={showWeather} className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2.5 text-center text-[10px] font-semibold text-white/82 transition hover:bg-white/[0.07]"><CloudSun className="mx-auto mb-1 size-4 text-sky-200" />Weather</button>
              <button type="button" onClick={openVoice} className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2.5 text-center text-[10px] font-semibold text-white/82 transition hover:bg-white/[0.07]"><Mic className="mx-auto mb-1 size-4 text-emerald-200" />Atlas Voice</button>
            </div>

            <div className="mt-3 rounded-xl border border-white/8 bg-black/15 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-sky-200/80">{weatherLabel}</p>
                  <p className="mt-1 text-[11px] leading-4 text-white/68">{loadingWeather ? 'Loading verified destination weather…' : weather || 'Tap Weather to load destination conditions.'}</p>
                </div>
                {weather || loadingWeather ? <button type="button" onClick={() => { setContext(null); setCoordinated(null); }} aria-label="Clear weather context" className="shrink-0 rounded-full p-1 text-white/40 hover:text-white/70"><X className="size-3.5" /></button> : null}
              </div>
            </div>

            <p className="mt-2.5 text-[10px] leading-4 text-white/50">{voicePrompt}</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
