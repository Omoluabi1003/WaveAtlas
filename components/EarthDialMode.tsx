'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl, { type Map, type Marker } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Station } from '@/lib/stations';
import { resolveStationGeo } from '@/lib/geotruth-resolver';
import { useEarthTuner } from '@/hooks/useEarthTuner';
import { TuningReticle } from './TuningReticle';
import { SignalLockCard } from './SignalLockCard';
import type { RankedStationCandidate } from '@/lib/station-ranking';

const dialStyle: maplibregl.StyleSpecification = { version: 8, sources: { earth: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'earth', type: 'raster', source: 'earth' }] };

function markerHtml() { return '<span class="station-pulse-ring"></span><span class="station-pulse-ring two"></span><span class="station-pulse-dot"></span>'; }

export function EarthDialMode({ current, onStationSelect, mobile = false }: { current?: Station; onStationSelect: (station: Station) => void; mobile?: boolean }) {
  const container = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<Map | null>(null);
  const marker = useRef<Marker | null>(null);
  const { state, setState, focus, candidates, best, error } = useEarthTuner(map);
  const strength = best?.signalStrength ?? (state === 'scanning' ? 38 : 0);

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({ container: container.current, style: dialStyle, center: [8.6753, 9.082], zoom: mobile ? 1.55 : 2.05, attributionControl: false });
    m.addControl(new maplibregl.AttributionControl({ compact: true }));
    const resize = () => requestAnimationFrame(() => m.resize());
    m.once('load', resize);
    window.addEventListener('resize', resize);
    setMap(m);
    return () => { window.removeEventListener('resize', resize); marker.current?.remove(); m.remove(); };
  }, [mobile]);

  const lockCandidate = (candidate: RankedStationCandidate) => {
    onStationSelect(candidate.station);
    setState('locked');
    if (!map) return;
    marker.current?.remove();
    const element = document.createElement('div');
    element.className = 'station-pulse-marker tone-radio-gold status-playing';
    element.innerHTML = markerHtml();
    marker.current = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([candidate.lng, candidate.lat]).addTo(map);
    map.easeTo({ center: [candidate.lng, candidate.lat], zoom: Math.max(map.getZoom(), candidate.geoPrecision === 'station' ? 7 : 5), essential: true });
  };

  useEffect(() => {
    if (!map || !current) return;
    const geo = resolveStationGeo(current);
    if (geo.lat === null || geo.lng === null) return;
    marker.current?.remove();
    const element = document.createElement('div');
    element.className = 'station-pulse-marker tone-radio-gold status-playing';
    element.innerHTML = markerHtml();
    marker.current = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([geo.lng, geo.lat]).addTo(map);
  }, [current, map]);

  const statusCopy = useMemo(() => state === 'signal_found' || state === 'weak_signal' ? 'Map center became a playable frequency. Lock the strongest local signal.' : state === 'no_signal' ? 'No verified playable station is close enough to this focus.' : 'Move Earth. The center reticle is the tuner needle.', [state]);

  return <div className={mobile ? 'fixed inset-0 z-0 h-[100dvh] w-full overflow-hidden bg-slate-950' : 'relative h-[620px] overflow-hidden rounded-[2rem] border border-slate-700/60 bg-slate-950 shadow-2xl'}>
    <div ref={container} className="absolute inset-0 h-full w-full" />
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_26%,rgba(7,17,31,.38)_62%,rgba(2,6,23,.82)),linear-gradient(180deg,rgba(2,6,23,.2),transparent_40%,rgba(2,6,23,.62))]" />
    <div className="pointer-events-none absolute left-4 top-4 z-30 max-w-[min(25rem,calc(100%-2rem))] rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-white shadow-xl backdrop-blur-xl">
      <p className="font-mono text-[10px] uppercase tracking-[.28em] text-radio">Earth Dial mode</p>
      <h2 className="mt-1 text-xl font-black">Move Earth to tune</h2>
      <p className="mt-1 text-xs leading-5 text-ivory/65">{statusCopy}</p>
    </div>
    <TuningReticle state={state} strength={strength} />
    <SignalLockCard state={state} focus={focus} best={best} candidates={candidates} error={error} onTune={() => best && lockCandidate(best)} onPick={lockCandidate} />
  </div>;
}
