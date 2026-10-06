import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/AtlasAssistant.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../public/atlas-neural-voice-worker.mjs', import.meta.url), 'utf8');

// Regression: optional chaining made `undefined !== "closed"` true, so the old
// implementation returned null before ever constructing its first AudioContext.
assert.match(source, /voiceContextRef\.current && voiceContextRef\.current\.state !== 'closed'/);
assert.doesNotMatch(source, /voiceContextRef\.current\?\.state !== 'closed'/);

// iOS/WebKit still needs system speech synchronously primed as the guaranteed
// fallback before any async neural voice work begins.
const activateStart = source.indexOf('function activateAtlas()');
const activateEnd = source.indexOf('activateRef.current = activateAtlas;');
const activate = source.slice(activateStart, activateEnd);
assert.ok(activate.indexOf('primeSystemSpeech();') >= 0, 'Atlas activation must prime speech synthesis');
assert.ok(activate.indexOf('primeSystemSpeech();') < activate.indexOf('void primeVoiceOutput();'), 'speech synthesis must be primed before async Web Audio work');
assert.ok(activate.indexOf('primeSystemSpeech();') < activate.indexOf('warmNeuralVoice();'), 'speech synthesis must be primed before worker startup');

// Voice Engine v3 may attempt the smaller enrolled Pocket TTS clone on iOS,
// but system speech must remain the fallback if neural startup or synthesis fails.
assert.match(source, /if \(await waitForNeuralVoice\(\)\) spoken = await speakNeural\(text\); if \(!spoken\) spoken = await speakSystem\(text\);/);
assert.doesNotMatch(source, /if \(typeof window === 'undefined' \|\| isIOSFamily\(\)/);
assert.match(worker, /pocket-tts-js@0\.1\.0/);
assert.match(worker, /maxThreads: 2/);
assert.match(worker, /Omoluabi Paul is not enrolled on this device/);

// Avoid Safari's null/default-voice edge case by guaranteeing a concrete iOS
// fallback whenever the browser exposes at least one voice.
assert.match(source, /\?\? voices\.find\(\(voice\) => voice\.lang\.toLowerCase\(\)\.startsWith\('en'\)\)\s*\?\? voices\[0\]/);

console.log('Atlas voice runtime: AudioContext creation, iOS gesture unlock, Omoluabi Paul neural attempt and system fallback passed.');
