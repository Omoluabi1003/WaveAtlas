'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bike, Car, Footprints, Plane, Route } from 'lucide-react';
import { decodeJourney, type JourneyRoute } from '@/lib/atlas-journey-contract';
import { journeyLaunchDistanceKm, journeyLaunchModes, recommendedJourneyLaunchProfile } from '@/lib/journey-launch-state';
import type { AtlasTravelProfile } from '@/lib/atlas-travel-mode';

const PROFILE_LABELS: Record<AtlasTravelProfile, string> = {
  flight: 'Flight',
  drive: 'Drive',
  bicycle: 'Bicycle',
  walk: 'Walk',
};

const PROFILE_ICONS = {
  flight: Plane,
  drive: Car,
  bicycle: Bike,
  walk: Footprints,
} as const;

function shortPlace(label: string) {
  const parts = label.split(' · ');
  return parts[0] || label;
}

export default function AtlasJourneyLaunchState() {
  const [route, setRoute] = useState<JourneyRoute | null>(null);
  const [selected, setSelected] = useState<AtlasTravelProfile>('flight');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('journeyMode')) return;
    const decoded = decodeJourney(params.get('journey'));
    if (!decoded) return;
    const recommended = recommendedJourneyLaunchProfile(decoded);
    setRoute(decoded);
    setSelected(recommended);
    setVisible(true);
  }, []);

  const modes = useMemo(() => route ? journeyLaunchModes(route).filter((mode) => mode.enabled) : [], [route]);
  const distanceKm = useMemo(() => route ? journeyLaunchDistanceKm(route) : 0, [route]);

  if (!visible || !route) return null;

  const begin = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('journeyLaunch');
    url.searchParams.set('journeyMode', selected);
    window.history.replaceState({}, '', url.toString());
    window.dispatchEvent(new CustomEvent('waveatlas:journey-profile', { detail: { profile: selected } }));
    setVisible(false);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[1003] flex items-end justify-center bg-[linear-gradient(to_top,rgba(3,9,20,.98)_0%,rgba(3,9,20,.92)_44%,rgba(3,9,20,.20)_76%,transparent_100%)] px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-24 text-[#F7F5EF] sm:items-center sm:bg-[#030914]/78 sm:backdrop-blur-sm">
      <section className="pointer-events-auto w-full max-w-2xl rounded-[1.6rem] border border-[#D4A64A]/30 bg-[#08111D]/96 p-5 shadow-2xl sm:p-6" aria-labelledby="journey-launch-title">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#D4A64A]/25 bg-[#D4A64A]/10"><Route className="size-4 text-[#D4A64A]" /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#D4A64A]">Journey ready</p>
            <h2 id="journey-launch-title" className="mt-1 text-xl font-semibold">Choose how this route moves.</h2>
            <p className="mt-1 text-xs leading-5 text-white/50">WaveAtlas has framed your airport-to-airport corridor. Pick a sensible travel mode, then enter the live Journey.</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.025] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><span>{shortPlace(route.from.label)}</span><span className="text-[#D4A64A]">→</span><span>{shortPlace(route.to.label)}</span></div>
          <p className="mt-1 text-[11px] text-white/45">Approx. {Math.round(distanceKm).toLocaleString()} km direct airport separation</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {modes.map((mode) => {
            const Icon = PROFILE_ICONS[mode.profile];
            const active = selected === mode.profile;
            return (
              <button
                key={mode.profile}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(mode.profile)}
                className={`min-h-20 rounded-2xl border px-3 py-3 text-left transition ${active ? 'border-[#D4A64A] bg-[#D4A64A]/10 text-white' : 'border-white/10 bg-white/[.025] text-white/65 hover:border-white/20'}`}
              >
                <Icon className={`size-4 ${active ? 'text-[#D4A64A]' : 'text-white/45'}`} />
                <p className="mt-2 text-sm font-semibold">{PROFILE_LABELS[mode.profile]}</p>
                {mode.recommended ? <p className="mt-1 text-[9px] font-bold uppercase tracking-[.14em] text-[#00D68F]">Recommended</p> : null}
              </button>
            );
          })}
        </div>

        <button type="button" onClick={begin} className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#D4A64A] px-5 text-sm font-bold text-[#08111D] transition hover:brightness-110">Enter Journey</button>
      </section>
    </div>
  );
}
