"use client";

import { useEffect } from 'react';
import { updateReciprocalAtlasSession } from '@/lib/atlas-reciprocal-session';
import type { ReciprocalAtlasInput, ReciprocalAtlasSignal } from '@/lib/atlas-reciprocal-intelligence';

const FAILURE_PATTERN = /failed|offline|error|unavailable/i;

type PlaybackContext = { status?: string };
type WeatherContext = { severity?: ReciprocalAtlasInput['weatherSeverity']; isEmergency?: boolean };

export function ReciprocalAtlasBridge() {
  useEffect(() => {
    let playbackStatus = 'idle';
    let interactionCount = 0;
    let consecutiveFailures = 0;
    let weatherSeverity: ReciprocalAtlasInput['weatherSeverity'] = 'none';
    let emergencyActive = false;
    let currentSignal: ReciprocalAtlasSignal | null = null;

    const publish = () => {
      currentSignal = updateReciprocalAtlasSession({
        playbackStatus,
        localHour: new Date().getHours(),
        interactionCount,
        consecutiveFailures,
        weatherSeverity,
        emergencyActive,
      });
      window.dispatchEvent(new CustomEvent('waveatlas:reciprocal-context', { detail: currentSignal }));
    };

    const onPlayback = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackContext>).detail;
      if (!detail?.status) return;
      playbackStatus = detail.status;
      if (FAILURE_PATTERN.test(playbackStatus)) consecutiveFailures += 1;
      else if (/playing|live/i.test(playbackStatus)) consecutiveFailures = 0;
      publish();
    };

    const onInteraction = () => {
      interactionCount = Math.min(50, interactionCount + 1);
      publish();
    };

    const onWeather = (event: Event) => {
      const detail = (event as CustomEvent<WeatherContext>).detail;
      if (!detail) return;
      weatherSeverity = detail.severity || 'none';
      emergencyActive = Boolean(detail.isEmergency);
      publish();
    };

    const onRequest = () => {
      if (currentSignal) window.dispatchEvent(new CustomEvent('waveatlas:reciprocal-context', { detail: currentSignal }));
      else publish();
    };

    window.addEventListener('waveatlas:playback-context', onPlayback);
    window.addEventListener('waveatlas:weather-context', onWeather);
    window.addEventListener('waveatlas:request-reciprocal-context', onRequest);
    window.addEventListener('pointerdown', onInteraction, { passive: true });
    window.addEventListener('keydown', onInteraction);
    publish();

    return () => {
      window.removeEventListener('waveatlas:playback-context', onPlayback);
      window.removeEventListener('waveatlas:weather-context', onWeather);
      window.removeEventListener('waveatlas:request-reciprocal-context', onRequest);
      window.removeEventListener('pointerdown', onInteraction);
      window.removeEventListener('keydown', onInteraction);
    };
  }, []);

  return null;
}
