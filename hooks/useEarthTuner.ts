'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map } from 'maplibre-gl';
import type { GeoFocus } from '@/lib/geo-focus';
import type { RankedStationCandidate } from '@/lib/station-ranking';

export type EarthTunerState = 'idle' | 'scanning' | 'weak_signal' | 'signal_found' | 'locked' | 'no_signal';

type NearbyResponse = {
  focusedPlace?: GeoFocus;
  focus?: GeoFocus;
  countryCode?: string;
  candidates: RankedStationCandidate[];
  bestCandidate?: RankedStationCandidate | null;
  best?: RankedStationCandidate | null;
  signalStrength?: number;
  searchRadiusKm?: number;
};

export function useEarthTuner(map: Map | null) {
  const [state, setState] = useState<EarthTunerState>('idle');
  const [focus, setFocus] = useState<GeoFocus | null>(null);
  const [candidates, setCandidates] = useState<RankedStationCandidate[]>([]);
  const [best, setBest] = useState<RankedStationCandidate | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const scanCenter = useCallback(async () => {
    if (!map) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    setState('scanning');
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const radiusKm = zoom <= 2 ? 1200 : zoom <= 4 ? 500 : zoom <= 7 ? 150 : zoom <= 10 ? 50 : 20;
      const params = new URLSearchParams({ lat: String(center.lat), lng: String(center.lng), zoom: String(zoom), radiusKm: String(radiusKm), limit: '5' });
      const res = await fetch(`/api/stations/nearby?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Nearby station scan failed');
      const data = (await res.json()) as NearbyResponse;
      const bestCandidate = data.bestCandidate ?? data.best ?? null;
      setFocus(data.focusedPlace ?? data.focus ?? null);
      setCandidates(data.candidates);
      setBest(bestCandidate);
      setState(bestCandidate ? (bestCandidate.signalStrength < 35 ? 'weak_signal' : 'signal_found') : 'no_signal');
      setError('');
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === 'AbortError') return;
      setCandidates([]);
      setBest(null);
      setState('no_signal');
      setError(scanError instanceof Error ? scanError.message : 'No signal here');
    }
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const start = () => {
      if (timer.current) window.clearTimeout(timer.current);
      setState('scanning');
    };
    const moving = () => setState('scanning');
    const settle = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void scanCenter(), 600);
    };
    map.on('movestart', start);
    map.on('dragstart', start);
    map.on('zoomstart', start);
    map.on('rotatestart', start);
    map.on('move', moving);
    map.on('moveend', settle);
    map.on('zoomend', settle);
    map.on('rotateend', settle);
    timer.current = window.setTimeout(() => void scanCenter(), 0);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      abort.current?.abort();
      map.off('movestart', start); map.off('dragstart', start); map.off('zoomstart', start); map.off('rotatestart', start); map.off('move', moving); map.off('moveend', settle); map.off('zoomend', settle); map.off('rotateend', settle);
    };
  }, [map, scanCenter]);

  return { state, setState, focus, candidates, best, error, rescan: scanCenter };
}
