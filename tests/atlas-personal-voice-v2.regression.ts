import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lab = fs.readFileSync(path.join(root, 'public/atlas-voice-clone.html'), 'utf8');
const retired = fs.readFileSync(path.join(root, 'public/atlas-personal-voice-worker.mjs'), 'utf8');
const pocketWorker = fs.readFileSync(path.join(root, 'public/atlas-pocket-voice-worker.mjs'), 'utf8');
const productionWorker = fs.readFileSync(path.join(root, 'public/atlas-neural-voice-worker.mjs'), 'utf8');
const assistant = fs.readFileSync(path.join(root, 'components/AtlasAssistant.tsx'), 'utf8');
const referenceRoute = fs.readFileSync(path.join(root, 'app/api/atlas-voice-reference/route.ts'), 'utf8');

assert.match(lab, /Voice Engine 2\.0/);
assert.match(lab, /atlas-pocket-voice-worker\.mjs/);
assert.match(lab, /Dedicated worker only/);
assert.match(lab, /worker\.terminate\(\)/);
assert.match(lab, /LOAD_TIMEOUT/);
assert.match(lab, /GENERATE_TIMEOUT/);
assert.match(lab, /waveatlas-atlas-voice-v1/);
assert.match(lab, /omoluabi-paul/);
assert.match(lab, /saveReference\(pcm\)/);
assert.doesNotMatch(lab, /ChatterboxModel/);

assert.match(retired, /RETIRED/);
assert.doesNotMatch(retired, /from_pretrained/);
assert.doesNotMatch(retired, /chatterbox-ONNX/);

assert.match(pocketWorker, /clone-voice@0\.2\.2/);
assert.match(pocketWorker, /dedicated worker/i);
assert.match(productionWorker, /vendor\/pocket-tts-js\/index\.js/);
assert.match(productionWorker, /Omoluabi Paul/);
assert.match(productionWorker, /loadCanonicalReference/);
assert.match(productionWorker, /omoluabi-voice-reference\.wav/);
assert.doesNotMatch(productionWorker, /mpg123-decoder/);
assert.match(productionWorker, /repository-canonical/);
assert.match(productionWorker, /cloneVoice/);
assert.match(productionWorker, /cache: true/);
assert.match(productionWorker, /uses no WaveAtlas API key/);
assert.match(productionWorker, /type: 'loading', engine: 'pocket-tts-omoluabi-paul-warming'/);
assert.doesNotMatch(productionWorker, /type: 'ready', engine: 'pocket-tts-omoluabi-paul-warming'/);
assert.doesNotMatch(productionWorker, /OPENAI|ELEVENLABS|OPENROUTER|Authorization:/i);
assert.match(referenceRoute, /Omoluabi%20voice\.mp3/);
assert.match(referenceRoute, /99121f3012e9e606ed02c23db42fda5844344bb9/);
assert.match(assistant, /ATLAS VOICE · OMOLUABI PAUL/);
assert.match(assistant, /if \(await waitForNeuralVoice\(\)\) spoken = await speakNeural\(text\)/);
assert.doesNotMatch(assistant, /isIOSFamily\(\)\) \{ setNeuralState\('unavailable'/);

console.log('Atlas personal voice v5: canonical Omoluabi Paul reference, keyless client-side Pocket TTS, cached model and safe fallback checks passed.');
