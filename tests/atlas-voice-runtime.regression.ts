import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/AtlasAssistant.tsx', import.meta.url), 'utf8');

// Regression: optional chaining made `undefined !== "closed"` true, so the old
// implementation returned null before ever constructing its first AudioContext.
assert.match(source, /voiceContextRef\.current && voiceContextRef\.current\.state !== 'closed'/);
assert.doesNotMatch(source, /voiceContextRef\.current\?\.state !== 'closed'/);

// iOS/WebKit only removes its speech-start restriction when speak() is invoked
// synchronously during a trusted user gesture. Atlas must prime system speech
// before any async voice work begins.
const activate = source.slice(source.indexOf('function activateAtlas()'), source.indexOf('const voiceActive'));
assert.ok(activate.indexOf('primeSystemSpeech();') >= 0, 'Atlas activation must prime speech synthesis');
assert.ok(activate.indexOf('primeSystemSpeech();') < activate.indexOf('void primeVoiceOutput();'), 'speech synthesis must be primed before async Web Audio work');
assert.ok(activate.indexOf('primeSystemSpeech();') < activate.indexOf('warmNeuralVoice();'), 'speech synthesis must be primed before worker startup');

// Kokoro WASM is not a dependable iPhone path. iOS must remain on the already
// gesture-unlocked system speech route. Voice profiles may add other reasons to
// use system speech, but must never remove the iOS guard.
assert.match(source, /if \(isIOSFamily\(\)(?:\s*\|\|[^)]*)?\)\s*(?:\{\s*)?spoken = await speakSystem\(text\);/);
assert.match(source, /if \(typeof window === 'undefined' \|\| isIOSFamily\(\)(?:\s*\|\|[^)]*)?\) \{\s*setNeuralState\('unavailable'\)/);

// Avoid Safari's null/default-voice edge case by guaranteeing a concrete iOS
// fallback whenever the browser exposes at least one voice.
assert.match(source, /\?\? voices\.find\(\(voice\) => voice\.lang\.toLowerCase\(\)\.startsWith\('en'\)\)\s*\?\? voices\[0\]/);

console.log('Atlas voice runtime: AudioContext creation, iOS gesture unlock, system fallback and neural gating passed.');
