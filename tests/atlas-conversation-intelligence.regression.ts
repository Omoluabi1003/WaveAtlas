import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runAtlasCommandBrain } from '../lib/atlas-command-brain';

const route = fs.readFileSync('app/api/atlas-assistant/route.ts', 'utf8');
const speech = fs.readFileSync('lib/atlas-speech-runtime.ts', 'utf8');
const resolver = fs.readFileSync('app/api/atlas-speech/resolve/route.ts', 'utf8');
assert.match(route, /runAtlasCommandBrain/);
assert.doesNotMatch(route + speech + resolver, /OPENROUTER_API_KEY|api\/v1\/chat\/completions|Authorization:/);
assert.match(speech, /slice\(0, 5\)/);
assert.match(speech, /\/api\/atlas-speech\/resolve/);
assert.match(resolver, /fetchStations/);
assert.match(resolver, /editSimilarity/);
assert.match(resolver, /tokenScore/);
assert.match(resolver, /canonicalCommand/);

const cases: Array<[string, string, string | undefined]> = [
  ['tune to Premier FM', 'play', 'Premier FM'],
  ['tune in to Premier FM', 'play', 'Premier FM'],
  ['listen to Wazobia FM', 'play', 'Wazobia FM'],
  ['put me on Agidigbo', 'play', 'Agidigbo'],
  ['can you play jazz in Lagos', 'play', 'jazz in Lagos'],
  ['I am in the mood for calm gospel from Nigeria', 'play', 'calm gospel from Nigeria'],
  ['stations in Ibadan', 'search', 'Ibadan'],
  ['open the map', 'switch_view', undefined],
  ['pause the radio', 'pause', undefined],
];
for (const [utterance, type, query] of cases) {
  const reply = runAtlasCommandBrain(utterance);
  assert.equal(reply.action?.type, type, utterance);
  if (query && reply.action && 'query' in reply.action) assert.equal(reply.action.query, query, utterance);
}

const station = { name: 'Signal FM', country: 'Nigeria', country_code: 'NG', city: 'Lagos', state: '', language: 'English', tags: ['afrobeats', 'music'], codec: 'MP3', bitrate: 128 };
const identify = runAtlasCommandBrain('what station is this', { station });
assert.match(identify.answer, /Signal FM.*Lagos, Nigeria.*English.*afrobeats/i);
const another = runAtlasCommandBrain('another one', { station, history: [{ role: 'user', text: 'play Afrobeats in Lagos' }] });
assert.equal(another.action?.type, 'play');
if (another.action?.type !== 'play') throw new Error('Expected another-station action');
assert.equal(another.action.excludeCurrent, true);
const pidgin = runAtlasCommandBrain('Atlas abeg, find me jazz', { station });
assert.equal(pidgin.action?.type, 'play');
assert.match(pidgin.answer, /Make I/i);

console.log('Atlas fresh command brain: free keyless intents, natural tune phrases, N-best directory resolver, context and Pidgin passed.');
