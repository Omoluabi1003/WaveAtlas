import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runAtlasCommandBrain } from '../lib/atlas-command-brain';

const source = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');
assert.match(source, /push to talk voice command\|push to talk\|microphone blocked/i);
assert.match(source, /RADIO_FOCUS = \{ opening: 0\.05, listening: 0\.02, thinking: 0\.04, speaking: 0\.015 \}/);
assert.match(source, /ASSISTANT_TIMEOUT_MS = 8000/);
assert.match(source, /context: \{ station, history \}/);
assert.match(source, /collectSpeechCandidates/);
assert.match(source, /resolveAtlasSpeech/);
assert.match(source, /await sleep\(450\); listen\(\)/, 'Conversation must return to a fresh recognition turn after Web Audio speech');
assert.match(source, /AtlasSignal state=\{signalState\}/);
assert.match(source, /setSignalEnergy/);
assert.match(source, /voiceRef\.current\?\.stop/);
assert.doesNotMatch(source, /conversationModeRef|waitForNeuralVoice|primeSystemSpeech/);

const premier = runAtlasCommandBrain('tune to Premier FM');
assert.equal(premier.action?.type, 'play');
if (premier.action?.type !== 'play') throw new Error('Expected play action');
assert.equal(premier.action.query, 'Premier FM');

const natural = runAtlasCommandBrain('Atlas, can you play jazz in Lagos?');
assert.equal(natural.action?.type, 'play');
if (natural.action?.type !== 'play') throw new Error('Expected natural play action');
assert.match(natural.action.query || '', /jazz in Lagos/i);

const station = { name: 'Test FM', country: 'Nigeria', country_code: 'NG', city: 'Lagos', state: '', language: 'English', tags: ['jazz', 'music'], codec: 'MP3', bitrate: 128 };
const followUp = runAtlasCommandBrain('another one', { station, history: [{ role: 'user', text: 'Play jazz in Lagos' }, { role: 'atlas', text: 'Tuning in.' }] });
assert.equal(followUp.action?.type, 'play');
if (followUp.action?.type !== 'play') throw new Error('Expected contextual follow-up');
assert.equal(followUp.action.excludeCurrent, true);

console.log('Atlas fresh Signal: bounded requests, one-turn recognition, directory resolution, Omoluabi Web Audio and contextual command flow passed.');
