import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

async function main() {
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
  const store = await import(new URL('../public/atlas-voice-store.mjs', import.meta.url).href);
  const state = await import(new URL('../public/vendor/pocket-tts-js/voice-state.js', import.meta.url).href);
  const codec = await import(new URL('../public/atlas-voice-profile.mjs', import.meta.url).href);
  const manifest = [
    { input_name: 'cache', dtype: 'float32', shape: [2, 1, 10, 1, 1], key: 'cache', module: 'attention' },
    { input_name: 'end', dtype: 'float32', shape: [0], key: 'current_end', module: 'attention' },
    { input_name: 'step', dtype: 'int64', shape: [1], key: 'step', module: 'attention' },
  ];
  const makeTensor = (type: string, data: Float32Array | BigInt64Array, dims: number[]) => ({ type, data, dims });
  const data = new Float32Array(20).fill(NaN); data.set([0.3, 0.4], 0); data.set([0.6, 0.8], 10);
  const tensors = {
    cache: makeTensor('float32', data, [2, 1, 10, 1, 1]),
    end: makeTensor('float32', new Float32Array(2), [2]),
    step: makeTensor('int64', new BigInt64Array([BigInt(2)]), [1]),
  };
  const packed = state.packVoiceState(tensors);
  assert.equal(packed.cache.runs.reduce((sum: number, run: any) => sum + run.data.length, 0), 4, 'NaN padding must not consume persisted cache space');
  const profile = { format: 2, manifest, tensors: packed };
  assert.deepEqual(codec.decodeVoiceProfile(codec.encodeVoiceProfile(profile)), profile, 'Binary profile must retain the exact tensor bits');
  assert.throws(() => codec.decodeVoiceProfile(new ArrayBuffer(12)));
  const invalidHeader = codec.encodeVoiceProfile(profile); new DataView(invalidHeader).setUint32(6, 0xffffffff, true);
  assert.throws(() => codec.decodeVoiceProfile(invalidHeader));
  const shipped = fs.readFileSync('public/omoluabi-voice-profile.bin');
  const provenance = JSON.parse(fs.readFileSync('docs/omoluabi-voice-profile-provenance.json', 'utf8'));
  assert.equal(createHash('sha256').update(shipped).digest('hex'), provenance.profileSha256);
  assert.equal(createHash('sha256').update(fs.readFileSync('public/omoluabi-voice-reference.wav')).digest('hex'), provenance.referenceSha256);
  const shippedProfile = codec.decodeVoiceProfile(shipped.buffer.slice(shipped.byteOffset, shipped.byteOffset + shipped.byteLength));
  assert.equal(shippedProfile.referenceSha, store.REFERENCE_SHA);
  assert.equal(shippedProfile.modelRevision, store.MODEL_REVISION);
  assert.equal(shippedProfile.language, 'english_2026-04');
  assert.equal(shippedProfile.sampleRate, 24000);
  assert.equal(Object.keys(state.unpackVoiceState(shippedProfile.tensors, shippedProfile.manifest, makeTensor)).length, 18, 'Shipped real speaker state must restore against its model manifest');
  assert.equal(await store.saveVoiceProfile(profile), true);
  const persisted = await store.loadVoiceProfile();
  const restored = state.unpackVoiceState(persisted.tensors, manifest, makeTensor);
  assert.deepEqual(restored, tensors, 'IndexedDB must retain dynamic shapes, NaN padding and BigInt state');
  const copy = state.cloneVoiceState(restored, makeTensor);
  copy.cache.data[0] = 99; copy.step.data[0] = BigInt(99); copy.cache.dims[0] = 9;
  assert.equal(restored.cache.data[0], tensors.cache.data[0]);
  assert.equal(restored.step.data[0], BigInt(2));
  assert.equal(restored.cache.dims[0], 2);
  const broken = structuredClone(packed); broken.cache.runs[0].offset = 30;
  assert.throws(() => state.unpackVoiceState(broken, manifest, makeTensor));
  const wrongShape = structuredClone(packed); wrongShape.end.dims[0] = 11;
  assert.throws(() => state.unpackVoiceState(wrongShape, manifest, makeTensor));

  const pcm = { samples: new Float32Array([0, 0.2, -0.2]), sampleRate: 24000 };
  assert.equal(await store.saveSpeech(' Welcome  Paul ', pcm), true);
  const replay = await store.loadSpeech('Welcome Paul');
  assert.deepEqual(replay, pcm);
  replay.samples[1] = 9;
  assert.equal((await store.loadSpeech('Welcome Paul')).samples[1], pcm.samples[1], 'Reads must not mutate saved PCM');
  await store.deleteVoiceProfile();
  assert.equal(await store.loadVoiceProfile(), null);
  assert.deepEqual(await store.loadSpeech('Welcome Paul'), pcm, 'Profile reset must preserve versioned speech entries');

  const realNow = Date.now; let now = realNow(); Date.now = () => ++now;
  try { for (let n = 0; n < 65; n++) assert.equal(await store.saveSpeech(`Phrase ${n}`, pcm), true); }
  finally { Date.now = realNow; }
  assert.equal(await store.loadSpeech('Phrase 0'), null, 'Phrase count must be bounded');
  assert.deepEqual(await store.loadSpeech('Phrase 64'), pcm);
  const large = { samples: new Float32Array(3 * 1024 * 1024), sampleRate: 24000 };
  for (let n = 0; n < 3; n++) await store.saveSpeech(`Large ${n}`, large);
  assert.equal(await store.loadSpeech('Large 0'), null, 'PCM storage must remain under 32 MiB');
  assert.ok(await store.loadSpeech('Large 2'));
  Object.defineProperty(globalThis, 'indexedDB', { value: { open() { throw new Error('Storage blocked'); } }, configurable: true });
  assert.equal(await store.loadVoiceProfile(), null);
  assert.equal(await store.loadSpeech('Welcome Paul'), null);
  assert.equal(await store.saveSpeech('Welcome Paul', pcm), false, 'Storage failure must leave speech usable without persistence');
  console.log('Voice storage: compact tensor fidelity, independent speaker state, dynamic shapes, persistent PCM, limits and denied storage passed.');
}
void main();
