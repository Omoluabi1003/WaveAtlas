import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';

async function until(check: () => boolean) {
  for (let n = 0; n < 100 && !check(); n++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(check(), 'Expected worker event');
}

async function main() {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
  const voiceStore = await import(new URL('../public/atlas-voice-store.mjs', import.meta.url).href);
  const voiceProfile = await import(new URL('../public/atlas-voice-profile.mjs', import.meta.url).href);
  const readySpeech = await import(new URL('../public/atlas-ready-speech.mjs', import.meta.url).href);
  const readyBytes = fs.readFileSync('public/omoluabi-ready-speech.bin');
  const readyBuffer = readyBytes.buffer.slice(readyBytes.byteOffset, readyBytes.byteOffset + readyBytes.byteLength);
  const { decodeReferenceWav } = await import('../public/atlas-reference-audio.mjs');
  const bytes = fs.readFileSync('public/omoluabi-voice-reference.wav');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const reference = decodeReferenceWav(buffer);
  assert.equal(reference.sampleRate, 24000);
  assert.equal(reference.pcm.length, 240000);
  assert.ok(reference.pcm.some((sample: number) => Math.abs(sample) > 0.01));
  assert.throws(() => decodeReferenceWav(new ArrayBuffer(44)));

  const counts = { constructed: 0, cloned: 0, generated: 0, imported: 0, reference: 0, stopped: 0 };
  const configurations: any[] = [];
  const profile = { format: 2, referenceSha: voiceStore.REFERENCE_SHA, modelRevision: voiceStore.MODEL_REVISION, tensors: { cache: new Float32Array([NaN, 0.4]), step: new BigInt64Array([BigInt(126)]) } };
  let gate: (() => Promise<void>) | null = null;
  let loadGate: Promise<void> | null = null;
  let stopGate: Promise<void> | null = null;
  class PocketTTS {
    sampleRate = 24000;
    constructor(options: any) { counts.constructed++; configurations.push(options); }
    async load(progress: any) { if (loadGate) await loadGate; progress({ label: 'Model', loaded: 1, total: 2 }); }
    async cloneVoice(pcm: Float32Array, options: any) {
      assert.deepEqual(pcm, reference.pcm, 'Reference level and samples must remain unchanged');
      assert.equal(options.name, 'Omoluabi Paul'); counts.cloned++; return 'paul-reference';
    }
    async exportVoice(ref: string) { assert.equal(ref, 'paul-reference'); return profile; }
    async importVoice(saved: any, ref: string) { assert.deepEqual(saved, profile); counts.imported++; return ref; }
    async generate(_text: string, options: any) {
      assert.ok(['paul-reference', 'Omoluabi Paul'].includes(options.voice)); counts.generated++;
      options.onChunk(new Float32Array([0, 0.25, -0.25]));
      if (gate) await gate();
      options.onChunk(new Float32Array([0.1, -0.1]));
    }
    async stop() { counts.stopped++; if (stopGate) await stopGate; }
    destroy() {}
  }
  const source = fs.readFileSync('public/atlas-neural-voice-worker.mjs', 'utf8')
    .replace(/^import .* from '\.\/atlas-voice-store\.mjs(?:\?[^']+)?';/m, 'const { MODEL_REVISION, REFERENCE_SHA, VOICE_CACHE_VERSION, loadVoiceProfile, saveVoiceProfile, deleteVoiceProfile, loadSpeech, saveSpeech } = voiceStore;')
    .replace(/^import .* from '\.\/atlas-voice-profile\.mjs(?:\?[^']+)?';/m, 'const { decodeVoiceProfile } = voiceProfile;')
    .replace(/^import .* from '\.\/atlas-ready-speech\.mjs(?:\?[^']+)?';/m, 'const { loadReadySpeech, READY_SPEECH_VERSION } = readySpeech;')
    .replace(/await import\('\.\/vendor\/pocket-tts-js\/index\.js(?:\?[^']+)?'\)/, 'sdk')
    .replace(/await import\('\.\/atlas-reference-audio\.mjs(?:\?[^']+)?'\)/, 'decoder');
  function worker(bundled = false, staleSdk = false, readyReplies = false) {
    const messages: any[] = [];
    class ObsoletePocketTTS extends PocketTTS { exportVoice = undefined as any; importVoice = undefined as any; }
    const context: any = { voiceStore, voiceProfile, readySpeech: { READY_SPEECH_VERSION: readySpeech.READY_SPEECH_VERSION, loadReadySpeech: async (expected: any) => readyReplies ? readySpeech.decodeReadySpeech(readyBuffer, expected).replies : new Map() }, sdk: { PocketTTS: staleSdk ? ObsoletePocketTTS : PocketTTS }, decoder: { decodeReferenceWav }, fetch: async (url: string) => {
      if (url === `/omoluabi-voice-profile.bin?v=${voiceStore.VOICE_CACHE_VERSION}`) return { ok: bundled, arrayBuffer: async () => voiceProfile.encodeVoiceProfile(profile) };
      counts.reference++; assert.equal(url, `/omoluabi-voice-reference.wav?v=${voiceStore.REFERENCE_SHA}`); return { ok: true, arrayBuffer: async () => buffer };
    }, self: { postMessage: (message: any, transfer: Transferable[] = []) => messages.push(structuredClone(message, { transfer })) }, Float32Array, ArrayBuffer, DataView, Uint8Array, Map, Promise, Error };
    vm.runInNewContext(source, context);
    return { messages, send: (data: object) => context.self.onmessage({ data }) as Promise<void> };
  }

  const fast = worker(false, true, true);
  Object.defineProperty(globalThis, 'indexedDB', { get: () => { throw new Error('Storage unavailable on this fresh device'); }, configurable: true });
  await fast.send({ type: 'warm' });
  assert.equal(fast.messages[0].type, 'prepared');
  for (const reply of JSON.parse(fs.readFileSync('lib/atlas-ready-replies.json', 'utf8'))) {
    await fast.send({ type: 'speak', id: `ready-${reply.id}`, text: reply.text });
    assert.ok(fast.messages.some(message => message.id === `ready-${reply.id}` && message.type === 'audio_end' && message.cached));
  }
  assert.equal(counts.constructed, 0, 'Every shipped reply must speak on a first visit with no inference engine');
  assert.equal(counts.reference, 0, 'Prepared replies must not download or decode a speaker reference');
  assert.equal(counts.generated, 0);
  assert.ok(!fast.messages.some(message => ['loading', 'progress', 'error', 'unavailable'].includes(message.type)));
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });

  const first = worker();
  await first.send({ type: 'warm' });
  await until(() => first.messages.some(message => message.type === 'ready'));
  assert.equal(counts.cloned, 1);
  assert.equal(first.messages[0].type, 'loading');
  assert.equal(configurations[0].encoderQuantized, false);
  assert.equal(configurations[0].voiceCloning, true);
  assert.ok(first.messages.some(message => message.type === 'ready' && message.voiceSource === 'repository-canonical'));

  let release!: () => void;
  gate = () => new Promise<void>(resolve => { release = resolve; });
  const generating = first.send({ type: 'speak', id: 'one', text: 'Welcome to WaveAtlas.' });
  await until(() => first.messages.some(message => message.type === 'audio_chunk'));
  assert.ok(!first.messages.some(message => message.type === 'audio_end'), 'Audio must stream before generation completes');
  release(); await generating; gate = null;
  await first.send({ type: 'speak', id: 'two', text: '  Welcome   to WaveAtlas. ' });
  assert.equal(counts.generated, 1, 'Repeated phrases must bypass synthesis');
  const saved = first.messages.filter(message => message.id === 'two' && message.type === 'audio_chunk');
  assert.ok(saved.every(message => message.cached && message.sampleRate === 24000));
  assert.deepEqual(saved.map(message => message.samples), first.messages.filter(message => message.id === 'one' && message.type === 'audio_chunk').map(message => message.samples), 'Replay must preserve the original PCM samples');

  const reloaded = worker();
  await reloaded.send({ type: 'speak', id: 'reload', text: 'Welcome to WaveAtlas.' });
  assert.equal(counts.constructed, 1, 'Fresh workers must replay persisted PCM without a model');
  assert.equal(counts.generated, 1);
  assert.equal(reloaded.messages.find(message => message.type === 'audio_chunk').cached, true);
  await reloaded.send({ type: 'warm' });
  await until(() => reloaded.messages.some(message => message.type === 'prepared'));
  assert.equal(counts.constructed, 1, 'Opening a saved voice must not initialize generation models');
  assert.equal(counts.imported, 0);

  await Promise.all([
    reloaded.send({ type: 'speak', id: 'same-a', text: 'Another station.' }),
    reloaded.send({ type: 'speak', id: 'same-b', text: 'Another station.' }),
  ]);
  assert.equal(counts.generated, 2, 'Concurrent identical misses must share a synthesis result');
  assert.equal(counts.imported, 1);
  assert.equal(counts.cloned, 1, 'Saved profile must prevent reference re-encoding');
  assert.equal(counts.reference, 1, 'Saved profile must prevent reference download/decoding');
  assert.equal(configurations[1].voiceCloning, false, 'Reload must skip the encoder model');
  assert.ok(configurations[1].modelBaseUrl.includes(voiceStore.MODEL_REVISION), 'Profile and generation models must use the same pinned revision');

  gate = () => new Promise<void>(resolve => { release = resolve; });
  const interrupted = reloaded.send({ type: 'speak', id: 'cancelled', text: 'Do not finish this.' });
  await until(() => reloaded.messages.some(message => message.id === 'cancelled' && message.type === 'audio_chunk'));
  await reloaded.send({ type: 'cancel' });
  const delivered = reloaded.messages.length;
  release(); await interrupted; gate = null;
  assert.equal(reloaded.messages.length, delivered, 'Cancelled generation must not deliver late speech or completion');
  assert.equal(await voiceStore.loadSpeech('Do not finish this.'), null, 'Partial speech must never become a cached response');
  assert.ok(counts.stopped > 0);

  await voiceStore.deleteVoiceProfile();
  const freshDevice = worker(true);
  await freshDevice.send({ type: 'warm' });
  assert.ok(freshDevice.messages.some(message => message.type === 'prepared'));
  assert.equal(counts.constructed, 2, 'Bundled voice preparation must not initialize models on a fresh device');
  await freshDevice.send({ type: 'speak', id: 'bundled', text: 'A new device reply.' });
  assert.equal(counts.cloned, 1, 'Bundled preparation must bypass reference encoding on a fresh device');
  assert.equal(counts.reference, 1);

  const quiet = worker(true);
  const beforePrefetch = counts.generated;
  await quiet.send({ type: 'prefetch', texts: ['A station identity.', 'A station language.'] });
  assert.equal(counts.generated, beforePrefetch + 2);
  assert.ok(!quiet.messages.some(message => message.type === 'audio_chunk' || message.type === 'audio_end'), 'Context preparation must never produce unsolicited speech');
  await quiet.send({ type: 'speak', id: 'context-reply', text: 'A station identity.' });
  assert.equal(counts.generated, beforePrefetch + 2, 'Prepared station details must replay without a second generation');
  assert.ok(quiet.messages.some(message => message.id === 'context-reply' && message.type === 'audio_end' && message.cached));

  const busyEngine = worker(true, false, true);
  let releaseLoad!: () => void;
  loadGate = new Promise<void>(resolve => { releaseLoad = resolve; });
  const beforeLoad = counts.constructed, beforeBusy = counts.generated;
  const background = busyEngine.send({ type: 'prefetch', texts: ['An uncached background fact.'] });
  await until(() => counts.constructed > beforeLoad);
  await busyEngine.send({ type: 'speak', id: 'ready-while-busy', text: 'Hello. Where should we listen today?' });
  assert.ok(busyEngine.messages.some(message => message.id === 'ready-while-busy' && message.type === 'audio_end'), 'Routine replies must bypass an initializing background engine');
  assert.equal(counts.generated, beforeBusy);
  await busyEngine.send({ type: 'cancel' }); releaseLoad(); await background; loadGate = null;
  assert.equal(counts.generated, beforeBusy, 'Interrupted context preparation must not synthesize after its model load finishes');
  const faultyBackground = worker(true, true, true);
  await faultyBackground.send({ type: 'prefetch', texts: ['A fact with an unavailable engine.'] });
  assert.ok(!faultyBackground.messages.some(message => message.type === 'unavailable'), 'Optional inference failure must not disable prepared replies');
  await faultyBackground.send({ type: 'speak', id: 'still-ready', text: 'Hello. Where should we listen today?' });
  assert.ok(faultyBackground.messages.some(message => message.id === 'still-ready' && message.type === 'audio_end'));
  assert.equal(configurations[2].voiceCloning, false);

  const obsolete = worker(true, true);
  await obsolete.send({ type: 'speak', id: 'obsolete', text: 'An obsolete runtime must not enroll Paul again.' });
  assert.ok(obsolete.messages.some(message => message.type === 'unavailable' && /runtime could not update/.test(message.message)));
  assert.equal(counts.cloned, 1, 'An SDK mismatch must fail before expensive reference re-encoding');
  assert.equal(counts.reference, 1);

  const priority = worker(true);
  let releaseBackground!: () => void, acknowledgeStop!: () => void;
  gate = () => new Promise<void>(resolve => { releaseBackground = resolve; });
  const beforePriority = counts.generated;
  const prefetch = priority.send({ type: 'prefetch', texts: ['Background priority test.'] });
  await until(() => counts.generated === beforePriority + 1);
  stopGate = new Promise<void>(resolve => { acknowledgeStop = resolve; });
  const foreground = priority.send({ type: 'speak', id: 'priority', text: 'Foreground priority test.' });
  gate = null; releaseBackground(); await prefetch;
  assert.equal(counts.generated, beforePriority + 1, 'New speech must wait for the old stop acknowledgement');
  acknowledgeStop(); await foreground; stopGate = null;
  assert.equal(counts.generated, beforePriority + 2);
  assert.ok(priority.messages.some(message => message.id === 'priority' && message.type === 'audio_end'));
  assert.equal(await voiceStore.loadSpeech('Background priority test.'), null, 'Preempted background speech must not cache a partial reply');

  const sdk = fs.readFileSync('public/vendor/pocket-tts-js/index.js', 'utf8');
  assert.match(sdk, /new URL\("\.\/worker.js", import.meta.url\)/);
  for (const file of ['worker.js', 'voice-state.js', 'tokenizer.js', 'binary.js', 'player.js', 'LICENSE']) assert.ok(fs.existsSync(`public/vendor/pocket-tts-js/${file}`));
  console.log('Omoluabi voice: all 28 fresh-device prepared replies without models/storage, unchanged reference, model-free replay, silent context preparation, concurrent reuse and cancellation passed.');
}
void main();
