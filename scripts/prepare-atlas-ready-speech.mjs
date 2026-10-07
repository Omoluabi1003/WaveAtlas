// Generate the shipped replies once with Paul's existing prepared speaker.
// Uses the actual inference worker and pinned free models; no API or enrollment.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { MODEL_REVISION, REFERENCE_SHA, VOICE_CACHE_VERSION } from '../public/atlas-voice-store.mjs';
import { decodeVoiceProfile } from '../public/atlas-voice-profile.mjs';
import { encodeReadySpeech, decodeReadySpeech, READY_SPEECH_VERSION } from '../public/atlas-ready-speech.mjs';
import { packVoiceState, unpackVoiceState, cloneVoiceState } from '../public/vendor/pocket-tts-js/voice-state.js';
import { SentencePieceTokenizer } from '../public/vendor/pocket-tts-js/tokenizer.js';
import { parseNpyFloat32, parseVoiceStatesBin } from '../public/vendor/pocket-tts-js/binary.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const [models, ortModule] = process.argv.slice(2);
if (!models || !ortModule) throw new Error('Usage: node scripts/prepare-atlas-ready-speech.mjs MODEL_DIRECTORY ONNXRUNTIME_NODE_MODULE_PATH');
const ort = await import(pathToFileURL(path.resolve(ortModule)));
const profileBytes = fs.readFileSync(path.join(root, 'public/omoluabi-voice-profile.bin'));
const profile = decodeVoiceProfile(profileBytes.buffer.slice(profileBytes.byteOffset, profileBytes.byteOffset + profileBytes.byteLength));
assert.equal(profile.referenceSha, REFERENCE_SHA); assert.equal(profile.modelRevision, MODEL_REVISION);
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'lib/atlas-ready-replies.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'public/vendor/pocket-tts-js/worker.js'), 'utf8')
  .replace(/^import .*;$/gm, '')
  .replace(/async function loadOrt\(\) \{[\s\S]*?\n\}/, 'async function loadOrt() { ort = nativeOrt; precomputeFlowBuffers(); }');
const responses = [], chunks = [], clips = [];
let seed = 1;
const math = Object.create(Math);
math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 1) / 4294967297; };
const context = {
  nativeOrt: { Tensor: ort.Tensor, InferenceSession: { create: (bytes, options) => ort.InferenceSession.create(bytes, { ...options, executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1 }) } },
  packVoiceState, unpackVoiceState, cloneVoiceState, SentencePieceTokenizer, parseNpyFloat32, parseVoiceStatesBin,
  Math: math, Float32Array, BigInt64Array, Uint8Array, ArrayBuffer, DataView, TextDecoder, Map, Promise, Error, performance, setTimeout,
  fetch: async url => { const bytes = fs.readFileSync(path.join(models, path.basename(url))); return { ok: true, headers: { get: () => String(bytes.byteLength) }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; },
  self: { postMessage: message => { if (message.type === 'chunk') chunks.push(message.audio.slice()); responses.push(message); } },
};
vm.runInNewContext(source, context);
async function send(type, payload) {
  const id = `${responses.length}-${type}`;
  await context.self.onmessage({ data: { id, type, payload } });
  const response = responses.findLast(message => message.id === id);
  if (response?.type === 'error') throw new Error(response.error);
  return response?.result;
}
await send('init', { language: 'english_2026-04', modelBaseUrl: 'https://models/onnx', voiceCloning: false, quantized: true, cache: false });
await send('importVoice', { profile, ref: 'Omoluabi Paul' });
const base = await send('exportVoice', { ref: 'Omoluabi Paul' });
for (const reply of catalogue) {
  chunks.length = 0;
  const started = performance.now();
  await send('generate', { text: reply.text, voiceRef: 'Omoluabi Paul' });
  const samples = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0; for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
  assert.ok(samples.length && samples.some(sample => Math.abs(sample) > 0.01), `Reply ${reply.id} must be audible`);
  assert.deepEqual(await send('exportVoice', { ref: 'Omoluabi Paul' }), base, 'Generation must preserve the original conditioning');
  clips.push({ ...reply, samples });
  console.log(JSON.stringify({ reply: reply.id, seconds: samples.length / 24000, generationMs: Math.round(performance.now() - started) }));
}
const metadata = { version: READY_SPEECH_VERSION, referenceSha: REFERENCE_SHA, modelRevision: MODEL_REVISION, voiceCacheVersion: VOICE_CACHE_VERSION, profileSha256: createHash('sha256').update(profileBytes).digest('hex'), engine: 'pocket-tts-omoluabi-paul', voiceSource: 'repository-canonical' };
const binary = encodeReadySpeech(metadata, clips);
const decoded = decodeReadySpeech(binary, metadata);
assert.equal(decoded.replies.size, catalogue.length);
fs.writeFileSync(path.join(root, 'public/omoluabi-ready-speech.bin'), Buffer.from(binary));
fs.writeFileSync(path.join(root, 'docs/omoluabi-ready-speech-provenance.json'), JSON.stringify({ ...metadata, runtime: 'onnxruntime-node@1.20.0', sampleRate: 24000, format: 'scaled-pcm16', bytes: binary.byteLength, sha256: createHash('sha256').update(new Uint8Array(binary)).digest('hex'), replies: decoded.metadata.clips.map(clip => ({ id: clip.id, text: clip.text, seconds: clip.length / 24000 })) }, null, 2) + '\n');
console.log(JSON.stringify({ completed: true, replies: clips.length, bytes: binary.byteLength, originalConditioningPreserved: true }));
