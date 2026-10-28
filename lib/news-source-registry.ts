import type { BriefCategory } from './news-agent';
import { briefCityTerms, normalizeEditorialText } from './brief-geography';

export type NewsFeedScope = "city" | "country" | "regional" | "global";
export type NewsSourceRole = "domestic-editorial" | "regional-editorial" | "global-corroboration" | "primary-authority";

export type NewsFeed = {
  name: string;
  url: string;
  scope: NewsFeedScope;
  trusted: boolean;
  role?: Exclude<NewsSourceRole, "primary-authority">;
  // True only for a destination-specific domestic section, never a general/world feed.
  domestic?: boolean;
  language?: string;
  categories?: BriefCategory[];
  includeImages?: boolean;
  aggregated?: boolean;
};

export type NewsSourceRegistryEntry = {
  country_code: string;
  country: string;
  city?: string;
  language?: string;
  region?: string;
  feeds: NewsFeed[];
};

export type InstitutionalReference = {
  name: string;
  publisher: string;
  url: string;
  role: "primary-authority";
  scope: "global" | "regional" | "country";
  topics: string[];
  matchTerms: string[];
};

export const institutionalReferenceRegistry: InstitutionalReference[] = [
  {
    name: "Universal Declaration of Human Rights",
    publisher: "United Nations Human Rights (OHCHR)",
    url: "https://www.ohchr.org/en/universal-declaration-of-human-rights",
    role: "primary-authority",
    scope: "global",
    topics: ["human rights", "civil liberties", "detention", "conflict", "displacement", "refugees"],
    matchTerms: ["human rights", "rights violation", "detention", "detained", "arrested", "prison", "protest", "refugee", "refugees", "displaced", "displacement", "civilian", "civilians", "discrimination", "torture", "freedom of speech", "freedom of expression", "asylum"],
  },
];

export function getInstitutionalReferences(texts: string[] = []) {
  if (!texts.length) return [];
  const normalized = normalizeEditorialText(texts.join(' '));
  return institutionalReferenceRegistry.filter((reference) => reference.matchTerms.some((term) => normalized.includes(normalizeEditorialText(term))));
}

export const newsSourceRegistry: NewsSourceRegistryEntry[] = [
  {
    country_code: "GLOBAL",
    country: "Global",
    feeds: [
      { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", scope: "global", trusted: true, role: "global-corroboration" },
      { name: "NBC News World", url: "https://feeds.nbcnews.com/nbcnews/public/world", scope: "global", trusted: true, role: "global-corroboration" },
      { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", scope: "global", trusted: true, role: "global-corroboration" },
      { name: "France24", url: "https://www.france24.com/en/rss", scope: "global", trusted: true, role: "global-corroboration" },
      { name: "DW", url: "https://rss.dw.com/rdf/rss-en-all", scope: "global", trusted: true, role: "global-corroboration" },
    ],
  },
  {
    country_code: "NG",
    country: "Nigeria",
    language: "English",
    feeds: [
      { name: "The Guardian Nigeria", url: "https://guardian.ng/feed/", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" },
      { name: "Premium Times Nigeria", url: "https://www.premiumtimesng.com/feed", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" },
      { name: "Vanguard Nigeria", url: "https://www.vanguardngr.com/feed/", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" },
      { name: "Punch Nigeria", url: "https://punchng.com/feed/", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" },
    ],
  },
  {
    country_code: "AE",
    country: "United Arab Emirates",
    language: "English",
    region: "Gulf",
    feeds: [
      { name: "Gulf News", url: "https://gulfnews.com/stories.rss", scope: "country", trusted: true, domestic: true, role: "regional-editorial", language: "English" },
    ],
  },
  { country_code: "AU", country: "Australia", language: "English", feeds: [{ name: "ABC Australia", url: "https://www.abc.net.au/news/feed/51120/rss.xml", scope: "country", trusted: true, role: "domestic-editorial" }] },
  { country_code: "CA", country: "Canada", language: "English", feeds: [
    { name: "CBC Canada", url: "https://www.cbc.ca/cmlink/rss-canada", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" },
    { name: "Global News Canada", url: "https://globalnews.ca/canada/feed/", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" },
  ] },
  { country_code: "IN", country: "India", language: "Hindi", feeds: [{ name: "The Hindu National", url: "https://www.thehindu.com/news/national/feeder/default.rss", scope: "country", trusted: true, domestic: true, language: "English", role: "domestic-editorial" }] },
  { country_code: "US", country: "United States", language: "English", feeds: [{ name: "NPR National", url: "https://feeds.npr.org/1003/rss.xml", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" }] },
  { country_code: "GB", country: "United Kingdom", language: "English", feeds: [{ name: "BBC UK", url: "https://feeds.bbci.co.uk/news/uk/rss.xml", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" }] },
  { country_code: "FR", country: "France", language: "French", feeds: [{ name: "France24 France", url: "https://www.france24.com/en/france/rss", scope: "country", trusted: true, domestic: true, language: "English", role: "domestic-editorial" }] },
  { country_code: "ES", country: "Spain", language: "Spanish", feeds: [{ name: "El País España", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/portada", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" }] },
  { country_code: "BR", country: "Brazil", language: "Portuguese", feeds: [{ name: "Agência Brasil", url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml", scope: "country", trusted: true, role: "domestic-editorial" }] },
  { country_code: "JP", country: "Japan", language: "Japanese", feeds: [{ name: "NHK Society", url: "https://www3.nhk.or.jp/rss/news/cat1.xml", scope: "country", trusted: true, domestic: true, role: "domestic-editorial" }] },
  { country_code: "CG", country: "Republic of the Congo", language: "French", feeds: [] },
  { country_code: "CD", country: "Democratic Republic of the Congo", language: "French", feeds: [] },
  { country_code: "DE", country: "Germany", language: "German", feeds: [
    { name: "SZ Politics", url: "https://rss.sueddeutsche.de/rss/Politik", scope: "country", trusted: true, includeImages: false, role: "domestic-editorial" },
    { name: "SZ Culture", url: "https://rss.sueddeutsche.de/rss/Kultur", scope: "country", trusted: true, language: "German", categories: ["culture"], includeImages: false, role: "domestic-editorial" },
    { name: "SZ Sports", url: "https://rss.sueddeutsche.de/rss/Sport", scope: "country", trusted: true, language: "German", categories: ["sports"], includeImages: false, role: "domestic-editorial" },
    { name: "RADIOSZENE", url: "https://www.radioszene.de/feed", scope: "regional", trusted: true, language: "German", categories: ["radio-signal"], role: "regional-editorial" },
    { name: "radiowoche", url: "https://www.radiowoche.de/feed/", scope: "regional", trusted: true, language: "German", categories: ["radio-signal"], role: "regional-editorial" },
  ] },
  { country_code: "DE", country: "Germany", city: "Munich", language: "German", feeds: [
    { name: "SZ Munich", url: "https://rss.sueddeutsche.de/rss/Muenchen", scope: "city", trusted: true, domestic: true, includeImages: false, role: "domestic-editorial" },
  ] },
];

function sameText(a = "", b = "") {
  return normalizeEditorialText(a) === normalizeEditorialText(b);
}

export function getNewsSources({ city, countryCode }: { city?: string; countryCode?: string }) {
  const code = countryCode?.trim().toUpperCase();
  const cityNames = briefCityTerms({ city, country_code: code });
  const citySources = newsSourceRegistry.filter((entry) => entry.city && cityNames.some((name) => sameText(entry.city, name)) && code && entry.country_code === code);
  const countrySources = newsSourceRegistry.filter((entry) => code && entry.country_code === code && !entry.city);
  const globalSources = newsSourceRegistry.filter((entry) => entry.country_code === "GLOBAL");
  return { citySources, countrySources, globalSources };
}
