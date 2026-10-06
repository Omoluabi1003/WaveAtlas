import assert from 'node:assert/strict';
import fs from 'node:fs';
import { answerAtlasQuestion } from '../lib/atlas-assistant';
import { answerAtlasIntelligently } from '../lib/atlas-intelligence';

const route = fs.readFileSync('app/api/atlas-assistant/route.ts', 'utf8');
assert.doesNotMatch(route, /OPENROUTER_API_KEY|Authorization:/);
assert.match(route, /must remain free to use/);
assert.match(route, /answerAtlasIntelligently/);

const natural = answerAtlasQuestion('Hey Atlas, could you play Afrobeats from Lagos?');
assert.equal(natural.action?.type, 'play');
if (natural.action?.type !== 'play') throw new Error('Expected natural play action');
assert.match(natural.action.query || '', /Afrobeats from Lagos/i);
const premier = answerAtlasQuestion('tune to Premier FM');
assert.equal(premier.action?.type, 'play');
if (premier.action?.type !== 'play') throw new Error('Expected Premier FM tune action');
assert.equal(premier.action.query, 'Premier FM 93.5 Ibadan');
const premierAsr = answerAtlasQuestion('tune in to Premiere FM');
assert.equal(premierAsr.action?.type, 'play');
if (premierAsr.action?.type !== 'play') throw new Error('Expected ASR-tolerant Premier FM action');
assert.equal(premierAsr.action.query, 'Premier FM 93.5 Ibadan');

const assistant = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');
const speechResolver = fs.readFileSync('app/api/atlas-speech/resolve/route.ts', 'utf8');
const vocabulary = fs.readFileSync('app/api/atlas-speech/vocabulary/route.ts', 'utf8');
assert.match(assistant, /recognition\.maxAlternatives = 8/);
assert.match(assistant, /startListening\(locale = 'en-NG'\)/);
assert.match(assistant, /SpeechRecognitionPhrase/);
assert.match(assistant, /resolveSpeech\(alternatives\)/);
assert.match(speechResolver, /fetchGlobalCandidateStations\(1800\)/);
assert.match(speechResolver, /function phonetic/);
assert.match(speechResolver, /editSimilarity\(phonetic\(target\), phonetic\(name\)\)/);
assert.match(speechResolver, /canonicalCommand/);
assert.match(speechResolver, /slice\(0, 8\)/);
assert.doesNotMatch(speechResolver, /fetchStations\(\{ q: target/);
assert.doesNotMatch(speechResolver, /API_KEY|Authorization:/);
assert.match(vocabulary, /fetchGlobalCandidateStations\(900\)/);

const station = { name: 'Signal FM', country: 'Nigeria', country_code: 'NG', city: 'Lagos', state: '', language: 'English', tags: ['afrobeats', 'music'], codec: 'MP3', bitrate: 128 };
const another = answerAtlasQuestion('another one', { station, history: [{ role: 'user', text: 'play Afrobeats from Lagos' }, { role: 'atlas', text: 'Tuning in.' }] });
assert.equal(another.action?.type, 'play');
const mood = answerAtlasIntelligently('I am in the mood for calm gospel from Nigeria', { station });
assert.equal(mood.action?.type, 'play');
const pidgin = answerAtlasIntelligently('Atlas abeg, find jazz for me', { station });
assert.match(pidgin.answer, /Make I|Oya|dey|don/i);

console.log('Atlas fresh intelligence: free keyless Nigerian-English ASR, live vocabulary, broad-catalog phonetic resolution and action parsing passed.');
