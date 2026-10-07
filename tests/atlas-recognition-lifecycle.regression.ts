import assert from 'node:assert/strict';
import { getSpeechRecognitionConstructor } from '../lib/voice-command-engine';

async function main() {
  let native: any;
  class Recognition {
    lang = 'en-US'; interimResults = false; continuous = false; maxAlternatives = 1;
    onstart: any; onend: any; onerror: any; onresult: any;
    constructor() { native = this; }
    start() {} stop() {} abort() {}
  }
  (globalThis as any).window = { SpeechRecognition: Recognition };
  let complete: any;
  (globalThis as any).fetch = () => new Promise(resolve => { complete = () => resolve({ ok: true, json: async () => ({ transcript: 'Premier FM', confidence: 0.9 }) }); });
  const Constructor = getSpeechRecognitionConstructor()!;
  const recognition = new Constructor();
  const events: string[] = [];
  recognition.onresult = () => events.push('result');
  recognition.onend = () => events.push('end');
  const result = (isFinal: boolean) => ({ resultIndex: 0, results: [Object.assign([{ transcript: 'premiere fm' }], { isFinal })] });
  recognition.start();
  await native.onresult(result(false));
  assert.deepEqual(events, ['result']);
  events.length = 0;
  const pending = native.onresult(result(true));
  native.onend();
  assert.deepEqual(events, [], 'Native end must wait for directory resolution');
  complete(); await pending;
  assert.deepEqual(events, ['result', 'end']);
  events.length = 0;
  recognition.start();
  const stale = native.onresult(result(true));
  recognition.abort(); complete(); await stale;
  assert.deepEqual(events, [], 'Aborted recognition cannot deliver a late command');
  // Atlas aborts capture inside its final result handler. Native capture may
  // have ended already while directory resolution was pending.
  events.length = 0;
  recognition.onresult = () => { (events as string[]).push('result'); recognition.abort(); };
  recognition.start();
  const handoff = native.onresult(result(true));
  native.onend(); complete(); await handoff;
  assert.deepEqual(events, ['result', 'end'], 'Abort after native end must still complete the capture handoff');
  delete (globalThis as any).window;
  console.log('Recognition lifecycle: interim, final ordering and cancellation passed.');
}
void main();
