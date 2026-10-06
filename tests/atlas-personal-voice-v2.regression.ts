import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const worker = fs.readFileSync(path.join(root, 'public/atlas-v2-voice-worker.mjs'), 'utf8');
const assistant = fs.readFileSync(path.join(root, 'components/AtlasAssistant.tsx'), 'utf8');
const referenceRoute = fs.readFileSync(path.join(root, 'app/api/atlas-voice-reference/route.ts'), 'utf8');

// Fresh production path. Legacy labs/workers may remain in the tree for history,
// but the active assistant must not import or invoke them.
assert.match(worker, /clone-voice@0\.2\.1\/dist\/index\.mjs/);
assert.doesNotMatch(worker, /clone-voice@0\.2\.2/);
assert.doesNotMatch(worker, /pocket-tts-js/);
assert.match(worker, /clone\('\/api\/atlas-voice-reference'/);
assert.match(worker, /activeVoice\.speak\(text\.trim\(\)\)/);
assert.match(worker, /engine: 'clone-voice-0\.2\.1'/);
assert.doesNotMatch(worker, /OPENAI|ELEVENLABS|OPENROUTER|Authorization:/i);
assert.match(referenceRoute, /Omoluabi%20voice\.mp3/);
assert.match(referenceRoute, /99121f3012e9e606ed02c23db42fda5844344bb9/);
assert.match(assistant, /atlas-v2-voice-worker\.mjs/);
assert.match(assistant, /OMOLUABI PAUL · READY/);
assert.match(assistant, /DEVICE VOICE · FALLBACK/);
assert.doesNotMatch(assistant, /atlas-neural-voice-worker/);
assert.doesNotMatch(assistant, /atlas-pocket-voice-worker/);

console.log('Atlas personal voice fresh: canonical reference, published 0.2.1 keyless engine, same-origin worker and honest fallback passed.');
