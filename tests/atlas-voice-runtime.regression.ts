import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const assistant = readFileSync('components/AtlasAssistant.tsx', 'utf8');
const voice = readFileSync('lib/atlas-omoluabi-voice.ts', 'utf8');
const pocket = readFileSync('lib/atlas-pocket-client.ts', 'utf8');
const vendor = readFileSync('app/api/atlas-voice/vendor/[file]/route.ts', 'utf8');

assert.match(assistant, /nativeSpeechRecognitionConstructor/);
assert.match(assistant, /recognition\.maxAlternatives = 5/);
assert.match(assistant, /new Recognition\(\)/, 'Atlas must create a fresh recognizer for each turn');
assert.match(assistant, /await voice\.speak\(text\)/);
assert.doesNotMatch(assistant, /speechSynthesis|bestSystemVoice|speakSystem/, 'Atlas must not masquerade a generic system voice as Omoluabi Paul');
assert.doesNotMatch(assistant, /atlas-neural-voice-worker\.mjs/, 'Fresh runtime must not use the old outer neural worker');

assert.match(pocket, /new Worker\('\/api\/atlas-voice\/vendor\/worker\.js'/);
assert.match(pocket, /voiceCloning: true/);
assert.match(pocket, /cacheName: 'waveatlas-omoluabi-pocket-tts-v2'/);
assert.match(pocket, /cloneVoice/);
assert.match(voice, /fetch\('\/api\/atlas-voice-reference'/);
assert.match(voice, /decodeAudioData/);
assert.match(voice, /state: 'ready'/);
assert.match(voice, /playChunk/);
assert.match(vendor, /7d7a27423b0845eb0425c81a8aa5ed3f3d973eef/);
assert.match(vendor, /worker\.js/);
assert.match(vendor, /tokenizer\.js/);
assert.match(vendor, /binary\.js/);
assert.doesNotMatch(vendor, /API_KEY|Authorization:/);

console.log('Atlas fresh voice runtime: one recognizer per turn, same-origin Pocket TTS worker, canonical Omoluabi clone and no fake system-voice identity passed.');
