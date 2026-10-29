'use client';

import { CloudSun, Headphones, MapPin, Newspaper, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { JourneyPlace } from '@/lib/atlas-journey';
import type { Station } from '@/lib/stations';

type WeatherPayload = {
  ok?: boolean;
  error?: string;
  weather?: {
    timezone?: string;
    condition?: string;
    temperatureC?: number;
    apparentTemperatureC?: number;
    highC?: number;
    lowC?: number;
    precipitationProbabilityPercent?: number;
  };
  source?: { name?: string; attribution?: string };
};

function round(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

export default function AtlasJourneyArrival({
  destination,
  station,
  queue,
  onListen,
  onBrief,
  onExplore,
}: {
  destination: JourneyPlace;
  station?: Station | null;
  queue: Station[];
  onListen: (station: Station, queue: Station[]) => void;
  onBrief: (station: Station) => void;
  onExplore: (station?: Station | null, queue?: Station[]) => void;
}) {
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ lat: String(destination.lat), lng: String(destination.lng) });
        const response = await fetch(`/api/weather?${params.toString()}`, { signal: controller.signal });
        const payload = await response.json() as WeatherPayload;
        if (!controller.signal.aborted) setWeather(payload);
      } catch {
        if (!controller.signal.aborted) setWeather({ ok: false, error: 'Destination weather is temporarily unavailable.', source: { name: 'Open-Meteo' } });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [destination.lat, destination.lng]);

  const w = weather?.weather;
  const temperature = round(w?.temperatureC);
  const high = round(w?.highC);
  const low = round(w?.lowC);
  const rain = round(w?.precipitationProbabilityPercent);
  const source = weather?.source?.attribution || weather?.source?.name || 'Open-Meteo';

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-[#00D68F]/25 bg-[linear-gradient(135deg,rgba(0,214,143,.09),rgba(212,166,74,.05))] p-4 sm:p-5" aria-label="Atlas Journey arrival">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full border border-[#00D68F]/30 bg-[#00D68F]/10 text-[#00D68F]"><MapPin className="size-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#00D68F]">Arrival</p>
          <h3 className="mt-1 break-words text-lg font-semibold text-white">Welcome to {destination.label}</h3>
          <p className="mt-1 text-xs leading-5 text-white/55">Your route has resolved into the destination. Stay with the local sound or step back into the Atlas around you.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#08111D]/65 p-3">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.14em] text-sky-200/75"><CloudSun className="size-3.5" />Destination weather</div>
          {loading ? <p className="mt-2 text-xs text-white/60">Loading sourced forecast…</p> : weather?.ok && w ? <><p className="mt-2 text-sm font-semibold text-white">{w.condition || 'Current conditions'}{temperature !== null ? ` · ${temperature}°C` : ''}</p><p className="mt-1 text-[11px] leading-5 text-white/50">{high !== null && low !== null ? `High ${high}° · Low ${low}°` : 'Daily range unavailable'}{rain !== null ? ` · Rain ${rain}%` : ''}</p><p className="mt-1 text-[9px] text-white/35">Source: {source}</p></> : <><p className="mt-2 text-xs leading-5 text-white/60">{weather?.error || 'Destination weather is temporarily unavailable.'}</p><p className="mt-1 text-[9px] text-white/35">Source: {source}</p></>}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#08111D]/65 p-3">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.14em] text-[#D4A64A]"><Sparkles className="size-3.5" />Destination sound</div>
          {station ? <><p className="mt-2 break-words text-sm font-semibold text-white">{station.name}</p><p className="mt-1 text-[11px] leading-5 text-white/50">{station.city || station.state || destination.label} · {station.language || 'Language unlisted'}</p></> : <p className="mt-2 text-xs leading-5 text-white/55">No verified local signal is available yet. You can still explore the destination geography.</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {station ? <button type="button" onClick={() => onListen(station, queue)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#00D68F]/35 bg-[#00D68F]/10 px-3 text-xs font-semibold text-[#00D68F]"><Headphones className="size-3.5" />Listen local</button> : null}
        {station ? <button type="button" onClick={() => onBrief(station)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-3 text-xs font-semibold text-white/80"><Newspaper className="size-3.5" />Destination Brief</button> : null}
        <button type="button" onClick={() => onExplore(station, queue)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#D4A64A]/40 bg-[#D4A64A]/10 px-3 text-xs font-semibold text-[#D4A64A]"><MapPin className="size-3.5" />Explore destination</button>
      </div>
    </section>
  );
}
