let ttsPromise = null;
let clonedVoice = null;
let engine = 'pocket-tts';
let voiceSource = 'none';
const DB_NAME = 'waveatlas-atlas-voice-v1';
const STORE = 'references';
const VOICE_KEY = 'omoluabi-paul';
const CANONICAL_REFERENCE = '/api/atlas-voice-reference';
const TARGET_RATE = 24000;
const REFERENCE_SECONDS = 12;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Voice storage unavailable'));
  });
}

async function loadSavedReference() {
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(VOICE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Could not read enrolled voice'));
      });
    } finally { db.close(); }
  } catch { return null; }
}

function monoFromChannels(channelData, maxSamples) {
  const channels = channelData.filter((channel) => channel instanceof Float32Array && channel.length);
  if (!channels.length) throw new Error('Omoluabi Paul reference decoded without audio');
  const length = Math.min(maxSamples, ...channels.map((channel) => channel.length));
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] || 0;
    mono[i] = sum / channels.length;
  }
  return mono;
}

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const outputLength = Math.max(1, Math.floor(input.length * toRate / fromRate));
  const output = new Float32Array(outputLength);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const mix = position - left;
    output[i] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}

function normalizeReference(input) {
  let mean = 0;
  for (const sample of input) mean += sample;
  mean /= Math.max(1, input.length);
  let peak = 0;
  const centered = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    centered[i] = input[i] - mean;
    peak = Math.max(peak, Math.abs(centered[i]));
  }
  if (peak < 0.001) throw new Error('Omoluabi Paul reference is too quiet');
  const gain = Math.min(4, 0.92 / peak);
  for (let i = 0; i < centered.length; i++) centered[i] *= gain;
  return centered;
}

async function loadCanonicalReference() {
  const response = await fetch(CANONICAL_REFERENCE, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Canonical Omoluabi Paul reference failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 4096) throw new Error('Canonical Omoluabi Paul reference is incomplete');
  const { MPEGDecoder } = await import('https://cdn.jsdelivr.net/npm/mpg123-decoder@1.0.3/+esm');
  const decoder = new MPEGDecoder();
  try {
    await decoder.ready;
    const decoded = decoder.decode(bytes);
    const sampleRate = Number(decoded.sampleRate) || 48000;
    const mono = monoFromChannels(decoded.channelData || [], Math.floor(sampleRate * REFERENCE_SECONDS));
    const pcm = normalizeReference(resampleLinear(mono, sampleRate, TARGET_RATE));
    return { pcm, sampleRate: TARGET_RATE, source: 'repository-canonical' };
  } finally { decoder.free(); }
}

async function resolveReference() {
  // The repository recording is authoritative. Browser enrollment is only a fallback
  // when the canonical asset cannot be fetched or decoded.
  try { return await loadCanonicalReference(); }
  catch (canonicalError) {
    const saved = await loadSavedReference();
    if (saved?.pcm) {
      const pcm = saved.pcm instanceof Float32Array ? saved.pcm : new Float32Array(saved.pcm);
      return { pcm, sampleRate: Number(saved.sampleRate) || TARGET_RATE, source: 'browser-enrollment' };
    }
    throw canonicalError;
  }
}

async function createEngine() {
  const { PocketTTS } = await import('https://cdn.jsdelivr.net/npm/pocket-tts-js@0.1.0/+esm');
  const tts = new PocketTTS({ language: 'english_2026-04', quantized: true, voiceCloning: true, maxThreads: 2 });
  await tts.load();
  const reference = await resolveReference();
  clonedVoice = await tts.cloneVoice(reference.pcm, { inputSampleRate: reference.sampleRate, name: 'Omoluabi Paul' });
  voiceSource = reference.source;
  engine = 'pocket-tts-omoluabi-paul';
  return tts;
}

function getEngine() {
  if (!ttsPromise) ttsPromise = createEngine();
  return ttsPromise;
}

function wavBuffer(chunks, sampleRate) {
  const length = chunks.reduce((n, part) => n + part.length, 0);
  const samples = new Float32Array(length); let offset = 0;
  for (const part of chunks) { samples.set(part, offset); offset += part.length; }
  const buffer = new ArrayBuffer(44 + samples.length * 2); const view = new DataView(buffer);
  const write = (at, text) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  let at = 44; for (const sample of samples) { const s = Math.max(-1, Math.min(1, sample)); view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true); at += 2; }
  return buffer;
}

self.onmessage = async (event) => {
  const { type, id, text } = event.data || {};
  if (type === 'warm') {
    try {
      const tts = await getEngine();
      self.postMessage({ type: 'ready', engine, voice: 'Omoluabi Paul', voiceSource, sampleRate: tts.sampleRate });
    } catch (error) {
      ttsPromise = null; clonedVoice = null; voiceSource = 'none';
      self.postMessage({ type: 'unavailable', message: error instanceof Error ? error.message : 'Omoluabi Paul unavailable' });
    }
    return;
  }
  if (type !== 'speak' || !id || typeof text !== 'string' || !text.trim()) return;
  try {
    const tts = await getEngine(); if (!clonedVoice) throw new Error('Omoluabi Paul is not ready');
    const chunks = [];
    await tts.generate(text.trim(), { voice: clonedVoice, onChunk: (audio) => chunks.push(new Float32Array(audio)) });
    if (!chunks.length) throw new Error('Omoluabi Paul produced no audio');
    const buffer = wavBuffer(chunks, Number(tts.sampleRate) || TARGET_RATE);
    self.postMessage({ type: 'audio', id, buffer, mime: 'audio/wav', engine, voiceSource }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Omoluabi Paul generation failed' });
  }
};
