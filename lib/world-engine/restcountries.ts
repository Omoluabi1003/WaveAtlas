import { WORLD_ENGINE_CACHE_TTL_MS, WORLD_ENGINE_TIMEOUT_MS } from "./config";
import { fetchJsonWithTimeout, getCached, setCached } from "./cache";
import type { SourceResult } from "./types";

type RestCountry = { name?: { common?: string }; cca2?: string; capital?: string[]; currencies?: Record<string, { name?: string; symbol?: string }>; languages?: Record<string, string>; region?: string; subregion?: string; population?: number; timezones?: string[]; flags?: { emoji?: string; svg?: string } };
export type CountryMetadata = { name?: string; code?: string; capital?: string; currency?: string; languages: string[]; region?: string; subregion?: string; population?: number; timezones: string[]; flag?: string };

export async function getRestCountry(countryCode?: string, countryName?: string): Promise<SourceResult<CountryMetadata>> {
  const query = countryCode ? `alpha/${encodeURIComponent(countryCode)}` : countryName ? `name/${encodeURIComponent(countryName)}` : "";
  if (!query) return { status: "skipped", source: "RestCountries", confidence: 0, data: null, attribution: "RestCountries", url: "https://restcountries.com/" };
  const key = `restcountries:${query.toLowerCase()}`;
  const cached = getCached<CountryMetadata>(key);
  if (cached) return { status: "success", source: "RestCountries", confidence: 0.92, data: cached, attribution: "RestCountries", url: "https://restcountries.com/", cached: true };
  try {
    const rows = await fetchJsonWithTimeout<RestCountry[]>(`https://restcountries.com/v3.1/${query}?fields=name,cca2,capital,currencies,languages,region,subregion,population,timezones,flags`, WORLD_ENGINE_TIMEOUT_MS);
    const item = rows[0];
    if (!item) throw new Error("Country not found");
    const currency = Object.values(item.currencies ?? {})[0];
    const data: CountryMetadata = { name: item.name?.common, code: item.cca2, capital: item.capital?.[0], currency: currency ? [currency.name, currency.symbol].filter(Boolean).join(" ") : undefined, languages: Object.values(item.languages ?? {}).slice(0, 4), region: item.region, subregion: item.subregion, population: item.population, timezones: item.timezones ?? [], flag: item.flags?.emoji ?? item.flags?.svg };
    setCached(key, data, WORLD_ENGINE_CACHE_TTL_MS);
    return { status: "success", source: "RestCountries", confidence: 0.92, data, attribution: "RestCountries", url: "https://restcountries.com/" };
  } catch (error) {
    return { status: "error", source: "RestCountries", confidence: 0, data: null, attribution: "RestCountries", url: "https://restcountries.com/", error: error instanceof Error ? error.message : "Unavailable" };
  }
}
