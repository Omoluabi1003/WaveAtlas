import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lab = fs.readFileSync(path.join(root, 'public/atlas-voice-clone.html'), 'utf8');
const retired = fs.readFileSync(path.join(root, 'public/atlas-personal-voice-worker.mjs'), 'utf8');
const pocketWorker = fs.readFileSync(path.join(root, 'public/atlas-pocket-voice-worker.mjs'), 'utf8');

assert.match(lab, /Voice Engine 2\.0/);
assert.match(lab, /atlas-pocket-voice-worker\.mjs/);
assert.match(lab, /Dedicated worker only/);
assert.match(lab, /worker\.terminate\(\)/);
assert.match(lab, /LOAD_TIMEOUT/);
assert.match(lab, /GENERATE_TIMEOUT/);
assert.match(lab, /if\(busy\|\|ready\)return/);
assert.doesNotMatch(lab, /ChatterboxModel/);
assert.doesNotMatch(lab, /setTimeout\(\(\)=>\{if\(enrolled\)speak\.disabled=false\},900\)/);

assert.match(retired, /RETIRED/);
assert.doesNotMatch(retired, /from_pretrained/);
assert.doesNotMatch(retired, /chatterbox-ONNX/);

assert.match(pocketWorker, /clone-voice@0\.2\.2/);
assert.match(pocketWorker, /dedicated worker/i);

console.log('Atlas personal voice v2 regression checks passed.');
