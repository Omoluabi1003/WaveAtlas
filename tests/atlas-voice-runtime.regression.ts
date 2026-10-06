import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/AtlasAssistant.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../public/atlas-v2-voice-worker.mjs', import.meta.url), 'utf8');

assert.match(source, /new Worker\('\/atlas-v2-voice-worker\.mjs'/);
assert.match(source, /recognition\.lang = locale/);
assert.match(source, /startListening\(locale = 'en-NG'\)/);
assert.match(source, /recognition\.maxAlternatives = 8/);
assert.match(source, /SpeechRecognitionPhrase/);
assert.match(source, /\/api\/atlas-speech\/vocabulary/);
assert.match(source, /\/api\/atlas-speech\/resolve/);
assert.match(source, /OMOLUABI PAUL · READY/);
assert.match(source, /DEVICE VOICE · FALLBACK/);
assert.match(source, /Preparing Omoluabi Paul/);
assert.match(source, /window\.speechSynthesis\.speak/);
assert.match(source, /new Ctx\(\{ latencyHint: 'interactive' \}\)/);

// Fresh engine: pin the published package and run its normal inference engine
// inside our same-origin worker. Do not restore the nested cross-origin worker path.
assert.match(worker, /clone-voice@0\.2\.1\/dist\/index\.mjs/);
assert.doesNotMatch(worker, /clone-voice@0\.2\.2/);
assert.doesNotMatch(worker, /pocket-tts-js/);
assert.match(worker, /clone\('\/api\/atlas-voice-reference'/);
assert.match(worker, /activeVoice\.speak/);
assert.match(worker, /Omoluabi Paul/);

console.log('Atlas fresh voice runtime: Nigerian-English recognition, contextual vocabulary, same-origin worker and keyless Omoluabi clone path passed.');
