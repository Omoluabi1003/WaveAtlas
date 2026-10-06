import assert from 'node:assert/strict';
import fs from 'node:fs';
import { answerAtlasQuestion } from '../lib/atlas-assistant';

const source = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');
assert.match(source, /push to talk voice command\|push to talk\|microphone blocked/i, 'Existing WaveAtlas microphone must launch Atlas Voice');
assert.match(source, /RADIO_LEVEL = \{ listening: 0\.02, thinking: 0\.04, speaking: 0\.015 \}/, 'Voice mode must keep radio connected but nearly inaudible');
assert.match(source, /context: \{ station: stationContext\(station\), history \}/, 'Atlas must send station and conversation context');
assert.match(source, /window\.setTimeout\(\(\) => startListening\(\), 220\)/, 'Voice conversation must return to listening after an answer');
assert.match(source, /aria-label="Atlas Signal"/, 'Atlas must keep a dedicated voice surface');
assert.match(source, /if \(speaking\) \{ stopOutput\(\); setStatus\('Listening'\); \} startListening\(\);/, 'Pressing Signal while Atlas speaks must interrupt and listen');
assert.match(source, /resolveSpeech\(alternatives\)/, 'Raw ASR output must pass through Atlas station resolution');
assert.doesNotMatch(source, /profile\.systemOnly/, 'Legacy voice-gallery routing must stay retired');
assert.doesNotMatch(source, /atlas-neural-voice-worker/, 'Legacy neural worker must not be active in fresh runtime');

const naturalPlay = answerAtlasQuestion('Atlas, can you play jazz in Lagos?');
assert.equal(naturalPlay.action?.type, 'play');
if (naturalPlay.action?.type !== 'play') throw new Error('Expected natural play action');
assert.match(naturalPlay.action.query || '', /jazz in Lagos/i);
const tune = answerAtlasQuestion('tune to Premier FM');
assert.equal(tune.action?.type, 'play');
if (tune.action?.type !== 'play') throw new Error('Expected tune action');
assert.equal(tune.action.query, 'Premier FM 93.5 Ibadan');

console.log('Atlas fresh Signal: direct mic entry, radio focus, resolved speech, contextual action and continuous listening passed.');
