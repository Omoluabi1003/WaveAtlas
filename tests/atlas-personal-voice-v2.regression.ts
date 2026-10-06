import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lab = fs.readFileSync(path.join(root, 'public/atlas-voice-clone.html'), 'utf8');
const retired = fs.readFileSync(path.join(root, 'public/atlas-personal-voice-worker.mjs'), 'utf8');
const pocketWorker = fs.readFileSync(path.join(root, 'public/atlas-pocket-voice-worker.mjs'), 'utf8');
const productionWorker = fs.readFileSync(path.join(root, 'public/atlas-neural-voice-worker.mjs'), 'utf8');
const assistant = fs.readFileSync(path.join(root, 'components/AtlasAssistant.tsx'), 'utf8');

assert.match(lab, /Voice Engine 2\.0/);
assert.match(lab, /atlas-pocket-voice-worker\.mjs/);
assert.match(lab, /Dedicated worker only/);
assert.match(lab, /worker\.terminate\(\)/);
assert.match(lab, /LOAD_TIMEOUT/);
assert.match(lab, /GENERATE_TIMEOUT/);
assert.match(lab, /if\(busy\|\|ready\)return/);
assert.match(lab, /waveatlas-atlas-voice-v1/);
assert.match(lab, /omoluabi-paul/);
assert.match(lab, /saveReference\(pcm\)/);
assert.doesNotMatch(lab, /ChatterboxModel/);
assert.doesNotMatch(lab, /setTimeout\(\(\)=>\{if\(enrolled\)speak\.disabled=false\},900\)/);

assert.match(retired, /RETIRED/);
assert.doesNotMatch(retired, /from_pretrained/);
assert.doesNotMatch(retired, /chatterbox-ONNX/);

assert.match(pocketWorker, /clone-voice@0\.2\.2/);
assert.match(pocketWorker, /dedicated worker/i);
assert.match(productionWorker, /pocket-tts-js@0\.1\.0/);
assert.match(productionWorker, /Omoluabi Paul/);
assert.match(productionWorker, /waveatlas-atlas-voice-v1/);
assert.match(productionWorker, /cloneVoice/);
assert.match(assistant, /ATLAS VOICE · OMOLUABI PAUL/);
assert.match(assistant, /if \(await waitForNeuralVoice\(\)\) spoken = await speakNeural\(text\)/);
assert.doesNotMatch(assistant, /isIOSFamily\(\)\) \{ setNeuralState\('unavailable'/);

console.log('Atlas personal voice v3 regression checks passed.');
