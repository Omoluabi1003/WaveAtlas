import type { Station } from './stations';

export const genreCountryMap: Record<string, string[]> = {
  afrobeat: ['NG', 'GH', 'BJ', 'TG', 'CI'],
  afrobeats: ['NG', 'GH', 'BJ', 'TG', 'CI'],
  amapiano: ['ZA', 'BW', 'ZW', 'NA', 'MZ'],
  hiplife: ['GH', 'NG', 'SL', 'LR'],
  highlife: ['GH', 'NG', 'SL'],
  fuji: ['NG'],
  juju: ['NG'],
  apala: ['NG'],
  rumba: ['CD', 'CG', 'AO'],
  soukous: ['CD', 'CG', 'AO', 'CM'],
  makossa: ['CM', 'GA', 'CG'],
  ndombolo: ['CD', 'CG'],
  'bongo flava': ['TZ', 'KE', 'UG'],
  kizomba: ['AO', 'CV', 'PT'],
  semba: ['AO'],
  reggae: ['JM', 'TT', 'BB', 'GY'],
  dancehall: ['JM', 'TT', 'BB'],
  samba: ['BR'],
  'bossa nova': ['BR'],
  rai: ['DZ', 'MA', 'TN'],
  gnawa: ['MA', 'DZ'],
  'k-pop': ['KR', 'JP', 'TW'],
  'j-pop': ['JP'],
  gospel: ['NG', 'GH', 'CD', 'ZA', 'US', 'BR', 'PH'],
  worship: ['NG', 'GH', 'CD', 'ZA', 'US', 'BR', 'PH'],
  jazz: ['US', 'FR', 'JP', 'GB'],
  blues: ['US'],
  country: ['US', 'CA', 'AU'],
  arabic: ['EG', 'SA', 'AE', 'MA', 'DZ', 'TN'],
  bollywood: ['IN'],
  bhangra: ['IN', 'PK', 'GB'],
};

export function inferGenreCountries(rawQuery = ''): string[] {
  const q = rawQuery.toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!q) return [];
  const matches = Object.entries(genreCountryMap)
    .filter(([genre]) => new RegExp(`(^|\\b)${genre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\b|$)`, 'i').test(q))
    .flatMap(([, codes]) => codes);
  return [...new Set(matches)];
}

export function culturalAtlasScore(station: Station, rawQuery = '') {
  const countries = inferGenreCountries(rawQuery);
  if (!countries.length) return 0;
  const index = countries.indexOf(station.country_code);
  return index === -1 ? 0 : 5200 - index * 350;
}

export function rankByCulturalAtlas(stations: Station[], rawQuery = '') {
  const countries = inferGenreCountries(rawQuery);
  if (!countries.length) return stations;
  return [...stations].sort((a, b) => culturalAtlasScore(b, rawQuery) - culturalAtlasScore(a, rawQuery));
}
