import { WORLD_ENGINE_CACHE_TTL_MS } from "./config";
import { fetchJsonWithTimeout, getCached, setCached } from "./cache";
import type { SourceResult } from "./types";

const NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
const NASA_POWER_TIMEOUT_MS = 4000;
const NASA_POWER_PARAMETERS = ["T2M", "RH2M", "WS10M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN"] as const;

export type NasaPowerClimateContext = {
  temperatureC?: number;
  humidityPercent?: number;
  windSpeedMetersPerSecond?: number;
  rainfallMillimeters?: number;
  solarRadiation?: number;
  date?: string;
};

type PowerParameter = (typeof NASA_POWER_PARAMETERS)[number];
type PowerResponse = { properties?: { parameter?: Partial<Record<PowerParameter, Record<string, number>>> } };

function yyyymmdd(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function displayDate(value: string) {
  return value.length === 8 ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

function latestValue(series?: Record<string, number>) {
  const entries = Object.entries(series ?? {}).filter(([, value]) => Number.isFinite(value) && value > -900);
  entries.sort(([a], [b]) => b.localeCompare(a));
  return entries[0];
}

function rounded(value?: number, precision = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export async function getNasaPowerClimate(lat?: number | null, lng?: number | null): Promise<SourceResult<NasaPowerClimateContext>> {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return { status: "skipped", source: "NASA POWER", confidence: 0, data: null, attribution: "NASA POWER", url: "https://power.larc.nasa.gov/" };
  }

  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 3);
  const latitude = Math.round(lat * 1000) / 1000;
  const longitude = Math.round(lng * 1000) / 1000;
  const key = `nasa-power:daily:${latitude}:${longitude}:${yyyymmdd(start)}:${yyyymmdd(end)}`;

  try {
    let cached = true;
    let payload = getCached<PowerResponse>(key);
    if (!payload) {
      cached = false;
      const params = new URLSearchParams({
        parameters: NASA_POWER_PARAMETERS.join(","),
        community: "RE",
        longitude: String(longitude),
        latitude: String(latitude),
        start: yyyymmdd(start),
        end: yyyymmdd(end),
        format: "JSON",
        "time-standard": "UTC",
      });
      payload = await fetchJsonWithTimeout<PowerResponse>(`${NASA_POWER_URL}?${params.toString()}`, NASA_POWER_TIMEOUT_MS);
      setCached(key, payload, WORLD_ENGINE_CACHE_TTL_MS);
    }

    const parameter = payload.properties?.parameter;
    const t2m = latestValue(parameter?.T2M);
    const rh2m = latestValue(parameter?.RH2M);
    const ws10m = latestValue(parameter?.WS10M);
    const rain = latestValue(parameter?.PRECTOTCORR);
    const solar = latestValue(parameter?.ALLSKY_SFC_SW_DWN);
    const date = t2m?.[0] ?? rh2m?.[0] ?? ws10m?.[0] ?? rain?.[0] ?? solar?.[0];
    const data: NasaPowerClimateContext = {
      temperatureC: rounded(t2m?.[1], 0),
      humidityPercent: rounded(rh2m?.[1], 0),
      windSpeedMetersPerSecond: rounded(ws10m?.[1], 1),
      rainfallMillimeters: rounded(rain?.[1], 1),
      solarRadiation: rounded(solar?.[1], 1),
      date: date ? displayDate(date) : undefined,
    };
    const hasClimate = Object.entries(data).some(([field, value]) => field !== "date" && typeof value === "number");
    if (!hasClimate) return { status: "unavailable", source: "NASA POWER", confidence: 0, data: null, attribution: "NASA POWER", url: "https://power.larc.nasa.gov/", cached };
    return { status: "success", source: "NASA POWER", confidence: 1, data, attribution: "NASA POWER", url: "https://power.larc.nasa.gov/", cached };
  } catch (error) {
    return { status: "error", source: "NASA POWER", confidence: 0, data: null, attribution: "NASA POWER", url: "https://power.larc.nasa.gov/", error: error instanceof Error ? error.message : "Unavailable" };
  }
}
