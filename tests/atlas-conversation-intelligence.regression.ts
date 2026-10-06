import assert from 'node:assert/strict';
import fs from 'node:fs';
import { answerAtlasQuestion } from '../lib/atlas-assistant';
import { answerAtlasIntelligently } from '../lib/atlas-intelligence';
import { chooseAtlasSpeechAlternative, normalizeAtlasSpeechTranscript } from '../lib/voice-command-engine';

const route = fs.readFileSync('app/api/atlas-assistant/route.ts', 'utf8');
assert.doesNotMatch(route, /OPENROUTER_API_KEY/);
assert.doesNotMatch(route, /api\/v1\/chat\/completions/);
assert.doesNotMatch(route, /Authorization:/);
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

const bareStation = answerAtlasQuestion('Premier FM');
assert.equal(bareStation.action?.type, 'play');
if (bareStation.action?.type !== 'play') throw new Error('Expected bare station identity to tune');
assert.equal(bareStation.action.query, 'Premier FM 93.5 Ibadan');

assert.equal(normalizeAtlasSpeechTranscript('tune to premium eff em'), 'tune to Premier FM');
assert.equal(normalizeAtlasSpeechTranscript('play wasobia f m'), 'play Wazobia FM');
assert.equal(normalizeAtlasSpeechTranscript('hey wave at last play ajidigbo'), 'hey WaveAtlas play Agidigbo');
const nbest = chooseAtlasSpeechAlternative([
  { transcript: 'tune to premium eff em', confidence: 0.78 },
  { transcript: 'tune to premiere FM', confidence: 0.72 },
  { transcript: 'turn to premium', confidence: 0.8 },
]);
assert.equal(nbest.transcript, 'tune to Premier FM');

const voiceEngine = fs.readFileSync('lib/voice-command-engine.ts', 'utf8');
const speechResolver = fs.readFileSync('app/api/atlas-speech/resolve/route.ts', 'utf8');
assert.match(voiceEngine, /Math\.max\(5/);
assert.match(voiceEngine, /chooseAtlasSpeechAlternative/);
assert.match(voiceEngine, /RADIO_PRONUNCIATION_RULES/);
assert.match(voiceEngine, /resolveAgainstAtlasDirectory/);
assert.match(voiceEngine, /\/api\/atlas-speech\/resolve/);
assert.match(speechResolver, /fetchStations/);
assert.match(speechResolver, /editSimilarity/);
assert.match(speechResolver, /tokenScore/);
assert.match(speechResolver, /canonicalCommand/);
assert.match(speechResolver, /alternatives.*slice\(0, 5\)/s);
assert.doesNotMatch(speechResolver, /API_KEY|Authorization:/);

const station = { name: 'Signal FM', country: 'Nigeria', country_code: 'NG', city: 'Lagos', state: '', language: 'English', tags: ['afrobeats', 'music'], codec: 'MP3', bitrate: 128 };
const another = answerAtlasQuestion('another one', { station, history: [{ role: 'user', text: 'play Afrobeats from Lagos' }, { role: 'atlas', text: 'Tuning in.' }] });
assert.equal(another.action?.type, 'play');
if (another.action?.type !== 'play') throw new Error('Expected contextual follow-up play action');
assert.match(another.action.query || '', /Nigeria afrobeats/i);

const identify = answerAtlasQuestion('tell me about this signal', { station });
assert.match(identify.answer, /Signal FM.*Lagos, Nigeria.*English.*afrobeats/i);
const capabilities = answerAtlasQuestion('Atlas, what can you do?');
assert.match(capabilities.answer, /identify and explain.*find and play stations.*control playback/i);

const mood = answerAtlasIntelligently('I am in the mood for calm gospel from Nigeria', { station });
assert.equal(mood.action?.type, 'play');
if (mood.action?.type !== 'play') throw new Error('Expected conversational mood to become a play action');
assert.match(mood.action.query || '', /calm gospel from nigeria/i);

const keepThere = answerAtlasIntelligently('keep it there', { station, history: [{ role: 'user', text: 'take me to Lagos' }] });
assert.equal(keepThere.action?.type, 'play');
if (keepThere.action?.type !== 'play') throw new Error('Expected contextual place follow-up');
assert.match(keepThere.action.query || '', /Lagos/i);

const pidgin = answerAtlasIntelligently('Atlas abeg, find jazz for me', { station });
assert.match(pidgin.answer, /Make I|Oya|dey|don/i);
const guarded = answerAtlasIntelligently('Why did you pick this station?', { station });
assert.match(guarded.answer, /verified Atlas metadata|don’t have enough verified metadata/i);

console.log('Atlas conversation intelligence v5: free keyless dynamic station-directory pronunciation recovery, context, Pidgin and verified-data guardrails passed.');
