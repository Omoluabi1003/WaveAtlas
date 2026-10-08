import type { Station } from './stations';
import { stationMatchesMusicGenres, type AtlasMusicSearch } from './atlas-music-intent';

export function atlasStationSearchParams(query: string, music?: AtlasMusicSearch) {
  const params = new URLSearchParams({ q: query, limit: '20' });
  if (music) {
    params.set('genres', music.genres.join(',')); params.set('genreMatch', music.match);
    if (music.location) params.set('location', music.location);
  }
  return params;
}

export async function findMusicStationCandidates(music: AtlasMusicSearch, fetchGenre: (genre: string) => Promise<Station[]>) {
  const groups = await Promise.all(music.genres.map(fetchGenre));
  const seen = new Set<string>();
  return groups.flat().filter(station => {
    const key = station.station_uuid || station.id;
    if (!key || seen.has(key) || !stationMatchesMusicGenres(station.tags, music)) return false;
    seen.add(key); return true;
  });
}
