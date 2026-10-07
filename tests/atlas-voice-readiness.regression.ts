import assert from 'node:assert/strict';
import fs from 'node:fs';
import { waitForAtlasPersonalVoice, type AtlasVoiceReadiness } from '../lib/atlas-voice-readiness';

async function main() {
  let now = 0;
  let state: AtlasVoiceReadiness = 'loading';
  const ready = await waitForAtlasPersonalVoice({ state: () => state, active: () => true, now: () => now, wait: async ms => { now += ms; if (now >= 10000) state = 'ready'; } });
  assert.equal(ready, true, 'An uncached model that takes longer than 4.5 seconds must still use the personal voice');
  assert.ok(now >= 10000);
  now = 0;
  const timeout = await waitForAtlasPersonalVoice({ state: () => 'loading', active: () => true, now: () => now, timeoutMs: 1000, wait: async ms => { now += ms; } });
  assert.equal(timeout, false);
  let active = true;
  const cancelled = await waitForAtlasPersonalVoice({ state: () => 'loading', active: () => active, wait: async () => { active = false; } });
  assert.equal(cancelled, false);
  assert.equal(await waitForAtlasPersonalVoice({ state: () => 'unavailable', active: () => true, wait: async () => { throw new Error('Must not wait after load failure'); } }), false);
  const assistant = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');
  assert.doesNotMatch(assistant, /new SpeechSynthesisUtterance|speakSystem|bestSystemVoice/);
  assert.match(assistant, /message\.voiceSource !== 'repository-canonical'/);
  assert.match(assistant, /timer: window\.setTimeout\(fail, 120000\), deadline: window\.setTimeout\(fail, 240000\)/);
  const app = fs.readFileSync('components/WaveAtlasApp.tsx', 'utf8');
  const emptyEntry = app.slice(app.indexOf('const voiceSearchFromEmpty'), app.indexOf('const editorialPicksFromEmpty'));
  assert.match(emptyEntry, /waveatlas:open-atlas-voice/);
  assert.doesNotMatch(emptyEntry, /waveatlas:voice-search|buildWandererCandidateQueue/);
  console.log('Personal voice readiness: slow first load, timeout, interruption, failure, identity gating and unified entry passed.');
}
void main();
