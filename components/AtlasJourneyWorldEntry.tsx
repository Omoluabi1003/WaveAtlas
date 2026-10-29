'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, MapPin, X } from 'lucide-react';
import type { JourneyPlace, JourneyRoute } from '@/lib/atlas-journey';

type AirportCountry = { code: string; name: string; continent: string };
type Airport = {
  ident: string;
  type: string;
  name: string;
  lat: number;
  lng: number;
  continent: string;
  countryCode: string;
  municipality: string;
  iata: string;
  icao: string;
};

const airportCache = new Map<string, Airport[]>();

function placeKey(place: JourneyPlace) {
  return `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`;
}

function isJourneyDeepLink() {
  if (typeof window === 'undefined') return false;
  const url = `${window.location.pathname}${window.location.search}${window.location.hash}`.toLowerCase();
  return url.includes('journey=') || url.includes('/journey/');
}

function AirportEndpointPicker({ label, countries, value, onChange }: {
  label: string;
  countries: AirportCountry[];
  value: JourneyPlace | null;
  onChange: (place: JourneyPlace | null) => void;
}) {
  const continents = useMemo(() => [...new Set(countries.map((country) => country.continent))].sort(), [countries]);
  const [continent, setContinent] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [airports, setAirports] = useState<Airport[]>([]);
  const [airportId, setAirportId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const countryOptions = useMemo(() => countries.filter((country) => !continent || country.continent === continent), [countries, continent]);

  useEffect(() => {
    setAirports([]);
    setAirportId('');
    onChange(null);
    setMessage('');
    if (!countryCode) return;

    const cached = airportCache.get(countryCode);
    if (cached) {
      setAirports(cached);
      setMessage(cached.length ? '' : 'No scheduled-service airports are listed for this country.');
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/journey/airports?${new URLSearchParams({ country: countryCode })}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Airport lookup unavailable');
        const data = await response.json() as { airports?: Airport[] };
        const found = data.airports || [];
        airportCache.set(countryCode, found);
        if (!controller.signal.aborted) {
          setAirports(found);
          setMessage(found.length ? '' : 'No scheduled-service airports are listed for this country.');
        }
      })
      .catch(() => { if (!controller.signal.aborted) setMessage('Airport lookup is temporarily unavailable.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [countryCode, onChange]);

  const chooseAirport = (id: string) => {
    setAirportId(id);
    const airport = airports.find((candidate) => candidate.ident === id);
    if (!airport) { onChange(null); return; }
    const country = countries.find((candidate) => candidate.code === airport.countryCode);
    const city = airport.municipality ? ` · ${airport.municipality}` : '';
    const place: JourneyPlace = {
      label: `${airport.iata} · ${airport.name}${city}${country ? `, ${country.name}` : ''}`,
      lat: airport.lat,
      lng: airport.lng,
      countryCode: airport.countryCode,
      approximate: false,
    };
    onChange(place);
  };

  const controlClass = 'min-h-12 w-full appearance-none rounded-xl border border-white/15 bg-[#08111D] px-4 pr-11 text-sm font-semibold text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-40 focus:border-[#D4A64A]';

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#D4A64A]"><MapPin className="size-3.5" />{label}</div>
      <p className="mt-2 text-sm font-semibold text-white">{value?.label || `Choose ${label.toLowerCase()} airport`}</p>
      <div className="mt-3 grid gap-2">
        <label className="relative">
          <span className="sr-only">{label} continent</span>
          <select value={continent} onChange={(event) => { setContinent(event.target.value); setCountryCode(''); setAirportId(''); onChange(null); }} className={controlClass}>
            <option value="">Continent</option>
            {continents.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#D4A64A]" />
        </label>
        <label className="relative">
          <span className="sr-only">{label} country</span>
          <select value={countryCode} disabled={!continent} onChange={(event) => setCountryCode(event.target.value)} className={controlClass}>
            <option value="">Country</option>
            {countryOptions.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#D4A64A]" />
        </label>
        <label className="relative">
          <span className="sr-only">{label} airport</span>
          <select value={airportId} disabled={!countryCode || loading || !airports.length} onChange={(event) => chooseAirport(event.target.value)} className={controlClass}>
            <option value="">{loading ? 'Loading airports…' : 'Airport'}</option>
            {airports.map((airport) => <option key={airport.ident} value={airport.ident}>{airport.iata} · {airport.name}{airport.municipality ? ` — ${airport.municipality}` : ''}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#D4A64A]" />
        </label>
      </div>
      {message ? <p className="mt-2 text-[10px] leading-4 text-white/45" role="status">{message}</p> : <p className="mt-2 text-[10px] text-white/35">Continent → country → scheduled-service airport.</p>}
    </section>
  );
}

export default function AtlasJourneyWorldEntry() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [dismissedSession, setDismissedSession] = useState<number | null>(null);
  const [departure, setDeparture] = useState<JourneyPlace | null>(null);
  const [destination, setDestination] = useState<JourneyPlace | null>(null);
  const [countries, setCountries] = useState<AirportCountry[]>([]);
  const [catalogStatus, setCatalogStatus] = useState('Loading global airport geography…');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let visible = false;
    const check = () => {
      const title = document.getElementById('journey-title');
      const nextVisible = Boolean(title);
      if (nextVisible && !visible) {
        setSession((value) => value + 1);
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

  useEffect(() => {
    if (!open || countries.length) return;
    const controller = new AbortController();
    setCatalogStatus('Loading global airport geography…');
    void fetch('/api/journey/airports', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Airport catalog unavailable');
        const data = await response.json() as { countries?: AirportCountry[] };
        const found = data.countries || [];
        if (!controller.signal.aborted) {
          setCountries(found);
          setCatalogStatus(found.length ? '' : 'Airport country catalog is empty.');
        }
      })
      .catch(() => { if (!controller.signal.aborted) setCatalogStatus('Airport catalog is temporarily unavailable. You can use the classic planner instead.'); });
    return () => controller.abort();
  }, [open, countries.length]);

  const hidden = dismissedSession === session;
  if (!open || hidden) return null;

  const continueJourney = () => {
    if (!departure || !destination) return;
    if (placeKey(departure) === placeKey(destination)) {
      setStatus('Choose two different airports for this journey.');
      return;
    }
    const route: JourneyRoute = { from: departure, to: destination };
    setStatus('Opening your airport-to-airport Journey…');
    const url = new URL(window.location.href);
    url.searchParams.set('journey', JSON.stringify(route));
    window.location.assign(url.toString());
  };

  const closeJourney = () => {
    const close = document.querySelector<HTMLButtonElement>('[role="dialog"][aria-labelledby="journey-title"] button[aria-label="Close Atlas Journey"]');
    close?.click();
  };

  return (
    <div className="fixed inset-0 z-[1002] overflow-y-auto bg-[#030914]/98 px-3 py-[max(12px,env(safe-area-inset-top))] text-[#F7F5EF] backdrop-blur-xl" aria-label="Atlas Journey airport planner">
      <section className="mx-auto max-w-6xl overflow-hidden rounded-[1.6rem] border border-[#D4A64A]/25 bg-[#08111D] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-7">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.25em] text-[#D4A64A]">Explore humanity through sound</p>
            <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Build your Atlas Journey<span className="text-[#D4A64A]">.</span></h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-white/55">Choose each endpoint the way travel geography actually works: continent, country, then airport. WaveAtlas uses the airport coordinates as the route anchors.</p>
          </div>
          <button type="button" aria-label="Close Atlas Journey" onClick={closeJourney} className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-white/15 text-white hover:border-[#D4A64A]/70 hover:bg-white/10"><X className="size-5" /></button>
        </header>

        <div className="p-5 sm:p-7">
          {catalogStatus ? <p className="mb-4 rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-white/55" role="status">{catalogStatus}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <AirportEndpointPicker label="Departure" countries={countries} value={departure} onChange={setDeparture} />
            <AirportEndpointPicker label="Destination" countries={countries} value={destination} onChange={setDestination} />
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#D4A64A]/20 bg-[#D4A64A]/[.05] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#D4A64A]">Your route</p><p className="mt-1 break-words text-sm font-semibold">{departure?.label || 'Departure airport'} <ArrowRight className="mx-1 inline size-4 text-[#D4A64A]" /> {destination?.label || 'Destination airport'}</p>{status ? <p className="mt-1 text-[11px] text-white/50" role="status">{status}</p> : null}</div>
            <button type="button" disabled={!departure || !destination} onClick={continueJourney} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#D4A64A] px-6 text-sm font-bold text-[#08111D] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35">Continue <ArrowRight className="size-4" /></button>
          </div>

          {catalogStatus.includes('unavailable') ? <button type="button" className="mt-5 min-h-11 rounded-full border border-white/15 px-4 text-xs font-semibold text-white/70" onClick={() => setDismissedSession(session)}>Use classic city/country planner</button> : null}
        </div>
      </section>
    </div>
  );
}
