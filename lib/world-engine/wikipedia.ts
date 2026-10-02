import { WORLD_ENGINE_CACHE_TTL_MS, WORLD_ENGINE_TIMEOUT_MS, WORLD_ENGINE_USER_AGENT } from "./config";
import { fetchJsonWithTimeout, getCached, setCached } from "./cache";
import type { SourceResult } from "./types";

type Summary = { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
export type WikipediaSummary = { title: string; summary: string; url?: string };

function sentenceAwareSummary(extract: string, targetLength = 420) {
  const normalized = extract.replace(/\s+/g, " ").trim();
  if (normalized.length <= targetLength) return normalized;

  const sentences = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g) ?? [];
  let summary = "";
  for (const sentence of sentences) {
    const candidate = `${summary}${sentence.trim()} `;
    if (candidate.trim().length > targetLength && summary) break;
    summary = candidate;
    if (summary.trim().length >= Math.min(260, targetLength)) break;
  }

  if (summary.trim()) return summary.trim();

  const clipped = normalized.slice(0, targetLength + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 0 ? lastSpace : targetLength).trim()}…`;
}

export async function getWikipediaSummary(place?: string, country?: string): Promise<SourceResult<WikipediaSummary>> {
  const title = (place || country || "").trim();
  if (!title) return { status: "skipped", source: "Wikipedia", confidence: 0, data: null, attribution: "Wikipedia contributors", url: "https://www.wikipedia.org/" };
  const key = `wikipedia:${title.toLowerCase()}`;
  const cached = getCached<WikipediaSummary>(key);
  if (cached) return { status: "success", source: "Wikipedia", confidence: 0.76, data: cached, attribution: "Wikipedia contributors", url: cached.url, cached: true };
  try {
    const json = await fetchJsonWithTimeout<Summary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, WORLD_ENGINE_TIMEOUT_MS, { headers: { "User-Agent": WORLD_ENGINE_USER_AGENT } });
    const summary = sentenceAwareSummary(json.extract ?? "");
    if (!summary) throw new Error("No summary available");
    const data = { title: json.title ?? title, summary, url: json.content_urls?.desktop?.page };
    setCached(key, data, WORLD_ENGINE_CACHE_TTL_MS);
    return { status: "success", source: "Wikipedia", confidence: place ? 0.76 : 0.62, data, attribution: "Wikipedia contributors", url: data.url };
  } catch (error) {
    return { status: "error", source: "Wikipedia", confidence: 0, data: null, attribution: "Wikipedia contributors", url: "https://www.wikipedia.org/", error: error instanceof Error ? error.message : "Unavailable" };
  }
}
