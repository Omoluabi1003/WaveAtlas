"use client";

import { useEffect } from 'react';
import type { AtlasCue } from '@/lib/atlas-cue-orchestrator';
import type { Station } from '@/lib/stations';
import type { WorldContext } from '@/lib/world-engine/types';

type CoordinatedContext = {
  cue: AtlasCue;
  stationName?: string;
  placeLabel?: string;
  voicePrompt?: string;
  briefFocus?: string;
  weatherTitle?: string;
  weatherSummary?: string;
  generatedAt: string;
};

function placeFor(station?: Station | null) {
  return [station?.city || station?.state, station?.country].filter(Boolean).join(', ');
}

function weatherSummary(context?: WorldContext | null) {
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

export function AtlasContextCoordinator({ station }: { station?: Station | null }) {
  useEffect(() => {
    const onCue = async (event: Event) => {
      const cue = (event as CustomEvent<AtlasCue>).detail;
      if (!cue) return;

      const place = placeFor(station) || 'this destination';
      let context: WorldContext | null = null;

      if (station && (cue.action === 'open_brief' || cue.id.includes('awareness'))) {
        const params = new URLSearchParams();
        params.set('stationName', station.name);
        if (station.city) params.set('city', station.city);
        if (station.state) params.set('state', station.state);
        if (station.country) params.set('country', station.country);
        if (station.country_code) params.set('countryCode', station.country_code);
        if (station.language) params.set('language', station.language);
        if (typeof station.latitude === 'number') params.set('lat', String(station.latitude));
        if (typeof station.longitude === 'number') params.set('lng', String(station.longitude));

        try {
          const response = await fetch(`/api/world-context?${params.toString()}`, { signal: AbortSignal.timeout(5000) });
          context = response.ok ? await response.json() as WorldContext : null;
        } catch {
          context = null;
        }
      }

      const coordinated: CoordinatedContext = {
        cue,
        stationName: station?.name,
        placeLabel: context?.radioDNA.placeLabel || place,
        voicePrompt: cue.action === 'open_brief'
          ? `Ask Atlas what matters around ${context?.radioDNA.placeLabel || place}.`
          : cue.action === 'open_search'
            ? `Ask Atlas to find another reliable signal near ${place}.`
            : undefined,
        briefFocus: cue.action === 'open_brief' ? (context?.radioDNA.placeLabel || place) : undefined,
        weatherTitle: context?.climate ? "Uncle Paul's Weather Forecast" : undefined,
        weatherSummary: weatherSummary(context),
        generatedAt: new Date().toISOString(),
      };

      window.dispatchEvent(new CustomEvent('waveatlas:coordinated-context', { detail: coordinated }));
      if (coordinated.weatherSummary) {
        window.dispatchEvent(new CustomEvent('waveatlas:weather-forecast', { detail: coordinated }));
      }
      if (coordinated.voicePrompt) {
        window.dispatchEvent(new CustomEvent('waveatlas:atlas-voice-context', { detail: coordinated }));
      }
    };

    window.addEventListener('waveatlas:adaptive-cue', onCue);
    return () => window.removeEventListener('waveatlas:adaptive-cue', onCue);
  }, [station]);

  return null;
}
