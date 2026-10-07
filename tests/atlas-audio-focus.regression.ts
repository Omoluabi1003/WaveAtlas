import assert from 'node:assert/strict';
import { AtlasAudioFocus, atlasInteractionState, type AtlasActivity } from '../lib/atlas-audio-focus';

const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
const originalPerformance = globalThis.performance;
let now = 0, next = 0;
const timers = new Map<number, { at: number; run: () => void }>();
globalThis.setTimeout = ((run: () => void, delay: number) => {
  const id = ++next; timers.set(id, { at: now + delay, run }); return id;
}) as unknown as typeof setTimeout;
globalThis.clearTimeout = ((id: number) => timers.delete(id)) as unknown as typeof clearTimeout;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
function advance(ms: number) {
  const end = now + ms;
  while (true) {
    const due = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    if (!due || due[1].at > end) break;
    now = due[1].at; timers.delete(due[0]); due[1].run();
  }
  now = end;
}
try {
  const idle: AtlasActivity = { conversation: false, capture: false, processing: false, speechPending: false, playback: false, queuedSpeech: false };
  assert.equal(atlasInteractionState(idle), 'ATLAS_IDLE');
  for (const barrier of Object.keys(idle)) {
    assert.notEqual(atlasInteractionState({ ...idle, [barrier]: true }), 'ATLAS_IDLE', barrier);
  }
  assert.equal(atlasInteractionState({ ...idle, playback: true }), 'ATLAS_SPEAKING');
  assert.equal(atlasInteractionState({ ...idle, processing: true }), 'ATLAS_PROCESSING');
  assert.equal(atlasInteractionState({ ...idle, conversation: true }), 'ATLAS_LISTENING');
  const audio = { volume: 0.37, muted: false };
  const focus = new AtlasAudioFocus(audio);
  focus.acquire(); assert.equal(audio.muted, true); assert.equal(audio.volume, 0);
  focus.setVolume(1); assert.equal(audio.volume, 0); assert.equal(audio.muted, true);
  advance(10000); assert.equal(audio.volume, 0); // Time alone cannot release focus.
  focus.release(); focus.release(); assert.equal(timers.size, 1);
  advance(349); assert.equal(audio.muted, true);
  focus.acquire(); advance(1000); assert.equal(audio.volume, 0);
  focus.release(); advance(350); assert.equal(audio.volume, 0);
  advance(352); assert.ok(audio.volume > 0 && audio.volume < 0.37);
  focus.acquire(); assert.equal(audio.volume, 0); assert.equal(audio.muted, true);
  advance(1000); assert.equal(audio.volume, 0);
  focus.release(); advance(1100); assert.equal(audio.volume, 0.37); assert.equal(audio.muted, false);
  const muted = { volume: 0.2, muted: true };
  const mutedFocus = new AtlasAudioFocus(muted); mutedFocus.acquire(); mutedFocus.release(); advance(1100);
  assert.equal(muted.muted, true); assert.equal(muted.volume, 0.2);
  const paused = { volume: 0.6, muted: false, paused: true };
  const pausedFocus = new AtlasAudioFocus(paused); pausedFocus.acquire(); pausedFocus.release(); advance(1100);
  assert.equal(paused.paused, true); assert.equal(paused.volume, 0.6);
  focus.acquire(); focus.setVolume(0.25, true); assert.equal(audio.volume, 0);
  focus.release(); advance(1100); assert.equal(audio.volume, 0.25);
  // This manager never invokes play: paused streams remain paused.
  focus.acquire(); focus.release(); focus.dispose(); advance(1100); assert.equal(audio.muted, true);
} finally {
  globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear;
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: originalPerformance });
}
console.log('Atlas exclusive focus, delayed fade, duplicate release, reactivation, saved volume/mute and teardown passed.');
