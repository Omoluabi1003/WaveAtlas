import type { Station } from './stations';
import { normalizeReliability } from './stream-reliability';
export type AudioTourismJourney = { id: string; name: string; description: string; stops: Array<{ description: string; stationIds?: string[]; countries?: string[]; languages?: string[]; genres?: string[] }> };
export const AUDIO_TOURISM_JOURNEYS: AudioTourismJourney[] = [
 { id: 'lagos-to-kinshasa', name: 'Lagos to Kinshasa', description: 'Follow two musical capitals across western and central Africa.', stops: [{ description: 'Begin in Lagos.', stationIds: ['cool-fm-lagos','wazobia-fm-lagos'] }, { description: 'Cross toward Kinshasa.', countries: ['CD'] }] },
 { id: 'francophone-africa', name: 'Francophone Africa', description: 'Explore French-language broadcasting across African destinations.', stops: ['SN','CI','CM','CG','CD'].map(country => ({ description: 'A new perspective through French-language radio.', countries: [country], languages: ['French'] })) },
 { id: 'caribbean-nights', name: 'Caribbean Nights', description: 'Travel through island voices and rhythms.', stops: ['JM','TT','BB','HT'].map(country => ({ description: 'Listen to another Caribbean destination.', countries: [country] })) },
 { id: 'world-news-tour', name: 'World News Tour', description: 'Hear how news travels across borders.', stops: ['GB','FR','NG','US'].map(country => ({ description: 'A different national perspective.', countries: [country], genres: ['news'] })) },
 { id: 'african-gospel-morning', name: 'African Gospel Morning', description: 'Explore gospel broadcasting across Africa.', stops: ['NG','GH','KE','ZA'].map(country => ({ description: 'Continue through regional gospel broadcasting.', countries: [country], genres: ['gospel'] })) },
 { id: 'jazz-across-continents', name: 'Jazz Across Continents', description: 'Follow jazz programming across geographic traditions.', stops: ['FR','US','JP','ZA'].map(country => ({ description: 'Jazz from another destination.', countries: [country], genres: ['jazz'] })) },
];
export function resolveTourismJourney(journey: AudioTourismJourney, inventory: Station[], excluded = new Set<string>(), now = Date.now()) {
  const unique = [...new Map(inventory.map(station => [station.station_uuid, station])).values()];
  const used = new Set(excluded);
  return journey.stops.flatMap((stop, index) => {
    const station = unique.filter(station => !used.has(station.station_uuid) && station.is_active && station.url && ['Excellent','Stable','Recovering'].includes(normalizeReliability(station, { now })) && (!stop.stationIds || stop.stationIds.includes(station.station_uuid)) && (!stop.countries || stop.countries.includes(station.country_code)) && (!stop.languages || stop.languages.some(language => station.language.toLowerCase().includes(language.toLowerCase()))) && (!stop.genres || stop.genres.some(genre => station.tags.some(tag => tag.toLowerCase() === genre.toLowerCase())))).sort((a,b) => b.health_score - a.health_score)[0];
    if (!station) return []; used.add(station.station_uuid); return [{ station, description: stop.description, stopIndex: index }];
  });
}
