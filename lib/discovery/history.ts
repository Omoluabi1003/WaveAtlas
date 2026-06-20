import type { Station } from "@/lib/stations";

export type ArrivalHistory = {
  last100Stations: string[];
  last50Cities: string[];
  last30Countries: string[];
  last15Genres: string[];
  last10Continents: string[];
};

const KEY = "waveatlas:arrival-history";

const emptyHistory: ArrivalHistory = {
  last100Stations: [],
  last50Cities: [],
  last30Countries: [],
  last15Genres: [],
  last10Continents: [],
};

function uniquePush(value: string, list: string[], limit: number) {
  const clean = value.trim();
  if (!clean) return list.slice(0, limit);
  return [clean, ...list.filter((item) => item !== clean)].slice(0, limit);
}

function readList(parsed: Record<string, unknown>, primary: string, fallback: string, limit: number) {
  const value = parsed[primary] ?? parsed[fallback];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)).slice(0, limit) : [];
}

export function readArrivalHistory(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): ArrivalHistory {
  if (!storage) return emptyHistory;
  try {
    const parsed = JSON.parse(storage.getItem(KEY) || "{}") as Record<string, unknown>;
    return {
      last100Stations: readList(parsed, "last100Stations", "last50Stations", 100),
      last50Cities: readList(parsed, "last50Cities", "last20Cities", 50),
      last30Countries: readList(parsed, "last30Countries", "last10Countries", 30),
      last15Genres: readList(parsed, "last15Genres", "last10Genres", 15),
      last10Continents: readList(parsed, "last10Continents", "last5Continents", 10),
    };
  } catch {
    return emptyHistory;
  }
}

export function stationHistoryKey(station: Station) { return station.station_uuid || station.id || station.name; }
export function stationCity(station: Station) { return station.city || station.state || "Unknown City"; }
export function stationGenre(station: Station) { return station.tags.find(Boolean) || station.language || "Global Sound"; }
export function destinationLabel(station: Station) { return `${stationCity(station)}, ${station.country || station.country_code}`; }

export function persistArrival(station: Station, continent: string, storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage) {
  if (!storage) return readArrivalHistory(storage);
  const previous = readArrivalHistory(storage);
  const next: ArrivalHistory = {
    last100Stations: uniquePush(stationHistoryKey(station), previous.last100Stations, 100),
    last50Cities: uniquePush(destinationLabel(station), previous.last50Cities, 50),
    last30Countries: uniquePush(station.country || station.country_code, previous.last30Countries, 30),
    last15Genres: uniquePush(stationGenre(station), previous.last15Genres, 15),
    last10Continents: uniquePush(continent, previous.last10Continents, 10),
  };
  storage.setItem(KEY, JSON.stringify(next));
  return next;
}
