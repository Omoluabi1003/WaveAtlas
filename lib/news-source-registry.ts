export type NewsFeedScope = "city" | "country" | "regional" | "global";

export type NewsFeed = {
  name: string;
  url: string;
  scope: NewsFeedScope;
  trusted: boolean;
};

export type NewsSourceRegistryEntry = {
  country_code: string;
  country: string;
  city?: string;
  language?: string;
  region?: string;
  feeds: NewsFeed[];
};

export const newsSourceRegistry: NewsSourceRegistryEntry[] = [
  {
    country_code: "GLOBAL",
    country: "Global",
    feeds: [
      { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", scope: "global", trusted: true },
      { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", scope: "global", trusted: true },
      { name: "France24", url: "https://www.france24.com/en/rss", scope: "global", trusted: true },
      { name: "DW", url: "https://rss.dw.com/rdf/rss-en-all", scope: "global", trusted: true },
    ],
  },
  {
    country_code: "NG",
    country: "Nigeria",
    feeds: [
      { name: "Premium Times Nigeria", url: "https://www.premiumtimesng.com/feed", scope: "country", trusted: true },
      { name: "Vanguard Nigeria", url: "https://www.vanguardngr.com/feed/", scope: "country", trusted: true },
      { name: "Punch Nigeria", url: "https://punchng.com/feed/", scope: "country", trusted: true },
    ],
  },
  { country_code: "AU", country: "Australia", feeds: [{ name: "ABC Australia", url: "https://www.abc.net.au/news/feed/51120/rss.xml", scope: "country", trusted: true }] },
  { country_code: "CA", country: "Canada", feeds: [{ name: "CBC World", url: "https://www.cbc.ca/cmlink/rss-world", scope: "country", trusted: true }] },
  { country_code: "IN", country: "India", feeds: [{ name: "The Hindu International", url: "https://www.thehindu.com/news/international/feeder/default.rss", scope: "country", trusted: true }] },
  { country_code: "US", country: "United States", feeds: [{ name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", scope: "country", trusted: true }] },
  { country_code: "GB", country: "United Kingdom", feeds: [{ name: "BBC UK", url: "https://feeds.bbci.co.uk/news/uk/rss.xml", scope: "country", trusted: true }] },
  { country_code: "FR", country: "France", feeds: [{ name: "France24 France", url: "https://www.france24.com/en/france/rss", scope: "country", trusted: true }] },
];

function sameText(a = "", b = "") {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function getNewsSources({ city, countryCode }: { city?: string; countryCode?: string }) {
  const code = countryCode?.toUpperCase();
  const citySources = newsSourceRegistry.filter((entry) => entry.city && city && sameText(entry.city, city) && (!code || entry.country_code === code));
  const countrySources = newsSourceRegistry.filter((entry) => code && entry.country_code === code && !entry.city);
  const globalSources = newsSourceRegistry.filter((entry) => entry.country_code === "GLOBAL");
  return { citySources, countrySources, globalSources };
}
