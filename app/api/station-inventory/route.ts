import { NextResponse } from "next/server";
import { ariyoSeedStations, fallbackStations } from "@/lib/stations";
import { campusAtlasStations } from "@/lib/stations/campusAtlasStations";

type RadioBrowserCountry = {
  name?: string;
  iso_3166_1?: string;
  stationcount?: number;
};

type InventoryStats = {
  globalSignals: number;
  countries: Record<string, number>;
  source: "radio-browser" | "curated";
};

const API_BASE = process.env.RADIO_BROWSER_API_BASE ?? "https://de1.api.radio-browser.info/json";
const UA = "WaveAtlas/1.0 (global-radio-discovery)";
const INVENTORY_CACHE_TTL_MS = 6 * 60 * 60_000;
let inventoryCache: { expires: number; value: InventoryStats } | null = null;

function curatedInventoryStats(): InventoryStats {
  const countries: Record<string, number> = {};
  const seen = new Set<string>();

  for (const station of [...fallbackStations, ...ariyoSeedStations, ...campusAtlasStations]) {
    const key = (station.station_uuid || station.id || station.url || station.name).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const code = station.country_code?.toUpperCase();
    if (!code || code === "UN") continue;
    countries[code] = (countries[code] ?? 0) + 1;
  }

  return {
    globalSignals: Object.values(countries).reduce((sum, count) => sum + count, 0),
    countries,
    source: "curated",
  };
}

async function fetchInventoryStats(): Promise<InventoryStats> {
  if (inventoryCache && inventoryCache.expires > Date.now()) return inventoryCache.value;

  try {
    const response = await fetch(`${API_BASE}/countries`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 21_600 },
    });
    if (!response.ok) throw new Error(`Radio Browser ${response.status}`);

    const rows = (await response.json()) as RadioBrowserCountry[];
    const countries = rows.reduce<Record<string, number>>((acc, country) => {
      const code = country.iso_3166_1?.toUpperCase();
      if (!code) return acc;
      acc[code] = Math.max(acc[code] ?? 0, Number(country.stationcount ?? 0));
      return acc;
    }, {});

    const value: InventoryStats = {
      globalSignals: Object.values(countries).reduce((sum, count) => sum + count, 0),
      countries,
      source: "radio-browser",
    };
    inventoryCache = { value, expires: Date.now() + INVENTORY_CACHE_TTL_MS };
    return value;
  } catch {
    const value = curatedInventoryStats();
    inventoryCache = { value, expires: Date.now() + 15 * 60_000 };
    return value;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const countryCode = searchParams.get("countryCode")?.toUpperCase() || undefined;
  const stats = await fetchInventoryStats();
  const countrySignals = countryCode ? stats.countries[countryCode] ?? 0 : undefined;

  return NextResponse.json({
    ...stats,
    countryCode,
    countrySignals,
    label: typeof countrySignals === "number" ? `${countrySignals.toLocaleString()} ${countrySignals === 1 ? "signal" : "signals"}` : undefined,
  });
}
