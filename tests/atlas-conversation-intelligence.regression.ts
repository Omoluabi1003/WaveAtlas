import assert from 'node:assert/strict';
import { answerAtlasQuestion } from '../lib/atlas-assistant';
import { answerAtlasIntelligently } from '../lib/atlas-intelligence';

const natural = answerAtlasQuestion('Hey Atlas, could you play Afrobeats from Lagos?');
assert.equal(natural.action?.type, 'play');
if (natural.action?.type !== 'play') throw new Error('Expected natural play action');
assert.match(natural.action.query || '', /Afrobeats from Lagos/i);

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

console.log('Atlas conversation intelligence: commands, contextual follow-ups, mood, Pidgin and verified-data guardrails passed.');
