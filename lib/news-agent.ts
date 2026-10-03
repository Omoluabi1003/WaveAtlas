import { editorialImageUrl, rssEditorialImage } from './editorial-image';
import { headlineMatchesBrief } from './brief-editorial';
import { getNewsSources, type NewsFeed, type NewsFeedScope } from "@/lib/news-source-registry";

export type Headline = {
  title: string;
  source: string;
  url: string;
  summary?: string;
  publishedAt?: string;
  imageUrl?: string;
  city?: string;
  country?: string;
  country_code?: string;
};

export type BriefCategory = "front-page" | "local-pulse" | "culture" | "sports" | "radio-signal";
export type BriefRequest = { city?: string; country?: string; country_code?: string; language?: string; category?: BriefCategory; station_name?: string };

type ScoredHeadline = Headline & { score: number; scope?: NewsFeedScope };

const briefCache = new Map<string, { expires: number; value: Headline[] }>();
const CACHE_TTL_MS = 900_000;
const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

function cacheKey(input: BriefRequest) {
  return [input.city, input.country, input.country_code, input.category || "front-page", input.station_name, input.language].map((part) => (part || "").trim().toLowerCase()).join("|");
}

function decodeEntities(value = "") {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function tagValue(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeEntities(match?.[1] || "");
}

function parseRss(xml: string, feed: NewsFeed, context: BriefRequest): Headline[] {
  const items = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  return items.map((item) => {
    const link = tagValue(item, "link") || (item.match(/<link[^>]+href=["']([^"']+)/i)?.[1] ?? "");
    return {
      title: tagValue(item, "title"),
      source: feed.name,
      url: link,
      summary: tagValue(item, "description") || tagValue(item, "summary"),
      imageUrl: rssEditorialImage(item),
      publishedAt: tagValue(item, "pubDate") || tagValue(item, "published") || tagValue(item, "updated"),
      city: context.city,
      country: context.country,
      country_code: context.country_code,
    };
  }).filter((headline) => headline.title && /^https?:\/\//i.test(headline.url));
}

async function fetchFeed(feed: NewsFeed, context: BriefRequest) {
  const res = await fetch(feed.url, { signal: AbortSignal.timeout(6000), next: { revalidate: 900 }, headers: { "User-Agent": "WaveAtlasBrief/1.0" } });
  if (!res.ok) return [];
  return parseRss(await res.text(), feed, context).map((headline) => ({ ...headline, score: feed.trusted ? 18 : 0, scope: feed.scope }));
}

async function fetchGdelt(query: string, context: BriefRequest, score: number): Promise<ScoredHeadline[]> {
  const params = new URLSearchParams({ query, mode: "ArtList", format: "json", maxrecords: "10", sort: "HybridRel" });
  const res = await fetch(`${GDELT_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(6000), next: { revalidate: 900 } });
  if (!res.ok) return [];
  const data = (await res.json()) as { articles?: { title?: string; url?: string; sourceCountry?: string; domain?: string; seendate?: string; socialimage?: string }[] };
  return (data.articles || []).map((article) => ({
    title: article.title || "",
    source: article.domain || "GDELT",
    url: article.url || "",
    summary: undefined,
    publishedAt: article.seendate,
    imageUrl: editorialImageUrl(article.socialimage),
    city: context.city,
    country: context.country,
    country_code: context.country_code,
    score,
  })).filter((headline) => headline.title && /^https?:\/\//i.test(headline.url));
}

function rankAndDedupe(headlines: ScoredHeadline[], context: BriefRequest) {
  const city = context.city?.toLowerCase();
  const country = context.country?.toLowerCase();
  const seen = new Set<string>();
  return headlines.filter((headline) => headlineMatchesBrief(headline, context, headline.scope)).map((headline) => {
    const haystack = `${headline.title} ${headline.summary || ""}`.toLowerCase();
    const published = headline.publishedAt ? Date.parse(headline.publishedAt) : 0;
    return { ...headline, score: headline.score + (city && haystack.includes(city) ? 30 : 0) + (country && haystack.includes(country) ? 18 : 0) + (published ? Math.max(0, 12 - (Date.now() - published) / 86_400_000) : 0) };
  }).sort((a, b) => b.score - a.score).filter((headline) => {
    const key = `${headline.title.toLowerCase()}|${headline.url.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5).map(({ score: _score, scope: _scope, ...headline }) => headline);
}

function categoryQuery(input: BriefRequest, category: BriefCategory) {
  const place = [input.city && `"${input.city}"`, input.country && `"${input.country}"`].filter(Boolean).join(" ");
  if (category === "local-pulse") return [place, "(local OR community OR city OR council OR neighborhood OR business)"].filter(Boolean).join(" ");
  if (category === "culture") return [place, "(culture OR music OR film OR arts OR festival OR heritage OR entertainment)"].filter(Boolean).join(" ");
  if (category === "sports") return [place, "(sports OR football OR soccer OR basketball OR athletics OR tennis OR cricket)"].filter(Boolean).join(" ");
  if (category === "radio-signal") return [place, input.station_name ? `"${input.station_name}"` : null, "(radio OR airwaves OR podcast)"].filter(Boolean).join(" ");
  return place;
}

export async function getBriefHeadlines(input: BriefRequest): Promise<Headline[]> {
  const category = input.category || "front-page";
  const normalizedInput = { ...input, category };
  const key = cacheKey(normalizedInput);
  const hit = briefCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const sources = getNewsSources({ city: input.city, countryCode: input.country_code });
  const cityFeeds = sources.citySources.flatMap((source) => source.feeds);
  const countryFeeds = sources.countrySources.flatMap((source) => source.feeds);
  const globalFeeds = sources.globalSources.flatMap((source) => source.feeds);
  const cityCountryQuery = [input.city && `"${input.city}"`, input.country && `"${input.country}"`].filter(Boolean).join(" ");

  const gdeltRequests = category === "front-page"
    ? [cityCountryQuery ? fetchGdelt(cityCountryQuery, normalizedInput, 28).catch(() => []) : Promise.resolve([]), input.country ? fetchGdelt(`"${input.country}" news`, normalizedInput, 20).catch(() => []) : Promise.resolve([])]
    : [fetchGdelt(categoryQuery(normalizedInput, category), normalizedInput, 55).catch(() => [])];
  const [cityItems, countryItems, globalItems, gdeltItems] = await Promise.all([
    ...[cityFeeds, countryFeeds, globalFeeds].map(async (feeds) => (await Promise.all(feeds.map((feed) => fetchFeed(feed, normalizedInput).catch(() => [])))).flat()),
    Promise.all(gdeltRequests).then((items) => items.flat()),
  ]);

  const headlines: ScoredHeadline[] = category === "front-page"
    ? [
        ...cityItems.map((item) => ({ ...item, score: item.score + 60 })),
        ...countryItems.map((item) => ({ ...item, score: item.score + 35 })),
        ...gdeltItems,
        ...globalItems.map((item) => ({ ...item, score: item.score + 6 })),
      ]
    : [
        ...cityItems.filter((item) => headlineMatchesBrief(item, normalizedInput, item.scope)).map((item) => ({ ...item, score: item.score + 70 })),
        ...countryItems.filter((item) => headlineMatchesBrief(item, normalizedInput, item.scope)).map((item) => ({ ...item, score: item.score + 45 })),
        ...gdeltItems,
        ...globalItems.filter((item) => headlineMatchesBrief(item, normalizedInput, item.scope)).map((item) => ({ ...item, score: item.score + 8 })),
      ];

  const value = rankAndDedupe(headlines, normalizedInput);
  briefCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}
