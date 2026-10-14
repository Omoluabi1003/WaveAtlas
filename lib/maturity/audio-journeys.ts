import type { Station } from '../stations';
import { streamReliability } from './reliability';
export type AudioJourney = { id: string; name: string; description: string; stops: { label: string; stationIds?: string[]; countries?: string[]; languages?: string[]; genres?: string[]; description: string }[] };
export const audioJourneys: AudioJourney[] = [
  { id: 'lagos-to-kinshasa', name: 'Lagos to Kinshasa', description: 'Travel from Nigerian broadcasting to voices of the Congo basin.', stops: [{ label: 'Nigeria', countries: ['NG'], description: 'Begin with Nigerian radio.' }, { label: 'Republic of Congo', countries: ['CG'], description: 'Cross into the Republic of Congo.' }, { label: 'DR Congo', countries: ['CD'], description: 'Continue with Democratic Republic of Congo broadcasting.' }] },
  { id: 'francophone-africa', name: 'Francophone Africa', description: 'Follow French-language broadcasting across West and Central Africa.', stops: ['SN','CI','CM','CG','CD'].map(code => ({ label: code, countries: [code], languages: ['French'], description: 'Listen to a French-language signal from this country.' })) },
  { id: 'caribbean-nights', name: 'Caribbean Nights', description: 'Island voices and music around the Caribbean.', stops: ['JM','TT','BB','HT'].map(code => ({ label: code, countries: [code], description: 'Explore a Caribbean broadcaster.' })) },
  { id: 'world-news-tour', name: 'World News Tour', description: 'Compare news formats across continents.', stops: ['NG','FR','JP','GB','US'].map(code => ({ label: code, countries: [code], genres: ['news'], description: 'Hear how a broadcaster covers the news.' })) },
  { id: 'african-gospel-morning', name: 'African Gospel Morning', description: 'Gospel broadcasting from West to Southern Africa.', stops: ['NG','GH','KE','ZA'].map(code => ({ label: code, countries: [code], genres: ['gospel'], description: 'Explore a gospel-tagged broadcaster.' })) },
  { id: 'jazz-across-continents', name: 'Jazz Across Continents', description: 'Follow jazz formats through international radio.', stops: ['FR','JP','US','ZA'].map(code => ({ label: code, countries: [code], genres: ['jazz'], description: 'Listen to a jazz-tagged broadcaster.' })) },
];
export function resolveJourney(journey: AudioJourney, inventory: Station[], now = Date.now()) {
  const seen = new Set<string>();
  return journey.stops.flatMap((stop, index) => {
    const stations = inventory.filter(station => {
      const id = station.station_uuid || station.id;
      if (seen.has(id) || !station.is_active || station.sourceType === 'geoaudio' || !/^https?:\/\//i.test(station.url_resolved || station.url)) return false;
      if (!['Excellent','Stable'].includes(streamReliability(station, '', now).label)) return false;
      return (!stop.stationIds || stop.stationIds.includes(id)) && (!stop.countries || stop.countries.includes(station.country_code)) && (!stop.languages || stop.languages.some(language => station.language.toLowerCase().includes(language.toLowerCase()))) && (!stop.genres || stop.genres.some(genre => station.tags.some(tag => tag.toLowerCase().includes(genre.toLowerCase()))));
    }).sort((a,b) => b.health_score-a.health_score).slice(0, 3);
    if (!stations.length) return [];
    stations.forEach(station => seen.add(station.station_uuid || station.id));
    return [{ index, label: stop.label, description: stop.description, stations }];
  });
}
