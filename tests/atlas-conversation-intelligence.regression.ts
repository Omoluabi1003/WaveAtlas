import assert from 'node:assert/strict';
import { answerAtlasQuestion } from '../lib/atlas-assistant';

const natural = answerAtlasQuestion('Hey Atlas, could you play Afrobeats from Lagos?');
assert.equal(natural.action?.type, 'play');
assert.match('query' in (natural.action || {}) ? natural.action.query || '' : '', /Afrobeats from Lagos/i);

const station = { name: 'Signal FM', country: 'Nigeria', country_code: 'NG', city: 'Lagos', state: '', language: 'English', tags: ['afrobeats', 'music'], codec: 'MP3', bitrate: 128 };
const another = answerAtlasQuestion('another one', { station, history: [{ role: 'user', text: 'play Afrobeats from Lagos' }, { role: 'atlas', text: 'Tuning in.' }] });
assert.equal(another.action?.type, 'play');
assert.match('query' in (another.action || {}) ? another.action.query || '' : '', /Nigeria afrobeats/i);

const identify = answerAtlasQuestion('tell me about this signal', { station });
assert.match(identify.answer, /Signal FM.*Lagos, Nigeria.*English.*afrobeats/i);

const capabilities = answerAtlasQuestion('Atlas, what can you do?');
assert.match(capabilities.answer, /identify and explain.*find and play stations.*control playback/i);

console.log('Atlas conversation intelligence: natural commands, station context, follow-ups and capabilities passed.');
