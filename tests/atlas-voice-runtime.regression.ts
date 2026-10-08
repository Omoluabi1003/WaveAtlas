import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/AtlasAssistant.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../public/atlas-neural-voice-worker.mjs', import.meta.url), 'utf8');

// Regression: optional chaining made `undefined !== "closed"` true, so the old
// implementation returned null before ever constructing its first AudioContext.
assert.match(source, /voiceContextRef\.current && voiceContextRef\.current\.state !== 'closed'/);
assert.doesNotMatch(source, /voiceContextRef\.current\?\.state !== 'closed'/);

// Atlas must unlock Web Audio from the gesture and speak only the repository voice.
assert.match(source, /void primeVoiceOutput\(\);/);
assert.match(source, /const spoken = await speakNeural\(text, Boolean\(statusLabel\)\)/);
assert.doesNotMatch(source, /decodeAudioData|waitForNeuralVoice/);
assert.doesNotMatch(source, /new SpeechSynthesisUtterance|speakSystem|bestSystemVoice/);
assert.doesNotMatch(source, /if \(typeof window === 'undefined' \|\| isIOSFamily\(\)/);
assert.match(worker, /vendor\/pocket-tts-js\/index\.js/);
assert.match(worker, /maxThreads: 2/);
assert.match(worker, /loadCanonicalReference/);
assert.match(worker, /repository-canonical/);
// Production cloning must always use the authorized repository recording.
assert.match(worker, /const reference = await loadCanonicalReference\(\);/);
assert.doesNotMatch(worker, /loadSavedReference|browser-enrollment/);
assert.match(worker, /voiceCloning: !profile/);
assert.match(worker, /encoderQuantized: false/);
assert.match(worker, /cache: true/);

console.log('Atlas voice runtime: Web Audio unlock, repository-only personal speech, persistent profile and direct PCM passed.');
