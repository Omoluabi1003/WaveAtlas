import assert from 'node:assert/strict';
import fs from 'node:fs';

const assistant = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');
const voice = fs.readFileSync('lib/atlas-omoluabi-voice.ts', 'utf8');
const pocket = fs.readFileSync('lib/atlas-pocket-client.ts', 'utf8');
const vendor = fs.readFileSync('app/api/atlas-voice/vendor/[file]/route.ts', 'utf8');
const reference = fs.readFileSync('app/api/atlas-voice-reference/route.ts', 'utf8');

assert.match(reference, /Omoluabi%20voice\.mp3/);
assert.match(reference, /99121f3012e9e606ed02c23db42fda5844344bb9/);
assert.match(voice, /OmoluabiPaulVoice/);
assert.match(voice, /fetch\('\/api\/atlas-voice-reference'/);
assert.match(voice, /cloneVoice\(channel, decoded\.sampleRate\)/);
assert.match(voice, /playChunk\(audio/);
assert.match(pocket, /voiceCloning: true/);
assert.match(pocket, /https:\/\/huggingface\.co\/vlapky\/pocket-tts-onnx/);
assert.match(pocket, /cache: true/);
assert.match(vendor, /raw\.githubusercontent\.com\/vlapky\/pocket-tts-js/);
assert.match(assistant, /Omoluabi Paul · local & keyless/);
assert.match(assistant, /First use downloads the free local voice model once/);
assert.doesNotMatch(assistant + voice + pocket + vendor, /OPENAI|ELEVENLABS|OPENROUTER|API_KEY|Authorization:/i);
assert.doesNotMatch(assistant, /speechSynthesis/, 'Generic browser TTS must not be labeled as Omoluabi Paul');

console.log('Atlas personal voice fresh: canonical recording, client-side Pocket TTS, same-origin worker, browser cache and zero API-key dependency passed.');
