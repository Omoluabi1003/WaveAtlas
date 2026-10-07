// One-time free offline preparation. Requires onnxruntime-node@1.20.0 outside
// the application dependencies. See docs/atlas-omoluabi-primary-voice.md.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { MODEL_REVISION, REFERENCE_SHA } from '../public/atlas-voice-store.mjs';
import { encodeVoiceProfile, decodeVoiceProfile } from '../public/atlas-voice-profile.mjs';
import { decodeReferenceWav } from '../public/atlas-reference-audio.mjs';
import { packVoiceState, unpackVoiceState, cloneVoiceState } from '../public/vendor/pocket-tts-js/voice-state.js';
import { SentencePieceTokenizer } from '../public/vendor/pocket-tts-js/tokenizer.js';
import { parseNpyFloat32, parseVoiceStatesBin } from '../public/vendor/pocket-tts-js/binary.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const [models, ortModule] = process.argv.slice(2);
if (!models || !ortModule) throw new Error('Usage: node scripts/prepare-omoluabi-voice.mjs MODEL_DIRECTORY ONNXRUNTIME_NODE_MODULE_PATH');
const ort = await import(pathToFileURL(path.resolve(ortModule)));
const files = ['bundle.json', 'tokenizer.model', 'bos_before_voice.npy', 'mimi_encoder.onnx', 'text_conditioner_int8.onnx', 'flow_lm_main_int8.onnx', 'flow_lm_flow_int8.onnx', 'mimi_decoder_int8.onnx'];
const modelHashes = Object.fromEntries(files.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(models, name))).digest('hex')]));
const referenceBytes = fs.readFileSync(path.join(root, 'public/omoluabi-voice-reference.wav'));
assert.equal(createHash('sha1').update(`blob ${referenceBytes.length}\0`).update(referenceBytes).digest('hex'), REFERENCE_SHA, 'Reference changed: update the version before preparing a new speaker');
const reference = decodeReferenceWav(referenceBytes.buffer.slice(referenceBytes.byteOffset, referenceBytes.byteOffset + referenceBytes.byteLength));

// Use the actual inference worker with a CPU runtime adapter. Production uses
// the same tensor manifests, encoder, conditioning, state import and generation.
const source = fs.readFileSync(path.join(root, 'public/vendor/pocket-tts-js/worker.js'), 'utf8')
  .replace(/^import .*;$/gm, '')
  .replace(/async function loadOrt\(\) \{[\s\S]*?\n\}/, 'async function loadOrt() { ort = nativeOrt; precomputeFlowBuffers(); }');
const responses = [], chunks = [];
let started = 0, firstChunkMs = 0, seed = 1;
const math = Object.create(Math);
math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 1) / 4294967297; };
const context = {
  nativeOrt: { Tensor: ort.Tensor, InferenceSession: { create: (bytes, options) => ort.InferenceSession.create(bytes, { ...options, executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1 }) } },
  packVoiceState, unpackVoiceState, cloneVoiceState, SentencePieceTokenizer, parseNpyFloat32, parseVoiceStatesBin,
  Math: math, Float32Array, BigInt64Array, Uint8Array, ArrayBuffer, DataView, TextDecoder, Map, Promise, Error, performance, setTimeout,
  fetch: async url => {
    const bytes = fs.readFileSync(path.join(models, path.basename(url)));
    return { ok: true, headers: { get: () => String(bytes.byteLength) }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  },
  self: { postMessage: message => {
    if (message.type === 'chunk') { if (!firstChunkMs) firstChunkMs = performance.now() - started; chunks.push(message.audio.slice()); }
    responses.push(message);
  } },
};
vm.runInNewContext(source, context);
async function send(type, payload) {
  const id = `${responses.length}-${type}`;
  await context.self.onmessage({ data: { id, type, payload } });
  const response = responses.findLast(message => message.id === id);
  if (response?.type === 'error') throw new Error(response.error);
  return response?.result;
}
await send('init', { language: 'english_2026-04', modelBaseUrl: 'https://models/onnx', voiceCloning: true, encoderQuantized: false, quantized: true, cache: false });
await send('cloneVoice', { audio: reference.pcm, ref: 'Omoluabi Paul' });
const tensors = await send('exportVoice', { ref: 'Omoluabi Paul' });
const profile = { ...tensors, referenceSha: REFERENCE_SHA, modelRevision: MODEL_REVISION };
const encoded = encodeVoiceProfile(profile);
assert.deepEqual(new Uint8Array(encodeVoiceProfile(decodeVoiceProfile(encoded))), new Uint8Array(encoded), 'Binary profile must round-trip without changing tensor bits');
await send('importVoice', { profile: decodeVoiceProfile(encoded), ref: 'saved-Paul' });
started = performance.now();
await send('generate', { text: 'Hello Paul. I am Atlas, and I am ready to help.', voiceRef: 'saved-Paul' });
assert.ok(chunks.length && chunks.some(chunk => chunk.some(sample => Math.abs(sample) > 0.01)), 'Restored speaker must produce audible PCM');
assert.deepEqual(await send('exportVoice', { ref: 'Omoluabi Paul' }), tensors, 'Synthesis must not mutate the original speaker state');
fs.writeFileSync(path.join(root, 'public/omoluabi-voice-profile.bin'), Buffer.from(encoded));
fs.writeFileSync(path.join(root, 'docs/omoluabi-voice-profile-provenance.json'), JSON.stringify({
  source: 'Omoluabi voice.mp3', referenceBlobSha: REFERENCE_SHA, referenceSha256: createHash('sha256').update(referenceBytes).digest('hex'),
  modelRevision: MODEL_REVISION, language: profile.language, sampleRate: profile.sampleRate, encoderQuantized: false, generationQuantized: true,
  runtime: 'onnxruntime-node@1.20.0', profileBytes: encoded.byteLength, profileSha256: createHash('sha256').update(new Uint8Array(encoded)).digest('hex'), modelHashes,
}, null, 2) + '\n');
console.log(JSON.stringify({ preparedProfileBytes: encoded.byteLength, firstNativeChunkMs: Math.round(firstChunkMs), generatedSeconds: chunks.reduce((sum, chunk) => sum + chunk.length, 0) / profile.sampleRate, referencePreserved: true }));
