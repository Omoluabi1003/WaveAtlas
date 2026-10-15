import { fetchStationByUuid, fetchStationsByCountry, type Station } from './stations';
import type { AudioTourismJourney } from './audio-tourism-journeys';
export async function fetchJourneyInventory(journey: AudioTourismJourney): Promise<Station[]> {
  const [countries, identities] = await Promise.all([
    Promise.all([...new Set(journey.stops.flatMap(stop => stop.countries ?? []))].map(countryCode => fetchStationsByCountry({ countryCode, limit: '100' }).catch(() => []))),
    Promise.all([...new Set(journey.stops.flatMap(stop => stop.stationIds ?? []))].map(id => fetchStationByUuid(id).catch(() => null))),
  ]);
  return [...new Map([...countries.flat(), ...identities.filter((station): station is Station => station !== null)].map(station => [station.station_uuid, station])).values()];
}
