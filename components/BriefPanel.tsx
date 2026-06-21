"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Newspaper, Radio, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HeadlineCard } from "@/components/HeadlineCard";
import type { Headline } from "@/lib/news-agent";
import type { Station } from "@/lib/stations";

const CLIENT_CACHE_KEY = "waveatlas_brief_cache";
const CLIENT_CACHE_TTL_MS = 900_000;

type CachedBrief = Record<string, { expires: number; headlines: Headline[] }>;

function stationBriefKey(station: Station) {
  return [station.city || station.state || "", station.country || "", station.country_code || ""].map((part) => part.trim().toLowerCase()).join("|");
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
    // Brief cache is best-effort and must never interrupt radio playback.
  }
}

export function BriefPanel({ station, open, onClose }: { station: Station; open: boolean; onClose: () => void }) {
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const key = useMemo(() => stationBriefKey(station), [station]);

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
    const params = new URLSearchParams({
      city: station.city || station.state || "",
      country: station.country || "",
      country_code: station.country_code || "",
      language: station.language || "",
    });
    fetch(`/api/brief?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Brief unavailable");
        return (await res.json()) as { headlines: Headline[] };
      })
      .then((data) => {
        setHeadlines(data.headlines);
        writeCache(key, data.headlines);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("No fresh local headlines found yet. Showing wider regional stories.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, open, station]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 28 }}
          className="pointer-events-auto fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-[65] max-h-[70dvh] overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/95 text-white shadow-2xl backdrop-blur-2xl md:inset-x-auto md:bottom-28 md:right-8 md:w-[420px]"
          role="dialog"
          aria-label="WaveAtlas Brief"
        >
          <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 p-4 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-radio">WaveAtlas Brief™</p>
                <h2 className="mt-1 font-display text-xl font-bold">{station.city || station.state || station.country}</h2>
                <p className="mt-1 text-sm text-ivory/65">Local headlines from this destination.</p>
              </div>
              <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-ivory hover:bg-white/10" aria-label="Close Brief">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs font-semibold">
              <span className="rounded-full px-3 py-2 text-center text-ivory/55"><Radio className="mr-1 inline size-3" />Radio</span>
              <span className="rounded-full bg-radio px-3 py-2 text-center text-midnight"><Newspaper className="mr-1 inline size-3" />Brief</span>
            </div>
          </div>
          <div className="max-h-[calc(70dvh-150px)] overflow-y-auto p-4">
            {loading ? <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-ivory/70">Loading local headlines without interrupting playback…</p> : null}
            {error ? <p className="mb-3 rounded-2xl border border-gold/20 bg-gold/10 p-3 text-sm text-gold">{error}</p> : null}
            {!loading && !headlines.length ? <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-ivory/70">No fresh local headlines found yet. Showing wider regional stories.</p> : null}
            <div className="space-y-3">{headlines.map((headline) => <HeadlineCard key={`${headline.title}-${headline.url}`} headline={headline} />)}</div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
