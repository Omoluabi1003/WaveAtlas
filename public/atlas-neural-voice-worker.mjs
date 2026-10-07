import { MODEL_REVISION, REFERENCE_SHA, VOICE_CACHE_VERSION, loadVoiceProfile, saveVoiceProfile, deleteVoiceProfile, loadSpeech, saveSpeech } from './atlas-voice-store.mjs';
import { decodeVoiceProfile } from './atlas-voice-profile.mjs';
let ttsPromise = null;
let activeEngine = null;
let generation = 0;
let synthesisQueue = Promise.resolve();
const speechCache = new Map();
let clonedVoice = null;
let preparedVoicePromise = null;
const engine = 'pocket-tts-omoluabi-paul';
const voiceSource = 'repository-canonical';
const identity = { engine, voiceSource };

async function loadPreparedVoice() {
  const matches = profile => profile?.format === 2 && profile.referenceSha === REFERENCE_SHA && profile.modelRevision === MODEL_REVISION;
  const cached = await loadVoiceProfile();
  if (matches(cached)) return cached;
  try {
    const response = await fetch(`/omoluabi-voice-profile.bin?v=${VOICE_CACHE_VERSION}`, { cache: 'force-cache' });
    if (!response.ok) return null;
    const profile = decodeVoiceProfile(await response.arrayBuffer());
    if (!matches(profile)) throw new Error('Prepared voice reference mismatch');
    await saveVoiceProfile(profile);
    return profile;
  } catch { return null; }
}
function getPreparedVoice() { if (!preparedVoicePromise) preparedVoicePromise = loadPreparedVoice(); return preparedVoicePromise; }

async function loadCanonicalReference() {
  const response = await fetch(`/omoluabi-voice-reference.wav?v=${REFERENCE_SHA}`, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Omoluabi reference failed (${response.status})`);
  const { decodeReferenceWav } = await import('./atlas-reference-audio.mjs');
  const reference = decodeReferenceWav(await response.arrayBuffer());
  if (!reference.pcm.some(sample => Math.abs(sample) > 0.001)) throw new Error('Voice reference is silent');
  // Preserve the recorded reference's level and timbre. No boost or pitch changes.
  return reference;
}
async function createEngine(fromRecording = false) {
  // Local generation uses no WaveAtlas API key, account or paid endpoint.
  const profile = fromRecording ? null : await getPreparedVoice();
  const { PocketTTS } = await import('./vendor/pocket-tts-js/index.js');
  const tts = new PocketTTS({ language: 'english_2026-04', modelBaseUrl: `https://huggingface.co/vlapky/pocket-tts-onnx/resolve/${MODEL_REVISION}/onnx`, quantized: true, encoderQuantized: false, voiceCloning: !profile, maxThreads: 2, cache: true });
  activeEngine = tts;
  await tts.load(progress => self.postMessage({ type: 'progress', label: progress.label || progress.status || 'Preparing Omoluabi voice', loaded: progress.loaded, total: progress.total }));
  if (profile) {
    try { clonedVoice = await tts.importVoice(profile, 'Omoluabi Paul'); }
    catch { tts.destroy(); activeEngine = null; await deleteVoiceProfile(); return createEngine(true); }
  } else {
    const reference = await loadCanonicalReference();
    clonedVoice = await tts.cloneVoice(reference.pcm, { inputSampleRate: reference.sampleRate, name: 'Omoluabi Paul' });
    const saved = { ...await tts.exportVoice(clonedVoice), referenceSha: REFERENCE_SHA, modelRevision: MODEL_REVISION };
    preparedVoicePromise = Promise.resolve(saved);
    await saveVoiceProfile(saved);
  }
  return tts;
}
function getEngine() {
  if (!ttsPromise) ttsPromise = createEngine().then(tts => {
    self.postMessage({ type: 'ready', voice: 'Omoluabi Paul', sampleRate: tts.sampleRate, ...identity }); return tts;
  }).catch(error => {
    activeEngine?.destroy(); activeEngine = null; ttsPromise = null; clonedVoice = null;
    self.postMessage({ type: 'unavailable', message: error instanceof Error ? error.message : 'Omoluabi Paul unavailable' });
    throw error;
  });
  return ttsPromise;
}
function remember(text, audio) {
  speechCache.delete(text); speechCache.set(text, audio);
  let bytes = [...speechCache.values()].reduce((sum, entry) => sum + entry.samples.byteLength, 0);
  while (speechCache.size > 16 || bytes > 32 * 1024 * 1024) { const key = speechCache.keys().next().value; bytes -= speechCache.get(key).samples.byteLength; speechCache.delete(key); }
}
function emitAudio(id, audio, cached = false) {
  const samples = audio.samples.slice();
  self.postMessage({ type: 'audio_chunk', id, samples, sampleRate: audio.sampleRate, cached, ...identity }, [samples.buffer]);
}
function replay(id, audio) {
  // Reuse original chunk boundaries so replay gets the same loudness gain.
  const lengths = audio.chunkLengths;
  if (Array.isArray(lengths) && lengths.every(length => Number.isSafeInteger(length) && length > 0) && lengths.reduce((sum, length) => sum + length, 0) === audio.samples.length) {
    let offset = 0;
    for (const length of lengths) { emitAudio(id, { samples: audio.samples.subarray(offset, offset + length), sampleRate: audio.sampleRate }, true); offset += length; }
  } else emitAudio(id, audio, true);
  self.postMessage({ type: 'audio_end', id, cached: true, ...identity });
}
self.onmessage = async event => {
  const { type, id, text } = event.data || {};
  if (type === 'cancel') { generation += 1; void activeEngine?.stop().catch(() => {}); return; }
  if (type === 'warm') {
    // A bundled or saved speaker needs no model initialization until new wording.
    if (await getPreparedVoice()) { self.postMessage({ type: 'prepared', voice: 'Omoluabi Paul', ...identity }); return; }
    self.postMessage({ type: 'loading', engine: 'pocket-tts-omoluabi-paul-warming', voice: 'Omoluabi Paul', voiceSource });
    void getEngine().catch(() => {});
    return;
  }
  if (type !== 'speak' || !id || typeof text !== 'string' || !text.trim()) return;
  const requestGeneration = generation;
  const key = text.trim().replace(/\s+/g, ' ');
  // Cache lookup comes before model readiness, so replay works while models warm.
  const cached = speechCache.get(key) || await loadSpeech(key);
  if (requestGeneration !== generation) return;
  if (cached?.samples instanceof Float32Array && cached.samples.length && cached.sampleRate === 24000) {
    remember(key, cached); replay(id, cached); return;
  }
  const previous = synthesisQueue;
  let release;
  synthesisQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    if (requestGeneration !== generation) return;
    const repeated = speechCache.get(key);
    if (repeated) { replay(id, repeated); return; }
    if (!ttsPromise) self.postMessage({ type: 'loading', engine: 'pocket-tts-omoluabi-paul-warming', voice: 'Omoluabi Paul', voiceSource });
    const tts = await getEngine();
    if (requestGeneration !== generation) return;
    if (!clonedVoice) throw new Error('Omoluabi Paul is not ready');
    const chunks = [];
    await tts.generate(key, { voice: clonedVoice, onChunk: audio => {
      if (requestGeneration !== generation) return;
      const samples = new Float32Array(audio);
      chunks.push(samples);
      emitAudio(id, { samples, sampleRate: tts.sampleRate });
    } });
    if (requestGeneration !== generation) return;
    if (!chunks.length) throw new Error('Omoluabi Paul produced no audio');
    const samples = new Float32Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
    let offset = 0; for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
    const audio = { samples, sampleRate: tts.sampleRate, chunkLengths: chunks.map(chunk => chunk.length) };
    remember(key, audio);
    self.postMessage({ type: 'audio_end', id, cached: false, ...identity });
    await saveSpeech(key, audio);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Omoluabi Paul generation failed' });
  } finally { release(); }
};
