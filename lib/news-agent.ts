import { editorialImageUrl, rssEditorialImage } from './editorial-image';
import { briefCity, hasEditorialPhrase, headlineMatchesBrief, type BriefGeographicEvidence } from './brief-editorial';
import { briefCountryTerms, briefLanguage, gdeltSourceCountry, normalizeEditorialText, resolveBriefCountry } from './brief-geography';
import { getNewsSources, type NewsFeedScope, type NewsSourceRegistryEntry } from './news-source-registry';

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
  // Publisher metadata is distinct from the destination displayed by this edition.
  sourceCountry?: string;
  sourceLanguage?: string;
};

export type BriefCategory = 'front-page' | 'local-pulse' | 'culture' | 'sports' | 'radio-signal';
export type BriefRequest = { city?: string; country?: string; country_code?: string; language?: string; category?: BriefCategory; station_name?: string };

type ScoredHeadline = Headline & { score: number; scope?: NewsFeedScope; evidence?: BriefGeographicEvidence; domestic?: boolean };
const briefCache = new Map<string, { expires: number; value: Headline[] }>();
const CACHE_TTL_MS = 900_000;
const EMPTY_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 300;
const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

function cacheKey(input: BriefRequest) {
  return [input.city, input.country_code, input.category || 'front-page', input.station_name, input.language].map((part) => (part || '').trim().toLowerCase()).join('|');
}

function decodeEntities(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (entity, number: string) => {
    const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }).replace(/\s+/g, ' ').trim();
}

function tagValue(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeEntities(match?.[1] || '');
}

async function fetchSource(entry: NewsSourceRegistryEntry, context: BriefRequest): Promise<ScoredHeadline[]> {
  const batches = await Promise.all(entry.feeds.map(async (feed): Promise<ScoredHeadline[]> => {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(feed.scope === 'global' ? 6000 : 10000), next: { revalidate: 900 }, headers: { 'User-Agent': 'WaveAtlasBrief/1.0' } });
      if (!res.ok) return [];
      const items = (await res.text()).match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
      return items.map((item) => ({
        title: tagValue(item, 'title'), source: feed.name,
        url: tagValue(item, 'link') || (item.match(/<link[^>]+href=["']([^"']+)/i)?.[1] ?? ''),
        summary: tagValue(item, 'description') || tagValue(item, 'summary'),
        imageUrl: rssEditorialImage(item),
        publishedAt: tagValue(item, 'pubDate') || tagValue(item, 'published') || tagValue(item, 'updated'),
        city: context.city, country: context.country, country_code: context.country_code,
        sourceCountry: entry.country_code === 'GLOBAL' ? undefined : entry.country,
        sourceLanguage: feed.language || entry.language,
        domestic: entry.country_code === context.country_code,
        score: (feed.trusted ? 18 : 0) + (feed.scope === 'city' ? 60 : feed.scope === 'country' ? 35 : 6),
        scope: feed.scope,
        evidence: feed.domestic ? { domesticCountryCode: entry.country_code, feedCity: entry.city } : undefined,
      })).filter((headline) => headline.title && /^https?:\/\//i.test(headline.url));
    } catch { return []; }
  }));
  return batches.flat();
}

function gdeltDate(value?: string) {
  return value?.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z');
}

async function fetchGdelt(query: string, context: BriefRequest, score: number): Promise<ScoredHeadline[]> {
  try {
    const params = new URLSearchParams({ query, mode: 'ArtList', format: 'json', maxrecords: '30', sort: 'HybridRel', timespan: '3d' });
    const res = await fetch(`${GDELT_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(6000), next: { revalidate: 900 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { articles?: { title?: string; url?: string; sourcecountry?: string; sourceCountry?: string; language?: string; domain?: string; seendate?: string; socialimage?: string }[] };
    if (!Array.isArray(data.articles)) return [];
    return data.articles.map((article) => {
      const sourceCountry = article.sourcecountry || article.sourceCountry;
      return {
        title: decodeEntities(article.title), source: article.domain || 'GDELT', url: article.url || '',
        publishedAt: gdeltDate(article.seendate), imageUrl: editorialImageUrl(article.socialimage),
        city: context.city, country: context.country, country_code: context.country_code,
        sourceCountry, sourceLanguage: article.language,
        domestic: resolveBriefCountry({ country: sourceCountry })?.code === context.country_code,
        score,
      };
    }).filter((headline) => headline.title && /^https?:\/\//i.test(headline.url));
  } catch { return []; }
}

function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  return url.toString().replace(/\/$/, '');
}

function rankAndDedupe(headlines: ScoredHeadline[], context: BriefRequest) {
  const city = briefCity(context);
  const terms = briefCountryTerms(context);
  const language = briefLanguage(context.language);
  const seenTitles = new Set<string>(), seenUrls = new Set<string>();
  const ranked = headlines.filter((item) => headlineMatchesBrief(item, context, item.scope, item.evidence)).map((item) => {
    const text = `${item.title} ${item.summary || ''}`;
    const published = Date.parse(item.publishedAt || '');
    const recency = Number.isFinite(published) ? Math.max(0, 12 - Math.max(0, Date.now() - published) / 86_400_000) : 0;
    return { ...item, score: item.score + (city && hasEditorialPhrase(text, city) ? 30 : 0) + (terms.some((term) => hasEditorialPhrase(text, term)) ? 18 : 0) + (language && briefLanguage(item.sourceLanguage) === language ? 10 : 0) + recency };
  }).sort((a, b) => b.score - a.score).filter((item) => {
    const title = normalizeEditorialText(item.title), url = canonicalUrl(item.url);
    if (seenTitles.has(title) || seenUrls.has(url)) return false;
    seenTitles.add(title); seenUrls.add(url); return true;
  });
  const selected: ScoredHeadline[] = [];
  const add = (pool: ScoredHeadline[], count: number) => {
    let added = 0;
    // Prefer varied publishers, but do not invent filler when only one is available.
    for (const diverse of [true, false]) for (const item of pool) {
      if (added >= count || selected.length >= 5) return;
      if (selected.includes(item) || (diverse && selected.filter((pick) => pick.source === item.source).length >= 2)) continue;
      selected.push(item); added++;
    }
  };
  if (context.category === 'front-page') {
    add(ranked.filter((item) => item.domestic), 3);
    if (city && !selected.some((item) => hasEditorialPhrase(`${item.title} ${item.summary || ''}`, city))) add(ranked.filter((item) => hasEditorialPhrase(`${item.title} ${item.summary || ''}`, city)), 1);
    add(ranked.filter((item) => item.sourceCountry && resolveBriefCountry({ country: item.sourceCountry })?.code !== context.country_code), 1);
  }
  add(ranked, 5 - selected.length);
  return selected.sort((a, b) => b.score - a.score).map(({ score: _score, scope: _scope, evidence: _evidence, domestic: _domestic, ...item }) => item);
}

// All interpolated phrases are normalized and quoted; request text cannot inject operators.
function phrase(value: string) { return `"${normalizeEditorialText(value).slice(0, 100)}"`; }
function placeQuery(input: BriefRequest) {
  const city = briefCity(input);
  const terms = [...new Set([...briefCountryTerms(input).slice(0, 9), ...(city ? [city] : [])])];
  return terms.length > 1 ? `(${terms.map(phrase).join(' OR ')})` : terms[0] ? phrase(terms[0]) : '';
}
function topicQuery(input: BriefRequest) {
  switch (input.category) {
    case 'local-pulse': return '(local OR community OR city OR council OR neighborhood OR business OR housing OR schools OR transport)';
    case 'culture': return '(culture OR music OR film OR arts OR festival OR heritage OR entertainment)';
    case 'sports': return '(sports OR football OR soccer OR basketball OR athletics OR tennis OR cricket)';
    case 'radio-signal': return `(radio OR airwaves OR podcast${input.station_name ? ` OR ${phrase(input.station_name)}` : ''})`;
    default: return '';
  }
}

export async function getBriefHeadlines(input: BriefRequest): Promise<Headline[]> {
  const country = resolveBriefCountry(input);
  // Without a resolved destination there is no honest country edition.
  if (!country) return [];
  const sources = getNewsSources({ city: input.city, countryCode: country.code });
  const context: BriefRequest = { ...input, country: country.name, country_code: country.code, category: input.category || 'front-page', language: input.language || sources.countrySources[0]?.language };
  const key = cacheKey(context);
  const hit = briefCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const city = briefCity(context);
  const geography = context.category === 'local-pulse' && city ? phrase(city) : placeQuery(context);
  const query = [geography, topicQuery(context)].filter(Boolean).join(' ');
  const domesticQuery = `${query} sourcecountry:${gdeltSourceCountry(context)}`;
  const language = briefLanguage(context.language);
  const gdeltRequests = [fetchGdelt(domesticQuery, context, 50), fetchGdelt(query, context, 20)];
  if (language) gdeltRequests.push(fetchGdelt(`${domesticQuery} sourcelang:${language}`, context, 55));
  const [rss, gdelt] = await Promise.all([
    Promise.all([...sources.citySources, ...sources.countrySources, ...sources.globalSources].map((entry) => fetchSource(entry, context))).then((items) => items.flat()),
    Promise.all(gdeltRequests).then((items) => items.flat()),
  ]);
  const value = rankAndDedupe([...rss, ...gdelt], context);
  for (const [cacheId, entry] of briefCache) if (entry.expires <= Date.now()) briefCache.delete(cacheId);
  if (briefCache.size >= MAX_CACHE_ENTRIES) briefCache.delete(briefCache.keys().next().value!);
  briefCache.set(key, { value, expires: Date.now() + (value.length ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS) });
  return value;
}
