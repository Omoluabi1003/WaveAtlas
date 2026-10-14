import type { Station } from './stations';
import { inferStationTimeZone } from './smart-time-copy';
const multiZoneCountries = new Set(['US','CA','AU','BR','MX','RU','ID','ES','PT','CL','EC','NZ','CD']);
const cityTimeZones: Record<string,string> = { 'US:new york':'America/New_York','US:chicago':'America/Chicago','US:seattle':'America/Los_Angeles','US:washington':'America/New_York','US:los angeles':'America/Los_Angeles','CA:toronto':'America/Toronto','CA:vancouver':'America/Vancouver','AU:sydney':'Australia/Sydney','AU:perth':'Australia/Perth','BR:são paulo':'America/Sao_Paulo','CD:kinshasa':'Africa/Kinshasa','CD:lubumbashi':'Africa/Lubumbashi' };
const singleZoneCountries: Record<string,string> = { CG:'Africa/Brazzaville', GH:'Africa/Accra', SN:'Africa/Dakar', CI:'Africa/Abidjan', CM:'Africa/Douala', JM:'America/Jamaica', TT:'America/Port_of_Spain', BB:'America/Barbados', HT:'America/Port-au-Prince' };
export function stationLocalTime(station: Station, date = new Date()) {
  const cityKey = `${station.country_code}:${station.city || station.state || ''}`.toLowerCase();
  const zone = Object.entries(cityTimeZones).find(([key]) => key.toLowerCase() === cityKey)?.[1] ?? (!multiZoneCountries.has(station.country_code) ? singleZoneCountries[station.country_code] ?? inferStationTimeZone({ ...station, longitude: undefined }) : undefined);
  return zone ? new Intl.DateTimeFormat(undefined,{ hour:'numeric',minute:'2-digit',timeZone:zone }).format(date) : undefined;
}
export function stationFrequency(station: Station) { return station.name.match(/\b\d{2,4}(?:[.,]\d{1,2})?\s*(?:MHz|kHz|FM|AM)\b/i)?.[0]; }
