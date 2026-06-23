"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Newspaper, Radio, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NewspaperHeadline } from "@/components/NewspaperHeadline";
import type { Headline } from "@/lib/news-agent";
import { stationContinent } from "@/lib/discovery/station-picker";
import { stationGenre } from "@/lib/discovery/history";
import { localTimeForStation } from "@/lib/smart-time-copy";
import { flagFor, type Station, type StationInventoryStats } from "@/lib/stations";
import { formatEditorialNumber, guardEditorialCopy } from "@/lib/editorial-guardrail";
import type { WorldContext } from "@/lib/world-engine/types";

const CLIENT_CACHE_KEY = "waveatlas_daily_cache";
const CLIENT_CACHE_TTL_MS = 900_000;
const tabs = ["Front Page", "Local Pulse", "Culture", "Sports", "Radio Signal"] as const;

type CachedBrief = Record<string, { expires: number; headlines: Headline[] }>;

function destination(station: Station) {
  return { city: station.city || station.state || station.country || "World", country: station.country || station.country_code || "Live Radio" };
}

function stationBriefKey(station: Station) {
  const place = destination(station);
  return [place.city, place.country, station.country_code || ""].map((part) => part.trim().toLowerCase()).join("|");
}

function readCache(key: string) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(CLIENT_CACHE_KEY) || "{}") as CachedBrief;
    const hit = cache[key];
    return hit && hit.expires > Date.now() ? hit.headlines : null;
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

  return <section className="my-3 border-y border-slate-900/25 py-2 font-serif text-[#241a10] lg:my-4 lg:rounded-[1.2rem] lg:border lg:bg-white/20 lg:p-4 lg:shadow-[inset_0_1px_0_rgba(255,255,255,.45)]" aria-label="Daily Passport destination intelligence">
    <div className="grid max-w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:gap-3 lg:grid-cols-[auto_minmax(18rem,0.95fr)_minmax(22rem,1.45fr)] lg:items-center lg:gap-4">
      <div className="flex flex-col items-center justify-center self-stretch border-r border-slate-900/20 pr-2 sm:pr-3 lg:pr-4">
        <span className="text-3xl leading-none sm:text-4xl" aria-label={station.country_code ? `${station.country_code} flag` : "Global flag"}>{flagFor(station.country_code)}</span>
        <span className="mt-1 text-[8px] font-black uppercase tracking-[0.18em] text-[#6f5a3f]">Passport</span>
      </div>
      <div className="min-w-0">
        <p className="whitespace-nowrap text-[9px] font-black uppercase tracking-[0.24em] text-[#6f5a3f] lg:text-[10px]">Daily Passport™ destination intelligence</p>
        <h3 className="whitespace-normal break-words overflow-visible h-auto text-lg font-black leading-tight sm:text-xl lg:text-2xl">{passportPlace(station)}</h3>
      </div>
      <p className="col-span-2 min-w-0 text-[11px] font-semibold leading-4 text-[#4A4033] [overflow-wrap:anywhere] sm:col-span-1 sm:text-xs lg:col-span-1 lg:text-sm lg:leading-6">{note}</p>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-px overflow-visible border border-slate-900/20 bg-slate-900/20 min-[390px]:grid-cols-3 sm:grid-cols-5 lg:mt-3">
      {stats.map(([label, value]) => <div key={label} className="min-w-0 whitespace-normal break-words overflow-visible h-auto bg-[#F4EFE2]/95 px-2 py-1.5">
        <p className="whitespace-normal break-words overflow-visible h-auto text-[8px] font-black uppercase tracking-[0.16em] text-[#6f5a3f]">{label}</p>
        <p className="mt-0.5 whitespace-normal break-words overflow-visible h-auto text-[12px] font-extrabold leading-4 text-[#151515]">{value}</p>
      </div>)}
    </div>
  </section>;
}

export function NewspaperBrief({ station, stations = [], inventoryStats, open, onClose }: { station: Station; stations?: Station[]; inventoryStats?: StationInventoryStats; open: boolean; onClose: () => void }) {
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Front Page");
  const [editionClock] = useState(() => new Date());
  const sheetRef = useRef<HTMLElement | null>(null);
  const key = useMemo(() => stationBriefKey(station), [station]);
  const place = destination(station);
  const editionTitle = `${place.city.toUpperCase()} DAILY`;
  const localDate = useMemo(() => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(editionClock), [editionClock]);
  const localTime = useMemo(() => localTimeForStation(station, editionClock) || (typeof station.longitude === "number" ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(editionClock.getTime() + Math.round(station.longitude / 15) * 3600_000)) : "Local time unavailable"), [editionClock, station]);
  const genre = stationGenre(station);

  const visibleHeadlines = useMemo(() => {
    if (tab === "Front Page") return headlines;
    const lowerTab = tab.toLowerCase();
    const filtered = headlines.filter((headline) => [headline.title, headline.summary, headline.source].filter(Boolean).join(" ").toLowerCase().includes(lowerTab.split(" ")[0]));
    return filtered.length ? filtered : headlines.slice(tab === "Radio Signal" ? 0 : 1, tab === "Radio Signal" ? 3 : 5);
  }, [headlines, tab]);

  useEffect(() => {
    if (!open) return;
    const cached = readCache(key);
    const controller = new AbortController();
    window.setTimeout(() => {
      if (controller.signal.aborted) return;
      if (cached) setHeadlines(cached);
      setLoading(!cached);
      setError("");
    }, 0);
    const params = new URLSearchParams({ city: place.city, country: place.country, country_code: station.country_code || "", language: station.language || "" });
    fetch(`/api/brief?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("WaveAtlas Daily unavailable");
        return (await res.json()) as { headlines: Headline[] };
      })
      .then((data) => {
        setHeadlines(data.headlines || []);
        writeCache(key, data.headlines || []);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("The presses are quiet for this destination right now. Radio keeps playing while we look for fresher local signals.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, open, place.city, place.country, station.country_code, station.language, station.longitude]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-auto fixed inset-0 z-[1000] h-[100dvh] w-full max-w-[100vw] overflow-x-hidden overflow-y-auto bg-black/35 px-0 pb-0 pt-0 sm:px-4 sm:pb-[max(32px,env(safe-area-inset-bottom))] sm:pt-[max(20px,env(safe-area-inset-top))] backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <motion.section ref={sheetRef} initial={{ opacity: 0, y: 26, rotateX: -2 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: 26 }} transition={{ duration: 0.3, ease: "easeOut" }} className="pointer-events-auto relative z-[1000] mx-auto min-h-[100dvh] w-full max-w-full overflow-x-hidden rounded-none border border-[rgba(60,45,25,0.20)] bg-[#F4EFE2] text-[#151515] shadow-[0_24px_80px_rgba(0,0,0,0.35)] [box-sizing:border-box] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-8 before:rounded-b-[50%] before:bg-[linear-gradient(to_bottom,rgba(255,255,255,.65),rgba(20,20,20,.05),transparent)] sm:mb-24 sm:min-h-0 sm:w-[min(760px,calc(100vw-32px))] sm:rounded-t-[1.25rem] md:mb-28 md:w-[min(860px,calc(100vw-4rem))] md:rounded-[1.35rem] lg:w-[min(1120px,calc(100vw-4rem))] xl:w-[min(1240px,calc(100vw-5rem))]" role="dialog" aria-modal="true" aria-label="WaveAtlas Daily">
          <div className="pointer-events-none absolute inset-0 opacity-85 [background-image:radial-gradient(circle_at_18%_8%,rgba(255,255,255,.7),transparent_28%),radial-gradient(circle_at_78%_4%,rgba(138,90,34,.13),transparent_24%),linear-gradient(90deg,rgba(20,20,20,.028)_1px,transparent_1px),linear-gradient(rgba(20,20,20,.024)_1px,transparent_1px)] [background-size:100%_100%,100%_100%,16px_16px,16px_16px]" />
          <div className="relative max-w-full overflow-x-hidden p-4 [box-sizing:border-box] md:p-7 lg:p-8">
            <div className="sticky top-[max(12px,env(safe-area-inset-top))] z-50 mb-3 flex max-w-full items-center justify-between gap-3 overflow-x-hidden text-left">
              <span className="min-w-0 max-w-full rounded-full border border-slate-900/20 bg-[#F4EFE2]/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#4A4033] [hyphens:auto] [overflow-wrap:anywhere] [word-break:break-word]"><Radio className="mr-1 inline size-3" />Live Signal</span>
              <button type="button" onClick={onClose} className="pointer-events-auto ml-auto grid size-10 shrink-0 place-items-center rounded-full border border-slate-900/20 bg-white/80 text-slate-950 shadow-lg backdrop-blur hover:bg-white" aria-label="Close WaveAtlas Daily"><X className="size-4" /></button>
            </div>
            <header className="max-w-full overflow-x-hidden border-b-4 border-double border-[#151515] pb-3 text-center lg:pb-4">
              <p className="font-serif text-xs font-black uppercase tracking-[0.32em] text-[#4A4033]">WaveAtlas Daily™</p>
              <h2 className="mt-1 max-w-full font-serif text-5xl font-black leading-none tracking-[-0.07em] text-[#151515] [hyphens:auto] [overflow-wrap:anywhere] [word-break:break-word] md:text-7xl">{editionTitle}</h2>
              <p className="mt-2 max-w-full font-serif text-sm italic text-[#4A4033] [hyphens:auto] [overflow-wrap:anywhere] [word-break:break-word]">{place.city}, {place.country} • {localDate}</p>
              <p className="mt-1 font-serif text-xs font-bold uppercase tracking-[0.18em] text-[#4A4033]">Live stories from this destination</p>
            </header>

            <DailyPassportStrip station={station} stations={stations} inventoryStats={inventoryStats} enabled={open} />

            <nav className="my-3 flex max-w-full flex-wrap gap-2 overflow-x-hidden border-y border-slate-900/25 py-2 lg:my-3">
              {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] ${tab === item ? "bg-slate-950 text-white" : "text-[#4A4033]"}`}>{item}</button>)}
            </nav>

            {loading ? <p className="rounded-2xl border border-slate-900/15 bg-white/30 p-4 font-serif text-sm text-[#4A4033]">Setting type and fetching open headlines without interrupting playback…</p> : null}
            {error ? <p className="mb-4 rounded-2xl border border-amber-700/30 bg-amber-200/35 p-4 font-serif text-sm text-amber-950">{error}</p> : null}
            {!loading && !headlines.length ? <p className="rounded-2xl border border-slate-900/15 bg-white/30 p-4 font-serif text-sm text-[#4A4033]">No fresh local headlines found yet. Try another destination or keep listening while the next edition forms.</p> : null}
            <div className="grid max-w-full gap-x-6 gap-y-5 overflow-x-hidden lg:grid-cols-[minmax(32rem,1.15fr)_minmax(26rem,.85fr)]">{visibleHeadlines.map((headline, index) => <NewspaperHeadline key={`${headline.title}-${headline.url}`} headline={headline} lead={index === 0 && tab === "Front Page"} />)}</div>
            <footer className="mt-6 max-w-full overflow-x-hidden border-t-4 border-double border-[#151515]/70 pt-3 font-serif text-xs text-[#4A4033] [hyphens:auto] [overflow-wrap:anywhere] [word-break:break-word]">
              <div className="grid gap-2 text-left sm:grid-cols-4"><span><b>Radio Signal:</b> {station.name}</span><span><b>Edition:</b> {place.city}, {place.country}</span><span><b>Genre:</b> {genre}</span><span><b>Local Time:</b> {localTime}</span></div>
              <p className="mt-3 text-center"><Newspaper className="mr-1 inline size-3" /> Open RSS + GDELT sources. Summaries and links only; full articles remain with publishers.</p>
            </footer>
          </div>
        </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
