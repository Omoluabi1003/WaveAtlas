'use client';

import { useEffect, useMemo, useState } from 'react';
import { Globe2, MapPinned, X } from 'lucide-react';
import { JOURNEY_COUNTRIES, JOURNEY_PRESETS, type JourneyRoute } from '@/lib/atlas-journey';

const REGIONS = ['All', 'Africa', 'Europe', 'Middle East', 'Asia', 'Americas', 'Oceania'] as const;
type Region = (typeof REGIONS)[number];

const AFRICA = new Set(['NG','KE','ZA','GH','SN','EG']);
const EUROPE = new Set(['GB','FR','DE','IT','ES','PT','GR']);
const MIDDLE_EAST = new Set(['AE','TR']);
const ASIA = new Set(['JP','KR','TH','SG','IN','NP','ID','PH']);
const AMERICAS = new Set(['US','CA','MX','GT','CO','PE','BR','AR']);
const OCEANIA = new Set(['AU','NZ']);

function regionFor(route: JourneyRoute): Region {
  const codes = [route.from.countryCode, route.to.countryCode].filter(Boolean) as string[];
  if (codes.some((code) => AFRICA.has(code))) return 'Africa';
  if (codes.some((code) => EUROPE.has(code))) return 'Europe';
  if (codes.some((code) => MIDDLE_EAST.has(code))) return 'Middle East';
  if (codes.some((code) => ASIA.has(code))) return 'Asia';
  if (codes.some((code) => AMERICAS.has(code))) return 'Americas';
  if (codes.some((code) => OCEANIA.has(code))) return 'Oceania';
  return 'All';
}

function city(label: string) {
  return label.split(',')[0]?.trim() || label;
}

function routeButtonLabel(route: JourneyRoute) {
  return `${city(route.from.label)} → ${city(route.to.label)}`;
}

function isJourneyDeepLink() {
  if (typeof window === 'undefined') return false;
  const url = `${window.location.pathname}${window.location.search}${window.location.hash}`.toLowerCase();
  return url.includes('journey=') || url.includes('/journey/');
}

export default function AtlasJourneyWorldEntry() {
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<Region>('All');
  const [session, setSession] = useState(0);
  const [dismissedSession, setDismissedSession] = useState<number | null>(null);

  useEffect(() => {
    let visible = false;
    const check = () => {
      const title = document.getElementById('journey-title');
      const nextVisible = Boolean(title);
      if (nextVisible && !visible) {
        setSession((value) => value + 1);
        setRegion('All');
      }
      visible = nextVisible;
      setOpen(nextVisible && !isJourneyDeepLink());
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const routes = useMemo(() => region === 'All' ? JOURNEY_PRESETS : JOURNEY_PRESETS.filter((route) => regionFor(route) === region), [region]);
  const hidden = dismissedSession === session;
  if (!open || hidden) return null;

  const choose = (route: JourneyRoute) => {
    const expected = routeButtonLabel(route).replace(/\s+/g, ' ').trim();
    const dialog = document.getElementById('journey-title')?.closest('[role="dialog"]');
    const buttons = [...(dialog?.querySelectorAll<HTMLButtonElement>('button') || [])];
    const target = buttons.find((button) => (button.textContent || '').replace(/\s+/g, ' ').trim() === expected);
    if (target) {
      target.click();
      setDismissedSession(session);
      return;
    }
    setDismissedSession(session);
  };

  const closeJourney = () => {
    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Close Atlas Journey"]');
    close?.click();
  };

  return (
    <div className="fixed inset-0 z-[1002] overflow-y-auto bg-[#030914]/98 px-3 py-[max(12px,env(safe-area-inset-top))] text-[#F7F5EF] backdrop-blur-xl" aria-label="Atlas Journey world routes">
      <section className="mx-auto max-w-6xl overflow-hidden rounded-[1.6rem] border border-[#D4A64A]/25 bg-[#08111D] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-7">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[#D4A64A]">Explore humanity through sound</p>
            <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Where do you want to go<span className="text-[#D4A64A]">?</span></h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-white/55">Choose a world route first. Atlas Journey will then build the listening corridor, travel mode, signals and route intelligence around your choice.</p>
          </div>
          <button type="button" aria-label="Close Atlas Journey" onClick={closeJourney} className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-white/15 text-white hover:border-[#D4A64A]/70 hover:bg-white/10"><X className="size-5" /></button>
        </header>

        <div className="p-5 sm:p-7">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><Globe2 className="size-5 text-[#D4A64A]" /><p className="mt-3 text-2xl font-semibold">{JOURNEY_COUNTRIES.length}+</p><p className="text-xs text-white/50">countries and territories in the destination catalog</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><MapPinned className="size-5 text-[#D4A64A]" /><p className="mt-3 text-2xl font-semibold">{JOURNEY_PRESETS.length}</p><p className="text-xs text-white/50">curated starter routes across the world</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#D4A64A]">No default trip</p><p className="mt-3 text-sm font-semibold">You choose the geography.</p><p className="mt-1 text-xs text-white/50">Flight, Drive, Bicycle and Walk appear after route selection.</p></div>
          </div>

          <div className="mt-6 flex gap-2 overflow-x-auto pb-2" aria-label="Route regions">
            {REGIONS.map((item) => <button key={item} type="button" aria-pressed={region === item} onClick={() => setRegion(item)} className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-semibold ${region === item ? 'border-[#D4A64A] bg-[#D4A64A]/10 text-[#D4A64A]' : 'border-white/15 text-white/65 hover:bg-white/10'}`}>{item}</button>)}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {routes.map((route) => <button key={`${route.from.label}-${route.to.label}`} type="button" onClick={() => choose(route)} className="group min-h-24 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-left transition hover:border-[#D4A64A]/60 hover:bg-white/[.06]">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#D4A64A]">{regionFor(route)}</p>
              <p className="mt-2 text-sm font-semibold leading-5 text-white">{city(route.from.label)} <span className="px-1 text-[#D4A64A]">→</span> {city(route.to.label)}</p>
              <p className="mt-1 text-[11px] text-white/45">{route.from.countryCode} · {route.to.countryCode}</p>
            </button>)}
          </div>

          <p className="mt-6 text-center text-[11px] leading-5 text-white/40">After choosing a starter route, use the existing Departure and Destination search to replace either endpoint with any supported country or station location.</p>
        </div>
      </section>
    </div>
  );
}
