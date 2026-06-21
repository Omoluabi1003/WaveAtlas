import { getNearestGeoName } from "./geonames";
import { getNearbyOsmPoi } from "./osm";
import { getRestCountry } from "./restcountries";
import type { SourceResult, WorldContext, WorldContextInput } from "./types";
import { getNasaPowerClimate } from "./nasa-power";
import { getNearbyEarthquakes } from "./usgs-earthquake";
import { getWikipediaSummary } from "./wikipedia";

function source<T>(results: SourceResult[], name: string): T | null { return (results.find((r) => r.source === name && r.status === "success")?.data as T | undefined) ?? null; }
function localTime(timezones?: string[]) { const tz = timezones?.find((item) => /^[A-Za-z]+\//.test(item)); if (!tz) return undefined; try { return new Intl.DateTimeFormat("en", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date()); } catch { return undefined; } }

export async function getWorldContext(input: WorldContextInput): Promise<WorldContext> {
  const place = input.city || input.state || input.country;
  const settled = await Promise.allSettled([
    getRestCountry(input.countryCode, input.country),
    getWikipediaSummary(place, input.country),
    getNearbyEarthquakes(input.latitude, input.longitude),
    getNearbyOsmPoi(input.latitude, input.longitude),
    getNearestGeoName(input.latitude, input.longitude),
    getNasaPowerClimate(input.latitude, input.longitude),
  ]);
  const sources: SourceResult[] = settled.map((item, index) => item.status === "fulfilled" ? item.value : { status: "error", source: ["RestCountries", "Wikipedia", "USGS Earthquake", "OpenStreetMap", "GeoNames", "NASA POWER"][index], confidence: 0, data: null, attribution: "Open data", error: item.reason instanceof Error ? item.reason.message : "Unavailable" });
  const country = source<{ name?: string; capital?: string; currency?: string; languages: string[]; region?: string; subregion?: string; population?: number; timezones: string[] }>(sources, "RestCountries");
  const wiki = source<{ summary: string; title: string; url?: string }>(sources, "Wikipedia");
  const osm = source<{ landmarks: Array<{ name: string }> }>(sources, "OpenStreetMap");
  const geonames = source<{ name?: string; country?: string }>(sources, "GeoNames");
  const quakes = source<{ nearby: Array<{ magnitude?: number; place?: string; distanceKm: number }> }>(sources, "USGS Earthquake");
  const climate = source<WorldContext["climate"]>(sources, "NASA POWER");
  const geoConfidence = Math.max(...sources.map((r) => r.confidence), input.latitude && input.longitude ? 0.55 : 0.25);
  return {
    radioDNA: { stationName: input.stationName, country: country?.name ?? input.country, nearestCity: geonames?.name ?? input.city ?? input.state, localTime: localTime(country?.timezones), languages: country?.languages?.length ? country.languages : input.language ? [input.language] : [], currency: country?.currency, population: country?.population, region: [country?.region, country?.subregion].filter(Boolean).join(" · ") || undefined, culturalSummary: wiki?.summary, nearbyLandmarks: (osm?.landmarks ?? []).map((p) => p.name).slice(0, 3), geoConfidence: Math.round(geoConfidence * 100) },
    place: { country: country?.name ?? input.country, capital: country?.capital, nearestCity: geonames?.name ?? input.city, coordinates: { lat: input.latitude, lng: input.longitude } },
    culture: { summary: wiki?.summary, wikipediaTitle: wiki?.title },
    people: { population: country?.population, languages: country?.languages ?? [], currency: country?.currency },
    environment: { recentEarthquakes: quakes?.nearby ?? [] },
    climate: climate ?? undefined,
    openData: [
      { name: "NASA GIBS", description: "Optional public satellite imagery layer endpoint for future Audio Earth mode.", url: "https://gibs.earthdata.nasa.gov/", attribution: "NASA GIBS" },
      { name: "Natural Earth", description: "Public-domain fallback geography for boundaries and coastlines.", url: "https://www.naturalearthdata.com/", attribution: "Natural Earth" },
      { name: "Overture Maps", description: "Future server-side pathway for open places/buildings without client parquet loading.", url: "https://overturemaps.org/", attribution: "Overture Maps Foundation" },
    ],
    sources,
    generatedAt: new Date().toISOString(),
  };
}
