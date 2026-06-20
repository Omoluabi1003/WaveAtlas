import { isStationAvailable, type Station } from "@/lib/stations";
import { stationCity, stationGenre, stationHistoryKey, type ArrivalHistory } from "./history";
import { nextContinent, type StartupMode } from "./startup-modes";

export const countryContinents: Record<string, string> = { NG:"Africa", GH:"Africa", ZA:"Africa", KE:"Africa", EG:"Africa", MA:"Africa", TZ:"Africa", UG:"Africa", CM:"Africa", SN:"Africa", CD:"Africa", MG:"Africa", GB:"Europe", FR:"Europe", DE:"Europe", NL:"Europe", ES:"Europe", IT:"Europe", SE:"Europe", NO:"Europe", IE:"Europe", CH:"Europe", BE:"Europe", PT:"Europe", FO:"Europe", GL:"North America", JP:"Asia", IN:"Asia", CN:"Asia", KR:"Asia", ID:"Asia", PH:"Asia", TH:"Asia", MY:"Asia", SG:"Asia", AE:"Asia", SA:"Asia", QA:"Asia", IL:"Asia", TR:"Asia", MN:"Asia", AU:"Oceania", NZ:"Oceania", FJ:"Oceania", PG:"Oceania", US:"North America", CA:"North America", MX:"North America", JM:"Caribbean", CU:"Caribbean", DO:"Caribbean", HT:"Caribbean", BS:"Caribbean", BR:"South America", AR:"South America", CL:"South America", CO:"South America", PE:"South America" };
const hiddenGemCountries = new Set(["MG", "GL", "FO", "PG", "MN", "FJ"]);
const lesserKnownRegions = new Set(["Africa", "Oceania", "Caribbean"]);

export function stationContinent(station: Station) { return countryContinents[station.country_code] || "Global"; }
function weightedPick<T>(items: { item: T; weight: number }[]) { const total = items.reduce((sum, entry) => sum + Math.max(0.01, entry.weight), 0); let cursor = Math.random() * total; for (const entry of items) { cursor -= Math.max(0.01, entry.weight); if (cursor <= 0) return entry.item; } return items.at(-1)?.item; }

export function scoreStation(station: Station, history: ArrivalHistory, mode: StartupMode) {
  const key = stationHistoryKey(station);
  const continent = stationContinent(station);
  const city = `${stationCity(station)}, ${station.country}`;
  const genre = stationGenre(station);
  if (history.last100Stations[0] === key || history.last50Cities[0] === city || history.last30Countries[0] === station.country || history.last10Continents[0] === continent) return 0;
  let score = 1 + Math.random() * 2;
  const stationAge = history.last100Stations.indexOf(key);
  if (stationAge >= 0) score *= 0.04 + Math.min(0.7, stationAge / 130);
  if (history.last50Cities.includes(city)) score *= 0.18;
  if (history.last30Countries.includes(station.country)) score *= 0.25;
  if (history.last10Continents.includes(continent)) score *= 0.55;
  if (history.last15Genres.includes(genre)) score *= 0.45;
  if (!history.last30Countries.includes(station.country)) score *= 2.2;
  if (!history.last10Continents.includes(continent)) score *= 1.7;
  if (hiddenGemCountries.has(station.country_code)) score *= 6;
  if (lesserKnownRegions.has(continent)) score *= 1.6;
  if (station.votes < 1000) score *= 1.45;
  if (station.click_count < 10000) score *= 1.25;
  if (mode === "around-the-world") score *= continent === nextContinent(history) ? 3 : 0.35;
  if (mode === "hidden-gems") score *= (hiddenGemCountries.has(station.country_code) ? 5 : 1) * (station.votes < 5000 ? 2.4 : 0.75) * (station.click_count < 25000 ? 1.6 : 0.85);
  if (mode === "cultural-pulse") score *= /local|folk|community|regional|afro|jazz|gospel|worship|world/i.test(`${station.tags.join(" ")} ${station.language}`) ? 2.2 : 0.8;
  if (mode === "time-zone") { const hour = station.longitude == null ? 12 : (new Date().getUTCHours() + Math.round(station.longitude / 15) + 24) % 24; const desired = hour < 6 ? /ambient|classical|jazz|talk/i : hour < 12 ? /news|talk|morning/i : hour < 18 ? /music|pop|local|world/i : /jazz|talk|dance|night|local/i; score *= desired.test(`${station.tags.join(" ")} ${station.name}`) ? 1.9 : 0.85; }
  return isStationAvailable(station) ? score : 0;
}
export function pickStation(stations: Station[], history: ArrivalHistory, mode: StartupMode, filter?: (station: Station) => boolean) { const pool = Math.random() < 0.1 ? stations.filter((station) => hiddenGemCountries.has(station.country_code)) : stations; const candidates = pool.filter((station) => isStationAvailable(station) && (!filter || filter(station))); const valid = candidates.filter((station) => stationHistoryKey(station) !== history.last100Stations[0]); return weightedPick(valid.map((item) => ({ item, weight: scoreStation(item, history, mode) }))) ?? weightedPick(candidates.map((item) => ({ item, weight: 1 }))); }
export function pickFallbackStation(stations: Station[], failed: Station, history: ArrivalHistory) { const continent = stationContinent(failed); const city = stationCity(failed); const tiers = [ (station: Station) => station.id !== failed.id && station.country_code === failed.country_code && stationCity(station) === city, (station: Station) => station.id !== failed.id && station.country_code === failed.country_code, (station: Station) => station.id !== failed.id && stationContinent(station) === continent, (station: Station) => station.id !== failed.id ]; for (const tier of tiers) { const picked = pickStation(stations, history, "wander", tier); if (picked) return picked; } }
