export type AtlasMusicSearch = { genres: string[]; match: 'all' | 'any'; location?: string; reference?: string };

const genreAliases: Record<string, string[]> = {
  jazz: ['jazz'], blues: ['blues'], 'smooth jazz': ['smooth jazz'],
  afrobeats: ['afrobeats', 'afro beats'], afrobeat: ['afrobeat'],
  amapiano: ['amapiano'], highlife: ['highlife', 'high life'], hiplife: ['hiplife'],
  fuji: ['fuji'], juju: ['juju'], apala: ['apala'], gospel: ['gospel'], worship: ['worship'],
  reggae: ['reggae'], dancehall: ['dancehall', 'dance hall'],
  'hip hop': ['hip hop', 'hiphop', 'rap'], 'rnb': ['r and b', 'rnb', 'rhythm and blues'],
  soul: ['soul'], funk: ['funk'], pop: ['pop'], rock: ['rock'],
  classical: ['classical'], country: ['country music', 'country'],
  electronic: ['electronic', 'electronica', 'edm'], house: ['house music', 'house'], techno: ['techno'],
  disco: ['disco'], 'k pop': ['k pop', 'kpop'], 'j pop': ['j pop', 'jpop'],
  rumba: ['rumba'], soukous: ['soukous'], makossa: ['makossa'], ndombolo: ['ndombolo'],
  'bongo flava': ['bongo flava'], kizomba: ['kizomba'], samba: ['samba'], 'bossa nova': ['bossa nova'],
};
export const normalizeMusicText = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export function musicGenresInText(value: string) {
  const text = ` ${normalizeMusicText(value)} `;
  const hits: Array<{ genre: string; start: number; end: number }> = [];
  for (const [genre, aliases] of Object.entries(genreAliases)) {
    for (const alias of aliases) {
      let from = 0, start: number;
      while ((start = text.indexOf(` ${alias} `, from)) !== -1) {
        hits.push({ genre, start, end: start + alias.length + 2 }); from = start + 1;
      }
    }
  }
  // Prefer "rhythm and blues" / "smooth jazz" over their contained genre words.
  return [...new Set(hits.filter(hit => !hits.some(other => other !== hit && other.start <= hit.start && other.end >= hit.end && other.end - other.start > hit.end - hit.start)).sort((a, b) => a.start - b.start).map(hit => hit.genre))];
}

export function stationMatchesMusicGenres(tags: string[] | string | undefined, music: AtlasMusicSearch) {
  const found = new Set(musicGenresInText(Array.isArray(tags) ? tags.join(' ; ') : tags || ''));
  // A specific subgenre also satisfies a request for its parent genre.
  if (found.has('smooth jazz')) found.add('jazz');
  const check = (genre: string) => found.has(genre);
  return music.genres.length > 0 && (music.match === 'any' ? music.genres.some(check) : music.genres.every(check));
}

// A small, explicit reference vocabulary, rather than claiming to identify the
// current song from the live audio. Unknown references ask for a genre/artist.
const artists: Array<{ names: string[]; genre: string }> = [
  { names: ['Fela Kuti', 'Fela', 'Femi Kuti', 'Seun Kuti'], genre: 'afrobeat' },
  { names: ['Burna Boy', 'Wizkid', 'Davido', 'Rema', 'Tems', 'Ayra Starr', 'Asake'], genre: 'afrobeats' },
  { names: ['Miles Davis', 'John Coltrane', 'Louis Armstrong', 'Ella Fitzgerald', 'Nina Simone'], genre: 'jazz' },
  { names: ['B B King', 'BB King', 'Muddy Waters', 'Howlin Wolf'], genre: 'blues' },
  { names: ['Bob Marley', 'Peter Tosh'], genre: 'reggae' },
  { names: ['Sade', 'Aretha Franklin'], genre: 'soul' },
  { names: ['James Brown', 'Parliament Funkadelic'], genre: 'funk' },
  { names: ['Michael Jackson', 'Taylor Swift'], genre: 'pop' },
  { names: ['BTS', 'Blackpink'], genre: 'k pop' },
  { names: ['Duke Ellington'], genre: 'jazz' },
  { names: ['King Sunny Ade'], genre: 'juju' },
  { names: ['Koffi Olomide', 'Franco Luambo'], genre: 'rumba' },
];
const songs = [
  { title: 'Calm Down', artist: 'Rema', genre: 'afrobeats' },
  { title: 'Essence', artist: 'Wizkid', genre: 'afrobeats' },
  { title: 'Last Last', artist: 'Burna Boy', genre: 'afrobeats' },
  { title: 'Zombie', artist: 'Fela Kuti', genre: 'afrobeat' },
  { title: 'So What', artist: 'Miles Davis', genre: 'jazz' },
  { title: 'The Thrill Is Gone', artist: 'B B King', genre: 'blues' },
  { title: 'Three Little Birds', artist: 'Bob Marley', genre: 'reggae' },
];
export type AtlasMusicIntent = { music: AtlasMusicSearch; action: 'play' | 'search' | 'explain'; subject?: string };
export function resolveAtlasMusicIntent(question: string, previous?: string): AtlasMusicIntent | null {
  const q = question.trim().replace(/^(?:hey\s+)?atlas[,:]?\s*/i, '').trim();
  if (/\b(?:pause|stop|mute|volume|settings|map|globe|brief|teleport)\b/i.test(q) || /\b(?:what|which|same) country\b/i.test(q)) return null;
  if (/\b(?:station (?:named|called)|(?:fm|am)\b)/i.test(q) && !/\b(?:genre|style)\b/i.test(q)) return null;
  if (/^(?:another(?: one)?|same (?:genre|vibe)|more like that|something similar)$/i.test(q) && previous) {
    const prior = resolveAtlasMusicIntent(previous);
    return prior ? { ...prior, action: 'play' } : null;
  }
  const action = /\b(?:what|which)\b.*\b(?:genre|style)\b|\b(?:genre|style) (?:of|is)\b/i.test(q) ? 'explain'
    : /^(?:please\s+)?(?:find|search|show me)\b/i.test(q.replace(/^(?:can|could|would) you\s+/i, '')) ? 'search' : 'play';
  let locationMatch = q.match(/\b(?:in|from|around)\s+(.+?)[?.!]*$/i);
  if (locationMatch && artists.some(item => item.names.some(name => normalizeMusicText(name) === normalizeMusicText(locationMatch![1])))) locationMatch = null;
  const location = locationMatch?.[1]?.trim();
  const content = locationMatch ? q.slice(0, locationMatch.index) : q;
  const normalized = ` ${normalizeMusicText(content)} `;
  const genres = musicGenresInText(content);
  if (genres.length && (/\b(?:play|listen|search|find|genre|style|music|jazz|blues)\b/i.test(content) || normalizeMusicText(content) === genres.join(' '))) {
    return { music: { genres, match: /\b(?:or|either)\b/i.test(content) ? 'any' : 'all', ...(location ? { location } : {}) }, action };
  }
  const musicCue = /\b(?:play|listen|song|track|music|artist|genre|like|similar)\b/i.test(content);
  const song = songs.find(item => normalized.includes(` ${normalizeMusicText(item.title)} `) && (/\b(?:song|track)\b/i.test(content) || normalized.includes(` ${normalizeMusicText(item.artist)} `) || /["“]/.test(content) || (normalizeMusicText(item.title).split(' ').length > 1 && normalizeMusicText(content.replace(/^(?:play|listen to)\s+/i, '')) === normalizeMusicText(item.title))));
  const artist = artists.find(item => item.names.some(name => normalized.includes(` ${normalizeMusicText(name)} `)));
  if ((song || artist) && (musicCue || artist?.names.some(name => normalizeMusicText(name) === normalizeMusicText(content)))) {
    const genre = song?.genre || artist!.genre;
    const reference = song ? `${song.title} by ${song.artist}` : artist!.names.find(name => normalized.includes(` ${normalizeMusicText(name)} `))!;
    return { music: { genres: [genre], match: 'all', ...(location ? { location } : {}), reference }, action, subject: reference };
  }
  return null;
}
