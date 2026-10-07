import assert from 'node:assert/strict';
import { AtlasVoiceCapture } from '../lib/atlas-voice-capture';
import type { BrowserSpeechRecognition } from '../lib/voice-command-engine';

async function main() {
  const capture = new AtlasVoiceCapture();
  let aborted = 0, ends = 0, playbackStarts = 0;
  const recognition = { onend: () => { ends++; }, start() {}, abort() { aborted++; } } as unknown as BrowserSpeechRecognition;
  capture.start(recognition);
  assert.equal(capture.active, true);
  const firstStop = capture.stop();
  assert.equal(capture.stop(), firstStop);
  assert.equal(aborted, 1, 'Repeated stop must not abort the same device twice');
  const speech = firstStop.then(() => { playbackStarts++; });
  await Promise.resolve();
  assert.equal(capture.active, true);
  assert.equal(playbackStarts, 0, 'Requesting abort must not start voice playback or release focus');
  assert.throws(() => capture.start(recognition), /still active/);
  recognition.onend!(); await speech;
  assert.equal(capture.active, false); assert.equal(playbackStarts, 1); assert.equal(ends, 1);
  const failed = { onend: null, start() { throw new Error('Start failed'); } } as unknown as BrowserSpeechRecognition;
  assert.throws(() => capture.start(failed), /Start failed/);
  assert.equal(capture.active, false);
  capture.start(recognition); recognition.onend!(); await capture.stop();
  assert.equal(capture.active, false);
  console.log('Voice capture: true ended handoff, duplicate stop, active device exclusion, restart and failed start passed.');
}
void main();
