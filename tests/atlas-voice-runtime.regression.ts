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

// Voice Engine v4 attempts the canonical Omoluabi Paul recording first on all
// capable devices, while system speech remains the guaranteed fallback.
assert.match(source, /if \(await waitForNeuralVoice\(\)\) spoken = await speakNeural\(text\);[\s\S]*if \(!spoken\) spoken = await speakSystem\(text\);/);
assert.doesNotMatch(source, /if \(typeof window === 'undefined' \|\| isIOSFamily\(\)/);
assert.match(worker, /pocket-tts-js@0\.1\.0/);
assert.match(worker, /maxThreads: 2/);
assert.match(worker, /CANONICAL_REFERENCE = '\/api\/atlas-voice-reference'/);
assert.match(worker, /repository-canonical/);
// Assert actual canonical-first behavior inside resolveReference, not comment text
// or the order in which helper functions happen to be declared.
const resolveStart = worker.indexOf('async function resolveReference()');
const resolveEnd = worker.indexOf('async function createEngine()', resolveStart);
const resolveReference = worker.slice(resolveStart, resolveEnd);
assert.ok(resolveStart >= 0 && resolveEnd > resolveStart, 'resolveReference must exist');
assert.match(resolveReference, /try \{ return await loadCanonicalReference\(\); \}/);
assert.match(resolveReference, /const saved = await loadSavedReference\(\);/);
assert.ok(resolveReference.indexOf('loadCanonicalReference()') < resolveReference.indexOf('loadSavedReference()'), 'canonical Omoluabi reference must be attempted before browser enrollment fallback');
assert.match(worker, /voiceCloning: true/);
assert.match(worker, /cache: true/);

// Avoid Safari's null/default-voice edge case by guaranteeing a concrete iOS
// fallback whenever the browser exposes at least one voice.
assert.match(source, /\?\? voices\.find\(\(voice\) => voice\.lang\.toLowerCase\(\)\.startsWith\('en'\)\)\s*\?\? voices\[0\]/);

console.log('Atlas voice runtime v4: AudioContext creation, iOS gesture unlock, canonical Omoluabi Paul clone attempt and system fallback passed.');
