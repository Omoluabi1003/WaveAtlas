import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATLAS_VOICES, getAtlasVoice } from '../lib/atlas-voices';

const assistant = readFileSync('components/AtlasAssistant.tsx', 'utf8');
const worker = readFileSync('public/atlas-neural-voice-worker.mjs', 'utf8');

// PR #328 deliberately rolled the production assistant back to the stable
// pre-gallery runtime after the gallery froze production. Keep the profile
// definitions available for future qualification work, but do not require the
// retired gallery UI or multi-voice worker to be active in production.
assert.ok(ATLAS_VOICES.length >= 7, 'Atlas should retain the dormant voice profile catalog');
assert.equal(getAtlasVoice('omoluabi-paul').name, 'Omoluabi Paul');
assert.equal(getAtlasVoice('omoluabi-paul').locale, 'en-NG');
assert.equal(getAtlasVoice('omoluabi-paul').nigerian, true);
assert.match(getAtlasVoice('omoluabi-paul').preview, /how far|dey|wan|make we/i, 'Omoluabi Paul profile should retain Nigerian Pidgin preview copy');

assert.doesNotMatch(assistant, /Choose an Atlas voice/, 'The unsafe #327 gallery must stay out of the stable Atlas runtime until requalified');
assert.doesNotMatch(assistant, /ATLAS_VOICE_STORAGE_KEY/, 'The rolled-back gallery persistence path must not silently reactivate');
assert.doesNotMatch(worker, /selectedVoice/, 'The stable neural worker must not silently reactivate #327 multi-voice routing');

console.log('Atlas dormant voice gallery safety checks passed.');
