import type { Station } from "@/lib/stations";
import { persistArrival, readArrivalHistory, stationCity, stationGenre } from "./history";
import { chooseStartupMode, type StartupMode } from "./startup-modes";
import { pickStation, stationContinent } from "./station-picker";
import { localTimeForStation } from "@/lib/smart-time-copy";
export type ArrivalDestination = { continent: string; country: string; city: string; genre: string; station: Station; mode: StartupMode; localTime?: string };

export function createArrivalDestination(stations: Station[], storage?: Storage): ArrivalDestination | undefined { const history = readArrivalHistory(storage); const modes: StartupMode[] = [chooseStartupMode(history), "wander", "hidden-gems", "cultural-pulse", "time-zone", "around-the-world"]; for (const mode of modes) { const station = pickStation(stations, history, mode); if (station) { const destination = { continent: stationContinent(station), country: station.country || station.country_code, city: stationCity(station), genre: stationGenre(station), station, mode, localTime: localTimeForStation(station) }; persistArrival(station, destination.continent, storage); return destination; } } }
