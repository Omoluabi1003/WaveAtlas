import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATLAS_VOICES, getAtlasVoice } from '../lib/atlas-voices';

const assistant = readFileSync('components/AtlasAssistant.tsx', 'utf8');
const worker = readFileSync('public/atlas-neural-voice-worker.mjs', 'utf8');

assert.ok(ATLAS_VOICES.length >= 7, 'Atlas should expose a meaningful voice gallery');
assert.equal(getAtlasVoice('omoluabi-paul').name, 'Omoluabi Paul');
assert.equal(getAtlasVoice('omoluabi-paul').locale, 'en-NG');
assert.equal(getAtlasVoice('omoluabi-paul').nigerian, true);
assert.match(getAtlasVoice('omoluabi-paul').preview, /how far|dey|wan|make we/i, 'Omoluabi Paul preview should visibly support Nigerian Pidgin');
assert.match(assistant, /ATLAS_VOICE_STORAGE_KEY/, 'Voice choice should persist on-device');
assert.match(assistant, /Choose an Atlas voice/, 'Voice gallery should be reachable from Atlas UI');
assert.match(assistant, /Nigerian English · Pidgin/, 'Omoluabi Paul should be clearly identified as Nigerian');
assert.match(assistant, /recognition\.lang = getAtlasVoice\(selectedVoiceRef\.current\)\.nigerian \? 'en-NG'/, 'Omoluabi Paul should listen with Nigerian English locale');
assert.match(worker, /selectedVoice/, 'Neural worker should synthesize the selected gallery voice');
assert.match(worker, /af_bella/);
assert.match(worker, /am_michael/);

console.log('Atlas voice gallery regression checks passed.');
