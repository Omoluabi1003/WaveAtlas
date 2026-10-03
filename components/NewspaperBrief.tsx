"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Newspaper, Radio, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NewspaperHeadline } from "@/components/NewspaperHeadline";
import type { BriefCategory, Headline } from "@/lib/news-agent";
import { stationContinent } from "@/lib/discovery/station-picker";
import { stationGenre } from "@/lib/discovery/history";
import { localTimeForStation } from "@/lib/smart-time-copy";
import { flagFor, type Station, type StationInventoryStats } from "@/lib/stations";
import { formatEditorialNumber, guardEditorialCopy } from "@/lib/editorial-guardrail";
import type { WorldContext } from "@/lib/world-engine/types";

const CLIENT_CACHE_KEY = "waveatlas_daily_cache_v2";
const CLIENT_CACHE_TTL_MS = 900_000;
const tabs = ["Front Page", "Local Pulse", "Culture", "Sports", "Radio Signal"] as const;
const tabCategory = { "Front Page": "front-page", "Local Pulse": "local-pulse", Culture: "culture", Sports: "sports", "Radio Signal": "radio-signal" } as const;

type CachedBrief = Record<string, { expires: number; headlines: Headline[] }>;

function destination(station: Station) {
  return { city: station.city || station.state || station.country || "World", country: station.country || station.country_code || "Live Radio" };
}

function flagLabel(station: Station) {
  return station.country_code ? `${station.country_code.toUpperCase()} flag` : "Global flag";
}

function stationBriefKey(station: Station) {
  const place = destination(station);
  return [place.city, place.country, station.country_code || "", station.station_uuid || station.id, station.name, station.language || ""].map((part) => part.trim().toLowerCase()).join("|");
}

function readCache(key: string) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(CLIENT_CACHE_KEY) || "{}") as CachedBrief;
    const hit = cache[key];
    return hit && hit.expires > Date.now() && Array.isArray(hit.headlines) ? hit.headlines : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, headlines: Headline[]) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(CLIENT_CACHE_KEY) || "{}") as CachedBrief;
    cache[key] = { headlines, expires: Date.now() + CLIENT_CACHE_TTL_MS };
    window.localStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Daily cache is best-effort and must never interrupt radio playback.
  }
}

function compactLanguageLabel(language?: string) {
  const primary = language?.split(/[;,/]/)[0]?.trim();
  if (!primary) return "Language TBD";
  return primary.replace(/\b\w/g, (char) => char.toUpperCase());
}

function passportPlace(station: Station) {
  return [station.city || station.state, station.country || station.country_code].filter(Boolean).join(", ") || station.name || "Global signal";
}

function buildPassportNote(station: Station, region: string, stationCount?: number, context?: WorldContext | null) {
  const place = station.city || station.state || station.country || "This destination";
  const signalCount = typeof stationCount === "number" && stationCount > 0 ? formatEditorialNumber(stationCount, stationCount === 1 ? "indexed local signal" : "indexed local signals") : undefined;
  const fallback = `${place} comes into focus through ${signalCount || `a ${region} listening post`}, with ${stationGenre(station)} carried by ${station.name}.`;
  const regionalFallback = `${place} offers a concise window into ${region}, pairing local atmosphere with a live radio signal from ${station.name}.`;
  return guardEditorialCopy([context?.radioDNA.culturalSummary, fallback, regionalFallback]) || regionalFallback;
}

function usePassportWorldContext(station: Station, enabled: boolean) {
  const [worldContext, setWorldContext] = useState<WorldContext | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("stationName", station.name);
    if (station.city) params.set("city", station.city);
    if (station.state) params.set("state", station.state);
    if (station.country) params.set("country", station.country);
    if (station.country_code) params.set("countryCode", station.country_code);
    if (station.language) params.set("language", station.language);
    if (typeof station.latitude === "number") params.set("lat", String(station.latitude));
    if (typeof station.longitude === "number") params.set("lng", String(station.longitude));
    fetch(`/api/world-context?${params.toString()}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: WorldContext | null) => {
        setWorldContext(payload?.radioDNA ? payload : null);
        setStatus(payload?.radioDNA ? "ready" : "empty");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setWorldContext(null);
        setStatus("empty");
      });
    return () => controller.abort();
  }, [enabled, station.city, station.country, station.country_code, station.language, station.latitude, station.longitude, station.name, station.state]);

  return { worldContext, status };
}

function DailyPassportStrip({ station, stations = [], inventoryStats, enabled }: { station: Station; stations?: Station[]; inventoryStats?: StationInventoryStats; enabled: boolean }) {
  const { worldContext, status } = usePassportWorldContext(station, enabled);
  const stationCount = useMemo(() => station.country_code ? inventoryStats?.countryCounts[station.country_code] ?? stations.filter((item) => item.country_code === station.country_code).length : undefined, [inventoryStats?.countryCounts, station.country_code, stations]);
  const region = worldContext?.radioDNA.region || stationContinent(station);
  const localTime = worldContext?.radioDNA.localTime || localTimeForStation(station) || "Local time TBD";
  const language = worldContext?.radioDNA.languages?.[0] || compactLanguageLabel(station.language);
  const weather = worldContext?.climate && typeof worldContext.climate.temperatureC === "number" ? `${Math.round(worldContext.climate.temperatureC)}°C now` : status === "loading" ? "Weather loading" : "Weather TBD";
  const stationsLabel = typeof stationCount === "number" && stationCount > 0 ? `${stationCount.toLocaleString()} ${stationCount === 1 ? "station" : "stations"}` : "Station count TBD";
  const note = buildPassportNote(station, region, stationCount, worldContext);
  const stats = [["Time", localTime], ["Language", language], ["Region", region], ["Weather", weather], ["Signals", stationsLabel]] as const;

  return <section className="mt-8 rounded-[1.4rem] border border-[#D4A64A]/20 bg-[#2B2031] p-5 text-[#F7F5EF] sm:p-6" aria-label="Daily Passport destination intelligence">
    <div className="flex min-w-0 items-start gap-4"><span className="shrink-0 text-3xl" aria-label={station.country_code ? `${station.country_code} flag` : "Global flag"}>{flagFor(station.country_code)}</span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#E0C080]">Daily Passport™ / Inside the destination</p><h3 className="mt-2 break-words font-serif text-2xl text-[#F7F5EF]">{passportPlace(station)}</h3><p className="mt-3 text-sm leading-7 text-[#E2D7E4] [overflow-wrap:anywhere]">{note}</p></div></div>
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{stats.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-[#211827] px-3 py-3"><p className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#E0C080]">{label}</p><p className="mt-2 break-words text-sm font-medium leading-5 text-[#F7F5EF]">{value}</p></div>)}</div>
  </section>;
}

export function NewspaperBrief({ station, stations = [], inventoryStats, open, onClose }: { station: Station; stations?: Station[]; inventoryStats?: StationInventoryStats; open: boolean; onClose: () => void }) {
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultKey, setResultKey] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Front Page");
  const [editionClock] = useState(() => new Date());
  const sheetRef = useRef<HTMLElement | null>(null);
  const key = useMemo(() => `${stationBriefKey(station)}|${tabCategory[tab]}`, [station, tab]);
  const currentHeadlines = resultKey === key ? headlines : [];
  const currentError = resultKey === key ? error : "";
  const isLoading = loading || resultKey !== key;
  const place = destination(station);
  const editionTitle = place.city;
  const localDate = useMemo(() => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(editionClock), [editionClock]);
  const localTime = useMemo(() => localTimeForStation(station, editionClock) || (typeof station.longitude === "number" ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(editionClock.getTime() + Math.round(station.longitude / 15) * 3600_000)) : "Local time unavailable"), [editionClock, station]);
  const genre = stationGenre(station);

  useEffect(() => {
    if (!open) return;
    const cached = readCache(key);
    const controller = new AbortController();
    let settled = false;
    window.setTimeout(() => {
      if (controller.signal.aborted || settled) return;
      setResultKey(key);
      setHeadlines(cached || []);
      setLoading(!cached);
      setError("");
    }, 0);
    const params = new URLSearchParams({ city: place.city, country: place.country, country_code: station.country_code || "", language: station.language || "", category: tabCategory[tab], station_name: station.name });
    fetch(`/api/brief?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("WaveAtlas Daily unavailable");
        return (await res.json()) as { headlines: Headline[]; category: BriefCategory };
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.category !== tabCategory[tab] || !Array.isArray(data.headlines)) throw new Error("Unexpected brief section");
        settled = true;
        setResultKey(key);
        setHeadlines(data.headlines);
        setError("");
        writeCache(key, data.headlines);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        settled = true;
        setResultKey(key);
        setHeadlines(cached || []);
        setError("This section could not be refreshed. Radio keeps playing while we look for relevant stories.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, open, place.city, place.country, station.country_code, station.language, station.longitude, station.name, tab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-auto fixed inset-0 z-[1000] h-[100dvh] w-full max-w-[100vw] overflow-x-hidden overflow-y-auto bg-[#100D15]/80 sm:px-4 sm:pb-[max(32px,env(safe-area-inset-bottom))] sm:pt-[max(20px,env(safe-area-inset-top))] backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
          <motion.section ref={sheetRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.25, ease: "easeOut" }} className="pointer-events-auto relative mx-auto min-h-[100dvh] w-full max-w-[1200px] overflow-x-hidden border border-[#D4A64A]/20 bg-[#211827] text-[#F7F5EF] shadow-[0_30px_100px_rgba(0,0,0,.6)] sm:mb-20 sm:min-h-0 sm:rounded-[1.8rem]" role="dialog" aria-modal="true" aria-label="WaveAtlas Daily">
            <div className="relative p-4 pt-[max(16px,env(safe-area-inset-top))] sm:p-7 lg:p-10">
              <div className="sticky top-[max(12px,env(safe-area-inset-top))] z-50 mb-6 flex min-w-0 items-center justify-between gap-3"><span className="rounded-full border border-[#D4A64A]/30 bg-[#211827]/95 px-3 py-2 text-[9px] font-semibold uppercase tracking-[.18em] text-[#E0C080]"><Radio className="mr-2 inline size-3 text-[#00D68F]" />Live listening edition</span><button type="button" onClick={onClose} className="pointer-events-auto grid size-10 shrink-0 place-items-center rounded-full border border-[#D4A64A]/30 bg-[#2B2031]/95 text-[#F7F5EF] shadow-lg hover:bg-[#473047]" aria-label="Close WaveAtlas Daily"><X className="size-4" /></button></div>
              <header className="border-b border-[#D4A64A]/30 pb-6 sm:pb-8">
                <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-display text-xs font-bold uppercase tracking-[.24em] text-[#E0C080]">WaveAtlas <span className="mx-2 text-[#D4A64A]/40">/</span> The Brief</p><span className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#DCCEDF]">Destination edition</span></div>
                <h2 className="mt-5 max-w-full font-serif text-5xl font-medium leading-[1.06] tracking-[-.04em] text-[#F7F5EF] [overflow-wrap:anywhere] sm:text-7xl lg:text-[5.5rem]">{editionTitle}<span className="text-[#D4A64A]">.</span></h2>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-[#DCCEDF]"><p><span className="mr-2" aria-label={flagLabel(station)}>{flagFor(station.country_code)}</span>{place.country} · {localDate}</p><p className="font-serif text-base italic text-[#E0C080]">Sound. Place. Perspective.</p></div>
              </header>
              <nav role="tablist" aria-label="Brief sections" className="my-5 flex max-w-full flex-wrap gap-2">
                {tabs.map((item) => <button type="button" role="tab" id={`brief-tab-${tabCategory[item]}`} aria-selected={tab === item} aria-controls="brief-section" key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-full border px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[.12em] transition sm:px-4 ${tab === item ? "border-[#D4A64A] bg-[#D4A64A] text-[#211827]" : "border-[#D4A64A]/20 bg-[#2B2031] text-[#E2D7E4] hover:border-[#D4A64A]/65"}`}>{item}</button>)}
              </nav>
              <section id="brief-section" role="tabpanel" aria-labelledby={`brief-tab-${tabCategory[tab]}`} aria-busy={isLoading}>
                <div className="mb-5 flex items-center gap-4"><h3 className="shrink-0 text-[10px] font-semibold uppercase tracking-[.24em] text-[#E0C080]">{tab}</h3><span className="h-px flex-1 bg-[#D4A64A]/20" /><span className="text-[9px] uppercase tracking-[.12em] text-[#DCCEDF]">The current edit</span></div>
                {isLoading ? <p className="rounded-2xl border border-[#D4A64A]/20 bg-[#2B2031] p-5 text-sm leading-6 text-[#E2D7E4]">Curating this edition without interrupting playback…</p> : null}
                {currentError ? <p className="mb-4 rounded-2xl border border-[#D4A64A]/35 bg-[#382539] p-5 text-sm leading-6 text-[#F7F5EF]">{currentError}</p> : null}
                {!isLoading && !currentError && !currentHeadlines.length ? <p className="rounded-2xl border border-[#D4A64A]/20 bg-[#2B2031] p-5 text-sm leading-6 text-[#E2D7E4]">No verified {tab.toLowerCase()} stories are available for this destination right now. WaveAtlas will not substitute unrelated headlines.</p> : null}
                <div className="grid max-w-full grid-cols-1 gap-5 md:grid-cols-2">{currentHeadlines.map((headline, index) => <NewspaperHeadline key={`${headline.title}-${headline.url}`} headline={headline} lead={index === 0} sectionLabel={tab} />)}</div>
              </section>
              <DailyPassportStrip station={station} stations={stations} inventoryStats={inventoryStats} enabled={open} />
              <footer className="mt-8 border-t border-[#D4A64A]/25 pb-[max(16px,env(safe-area-inset-bottom))] pt-5 text-xs leading-6 text-[#DCCEDF] [overflow-wrap:anywhere]"><div className="grid gap-3 sm:grid-cols-3"><span><b className="font-medium text-[#E0C080]">Listening to</b><br />{station.name}</span><span><b className="font-medium text-[#E0C080]">Sound &amp; place</b><br />{genre} · {place.city}, {place.country}</span><span><b className="font-medium text-[#E0C080]">Local time</b><br />{localTime}</span></div><p className="mt-5 border-t border-[#D4A64A]/15 pt-4 text-[10px] leading-5"><Newspaper className="mr-2 inline size-3 text-[#E0C080]" />Open RSS + GDELT sources. Summaries and links only; full articles remain with publishers.</p></footer>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
