"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Newspaper, Radio, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NewspaperHeadline } from "@/components/NewspaperHeadline";
import type { Headline } from "@/lib/news-agent";
import type { Station } from "@/lib/stations";

const CLIENT_CACHE_KEY = "waveatlas_daily_cache";
const CLIENT_CACHE_TTL_MS = 900_000;
const tabs = ["Front Page", "Local Pulse", "Culture"] as const;
const sections = ["Front Page", "Local Pulse", "Culture", "Sports", "Radio Signal"];

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

export function WaveAtlasDaily({ station, open, onClose }: { station: Station; open: boolean; onClose: () => void }) {
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Front Page");
  const key = useMemo(() => stationBriefKey(station), [station]);
  const place = destination(station);
  const editionTitle = `${place.city.toUpperCase()} DAILY`;

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
  }, [key, open, place.city, place.country, station.country_code, station.language]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.section initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 32 }} className="pointer-events-auto fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+86px)] z-[65] max-h-[78dvh] overflow-hidden rounded-t-[1.25rem] border border-[#141414]/20 bg-[#F4EFE2]/[.97] text-[#151515] shadow-2xl md:inset-x-auto md:bottom-28 md:right-8 md:w-[min(760px,calc(100vw-4rem))] md:rounded-[1.35rem]" role="dialog" aria-label="WaveAtlas Daily">
          <div className="pointer-events-none absolute inset-0 opacity-85 [background-image:radial-gradient(circle_at_18%_8%,rgba(255,255,255,.7),transparent_28%),radial-gradient(circle_at_78%_4%,rgba(138,90,34,.13),transparent_24%),linear-gradient(90deg,rgba(20,20,20,.028)_1px,transparent_1px),linear-gradient(rgba(20,20,20,.024)_1px,transparent_1px)] [background-size:100%_100%,100%_100%,16px_16px,16px_16px]" />
          <div className="relative max-h-[78dvh] overflow-y-auto p-4 md:p-7">
            <header className="border-b-4 border-double border-[#151515] pb-3 text-center">
              <div className="mb-3 flex items-center justify-between gap-3 text-left">
                <span className="rounded-full border border-slate-900/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#4A4033]"><Radio className="mr-1 inline size-3" />Live Signal</span>
                <button type="button" onClick={onClose} className="pointer-events-auto grid size-10 place-items-center rounded-full border border-slate-900/20 bg-white/35 text-slate-950 hover:bg-white/60" aria-label="Close WaveAtlas Daily"><X className="size-4" /></button>
              </div>
              <p className="font-serif text-xs font-black uppercase tracking-[0.32em] text-[#4A4033]">WaveAtlas Daily™</p>
              <h2 className="mt-1 font-serif text-5xl font-black leading-none tracking-[-0.07em] text-[#151515] md:text-7xl">{editionTitle}</h2>
              <p className="mt-2 font-serif text-sm italic text-[#4A4033]">{place.city}, {place.country}. Live stories from this destination.</p>
            </header>

            <nav className="my-4 flex gap-2 overflow-x-auto border-y border-slate-900/25 py-2">
              {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] ${tab === item ? "bg-slate-950 text-white" : "text-[#4A4033]"}`}>{item}</button>)}
            </nav>

            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              {sections.map((section) => <span key={section} className="border border-slate-900/15 bg-white/20 px-2 py-1 text-center font-serif text-[11px] font-bold uppercase tracking-[0.12em] text-[#4A4033]">{section}</span>)}
            </div>

            {loading ? <p className="rounded-2xl border border-slate-900/15 bg-white/30 p-4 font-serif text-sm text-[#4A4033]">Setting type and fetching open headlines without interrupting playback…</p> : null}
            {error ? <p className="mb-4 rounded-2xl border border-amber-700/30 bg-amber-200/35 p-4 font-serif text-sm text-amber-950">{error}</p> : null}
            {!loading && !headlines.length ? <p className="rounded-2xl border border-slate-900/15 bg-white/30 p-4 font-serif text-sm text-[#4A4033]">No fresh local headlines found yet. Try another destination or keep listening while the next edition forms.</p> : null}
            <div className="grid gap-5 md:grid-cols-2">{headlines.map((headline, index) => <NewspaperHeadline key={`${headline.title}-${headline.url}`} headline={headline} lead={index === 0} />)}</div>
            <footer className="mt-5 border-t border-slate-900/25 pt-3 text-center font-serif text-xs text-[#4A4033]"><Newspaper className="mr-1 inline size-3" /> Open RSS + GDELT sources. Summaries and links only; full articles remain with publishers.</footer>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
