'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Globe2, Lightbulb, MapPin, MapPinned, X } from 'lucide-react';
import { JOURNEY_COUNTRIES, JOURNEY_PRESETS, type JourneyPlace, type JourneyRoute } from '@/lib/atlas-journey';

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

function placeKey(place: JourneyPlace) {
  return `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
}

function isJourneyDeepLink() {
  if (typeof window === 'undefined') return false;
  const url = `${window.location.pathname}${window.location.search}${window.location.hash}`.toLowerCase();
  return url.includes('journey=') || url.includes('/journey/');
}

function EndpointPicker({ label, value, places, onChange }: { label: string; value: JourneyPlace | null; places: JourneyPlace[]; onChange: (place: JourneyPlace) => void }) {
  const selectedKey = value ? placeKey(value) : '';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#D4A64A]"><MapPin className="size-3.5" />{label}</div>
      <label className="sr-only" htmlFor={`journey-entry-${label.toLowerCase()}`}>Choose {label.toLowerCase()}</label>
      <div className="relative mt-3">
        <select
          id={`journey-entry-${label.toLowerCase()}`}
          value={selectedKey}
          onChange={(event) => {
            const place = places.find((candidate) => placeKey(candidate) === event.target.value);
            if (place) onChange(place);
          }}
          className="min-h-12 w-full appearance-none rounded-xl border border-white/15 bg-[#08111D] px-4 pr-11 text-sm font-semibold text-white outline-none transition focus:border-[#D4A64A]"
        >
          <option value="">Choose {label.toLowerCase()}</option>
          {places.map((place) => <option key={placeKey(place)} value={placeKey(place)}>{place.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#D4A64A]" />
      </div>
      <p className="mt-2 text-[10px] text-white/35">Tap to choose from the global city and country catalog.</p>
    </div>
  );
}

export default function AtlasJourneyWorldEntry() {
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<Region>('All');
  const [session, setSession] = useState(0);
  const [dismissedSession, setDismissedSession] = useState<number | null>(null);
  const [departure, setDeparture] = useState<JourneyPlace | null>(null);
  const [destination, setDestination] = useState<JourneyPlace | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let visible = false;
    const check = () => {
      const title = document.getElementById('journey-title');
      const nextVisible = Boolean(title);
      if (nextVisible && !visible) {
        setSession((value) => value + 1);
        setRegion('All');
        setDeparture(null);
        setDestination(null);
        setStatus('');
      }
      visible = nextVisible;
      setOpen(nextVisible && !isJourneyDeepLink());
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const places = useMemo(() => [...JOURNEY_PRESETS.flatMap((route) => [route.from, route.to]), ...JOURNEY_COUNTRIES].filter((place, index, all) => all.findIndex((other) => placeKey(other) === placeKey(place)) === index), []);
  const routes = useMemo(() => region === 'All' ? JOURNEY_PRESETS : JOURNEY_PRESETS.filter((route) => regionFor(route) === region), [region]);
  const hidden = dismissedSession === session;
  if (!open || hidden) return null;

  const setNativeInputValue = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const applyEndpoint = async (id: 'journey-Departure' | 'journey-Destination', place: JourneyPlace) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (!input) return false;
    setNativeInputValue(input, place.label);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const fieldset = input.closest('fieldset');
    const target = [...(fieldset?.querySelectorAll<HTMLButtonElement>('button') || [])].find((button) => (button.textContent || '').trim().startsWith(place.label));
    if (!target) return false;
    target.click();
    return true;
  };

  const continueJourney = async () => {
    if (!departure || !destination) return;
    if (placeKey(departure) === placeKey(destination)) {
      setStatus('Choose two different places for this journey.');
      return;
    }
    setStatus('Building your route…');
    const departureApplied = await applyEndpoint('journey-Departure', departure);
    const destinationApplied = await applyEndpoint('journey-Destination', destination);
    if (!departureApplied || !destinationApplied) {
      setStatus('Atlas could not hand off one endpoint. Choose another location or try again.');
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
            <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Build your own Atlas Journey<span className="text-[#D4A64A]">.</span></h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-white/55">Choose where you are leaving from and where you want to go. WaveAtlas builds the listening corridor around your geography—not ours.</p>
          </div>
          <button type="button" aria-label="Close Atlas Journey" onClick={closeJourney} className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-white/15 text-white hover:border-[#D4A64A]/70 hover:bg-white/10"><X className="size-5" /></button>
        </header>

        <div className="p-5 sm:p-7">
          <div className="grid gap-3 sm:grid-cols-2">
            <EndpointPicker label="Departure" value={departure} places={places} onChange={setDeparture} />
            <EndpointPicker label="Destination" value={destination} places={places} onChange={setDestination} />
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#D4A64A]/20 bg-[#D4A64A]/[.05] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#D4A64A]">Your route</p><p className="mt-1 text-sm font-semibold">{departure?.label || 'Departure'} <ArrowRight className="mx-1 inline size-4 text-[#D4A64A]" /> {destination?.label || 'Destination'}</p>{status ? <p className="mt-1 text-[11px] text-white/50" role="status">{status}</p> : null}</div>
            <button type="button" disabled={!departure || !destination} onClick={() => void continueJourney()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#D4A64A] px-6 text-sm font-bold text-[#08111D] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35">Continue <ArrowRight className="size-4" /></button>
          </div>

          <div className="mt-7 border-t border-white/10 pt-6">
            <div className="flex items-center gap-2"><Lightbulb className="size-4 text-[#D4A64A]" /><p className="text-xs font-semibold">Need inspiration?</p></div>
            <p className="mt-1 text-[11px] text-white/45">Starter routes only fill the two choices above. Nothing starts until you press Continue.</p>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label="Route regions">
              {REGIONS.map((item) => <button key={item} type="button" aria-pressed={region === item} onClick={() => setRegion(item)} className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-semibold ${region === item ? 'border-[#D4A64A] bg-[#D4A64A]/10 text-[#D4A64A]' : 'border-white/15 text-white/65 hover:bg-white/10'}`}>{item}</button>)}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {routes.map((route) => <button key={`${route.from.label}-${route.to.label}`} type="button" onClick={() => { setDeparture(route.from); setDestination(route.to); setStatus('Starter route loaded. Edit either endpoint or continue.'); }} className="group min-h-20 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-left transition hover:border-[#D4A64A]/60 hover:bg-white/[.06]">
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#D4A64A]">{regionFor(route)}</p>
                <p className="mt-2 text-sm font-semibold leading-5 text-white">{city(route.from.label)} <span className="px-1 text-[#D4A64A]">→</span> {city(route.to.label)}</p>
              </button>)}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><Globe2 className="size-5 text-[#D4A64A]" /><p className="mt-3 text-2xl font-semibold">{JOURNEY_COUNTRIES.length}+</p><p className="text-xs text-white/50">countries and territories available</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><MapPinned className="size-5 text-[#D4A64A]" /><p className="mt-3 text-2xl font-semibold">{JOURNEY_PRESETS.length}</p><p className="text-xs text-white/50">optional route inspirations</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#D4A64A]">User controlled</p><p className="mt-3 text-sm font-semibold">No route starts by itself.</p><p className="mt-1 text-xs text-white/50">Travel mode appears after your endpoint choices are handed to Journey.</p></div>
          </div>
        </div>
      </section>
    </div>
  );
}
