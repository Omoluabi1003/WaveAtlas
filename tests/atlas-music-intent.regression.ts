import assert from 'node:assert/strict';
import { answerAtlasIntelligently } from '../lib/atlas-intelligence';
import { musicGenresInText, resolveAtlasMusicIntent, stationMatchesMusicGenres } from '../lib/atlas-music-intent';
import { atlasStationSearchParams, findMusicStationCandidates } from '../lib/atlas-music-search';
import type { Station } from '../lib/stations';

async function main() {
  for (const question of ['Jazz Blues genre', 'Play jazz and blues', 'Search for Jazz Blues genre', 'Can you find jazz/blues music?']) {
    const answer = answerAtlasIntelligently(question);
    assert.ok(answer.action?.type === 'play' || answer.action?.type === 'search');
    assert.deepEqual(answer.action.music?.genres, ['jazz', 'blues']);
    assert.equal(answer.action.music?.match, 'all');
  }
  assert.equal(resolveAtlasMusicIntent('play jazz or blues')?.music.match, 'any');
  assert.deepEqual(musicGenresInText('R&B and smooth jazz'), ['rnb', 'smooth jazz']);
  assert.deepEqual(musicGenresInText('rhythm and blues'), ['rnb']);
  assert.equal(resolveAtlasMusicIntent('play Jazz FM'), null, 'Explicit station names retain the existing station path');
  assert.equal(resolveAtlasMusicIntent('open the map'), null);
  assert.equal(resolveAtlasMusicIntent('pause the music'), null);
  assert.equal(resolveAtlasMusicIntent('turn volume up'), null);
  assert.deepEqual(resolveAtlasMusicIntent('play music like Miles Davis in Lagos')?.music, { genres: ['jazz'], match: 'all', location: 'Lagos', reference: 'Miles Davis' });
  assert.equal(resolveAtlasMusicIntent('play music by Fela Kuti')?.music.genres[0], 'afrobeat');
  assert.equal(resolveAtlasMusicIntent('play music by Burna Boy')?.music.genres[0], 'afrobeats');
  const song = answerAtlasIntelligently('play the song Calm Down by Rema');
  assert.ok(song.action?.type === 'play'); assert.deepEqual(song.action.music?.genres, ['afrobeats']);
  assert.match(song.answer, /cannot guarantee a particular song/);
  assert.equal(resolveAtlasMusicIntent('play Calm Down')?.music.genres[0], 'afrobeats');
  assert.equal(resolveAtlasMusicIntent('play music from Miles Davis')?.music.genres[0], 'jazz');
  const unknown = answerAtlasIntelligently('play music by Unknown Example Artist');
  assert.equal(unknown.action, undefined); assert.match(unknown.answer, /reliable genre match/);
  const explain = answerAtlasIntelligently('What genre is The Thrill Is Gone by B.B. King?');
  assert.equal(explain.action, undefined); assert.match(explain.answer, /blues/);
  const followup = answerAtlasIntelligently('another one', { history: [{ role: 'user', text: 'play jazz and blues in Lagos' }] });
  assert.ok(followup.action?.type === 'play'); assert.equal(followup.action.excludeCurrent, true);
  assert.deepEqual(followup.action.music?.genres, ['jazz', 'blues']);
  assert.equal(followup.action.music?.location, 'Lagos');
  const request = resolveAtlasMusicIntent('Jazz Blues genre')!.music;
  const station = (id: string, name: string, tags: string[]) => ({ id, station_uuid: id, name, tags }) as Station;
  const nameOnly = station('name-only', 'Blues FM', ['pop']);
  const jazzOnly = station('jazz-only', 'Jazz Radio', ['jazz']);
  const mixed = station('mixed', 'Night Signal', ['jazz', 'blues']);
  const composite = station('composite', 'Another Signal', ['jazz / blues']);
  assert.equal(stationMatchesMusicGenres(nameOnly.tags, request), false);
  assert.equal(stationMatchesMusicGenres(jazzOnly.tags, request), false);
  assert.equal(stationMatchesMusicGenres(mixed.tags, request), true);
  assert.equal(stationMatchesMusicGenres(['smooth jazz', 'blues'], request), true);
  assert.equal(stationMatchesMusicGenres([], request), false);
  const seen: string[] = [];
  const matches = await findMusicStationCandidates(request, async genre => {
    seen.push(genre); return [nameOnly, jazzOnly, mixed, composite];
  });
  assert.deepEqual(seen.sort(), ['blues', 'jazz']);
  assert.deepEqual(matches.map(item => item.id), ['mixed', 'composite']);
  const params = atlasStationSearchParams('jazz blues Lagos', { ...request, location: 'Lagos' });
  assert.equal(params.get('genres'), 'jazz,blues'); assert.equal(params.get('location'), 'Lagos');
  assert.equal(params.get('genreMatch'), 'all');
  const exact = atlasStationSearchParams('Premier FM'); assert.equal(exact.has('genres'), false);
  console.log('Music intent: compound genres, metadata-only matching, aliases, location, artist/song references, explain, follow-up and unchanged station controls passed.');
}
void main();
