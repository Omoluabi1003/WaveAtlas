let ttsPromise = null;
let activeEngine = null;
let generation = 0;
let synthesisQueue = Promise.resolve();
const speechCache = new Map();
let clonedVoice = null;
let engine = 'pocket-tts';
let voiceSource = 'none';
const TARGET_RATE = 24000;

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
  const response = await fetch('/omoluabi-voice-reference.wav', { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Omoluabi reference failed (${response.status})`);
  const { decodeReferenceWav } = await import('./atlas-reference-audio.mjs');
  const reference = decodeReferenceWav(await response.arrayBuffer());
  return { pcm: normalizeReference(reference.pcm), sampleRate: reference.sampleRate, source: 'repository-canonical' };
}


async function createEngine() {
  // Pocket TTS runs entirely in this browser worker. It uses no WaveAtlas API key,
  // account, paid inference endpoint, or per-utterance service.
  const { PocketTTS } = await import('./vendor/pocket-tts-js/index.js');
  const tts = new PocketTTS({ language: 'english_2026-04', quantized: true, voiceCloning: true, maxThreads: 2, cache: true });
  activeEngine = tts;
  await tts.load((progress) => self.postMessage({ type: 'progress', label: progress.label || progress.status || 'Preparing Omoluabi voice', loaded: progress.loaded, total: progress.total }));
  const reference = await loadCanonicalReference();
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
  if (type === 'cancel') { generation += 1; void activeEngine?.stop().catch(() => {}); return; }
  if (type === 'warm') {
    // Readiness is announced only after loading and cloning the repository voice.
    self.postMessage({ type: 'loading', engine: 'pocket-tts-omoluabi-paul-warming', voice: 'Omoluabi Paul', voiceSource: 'repository-canonical' });
    getEngine().then((tts) => {
      self.postMessage({ type: 'ready', engine, voice: 'Omoluabi Paul', voiceSource, sampleRate: tts.sampleRate });
    }).catch((error) => {
      activeEngine?.destroy(); activeEngine = null; ttsPromise = null; clonedVoice = null; voiceSource = 'none';
      self.postMessage({ type: 'unavailable', message: error instanceof Error ? error.message : 'Omoluabi Paul unavailable' });
    });
    return;
  }
  if (type !== 'speak' || !id || typeof text !== 'string' || !text.trim()) return;
  const requestGeneration = generation;
  const previous = synthesisQueue;
  let release;
  synthesisQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    if (requestGeneration !== generation) return;
    const tts = await getEngine();
    if (requestGeneration !== generation) return;
    if (!clonedVoice) throw new Error('Omoluabi Paul is not ready');
    const key = text.trim();
    const cached = speechCache.get(key);
    if (cached) { const buffer = cached.slice(0); self.postMessage({ type: 'audio', id, buffer, mime: 'audio/wav', engine, voiceSource }, [buffer]); return; }
    const chunks = [];
    await tts.generate(text.trim(), { voice: clonedVoice, onChunk: (audio) => chunks.push(new Float32Array(audio)) });
    if (requestGeneration !== generation) return;
    if (!chunks.length) throw new Error('Omoluabi Paul produced no audio');
    const buffer = wavBuffer(chunks, Number(tts.sampleRate) || TARGET_RATE);
    speechCache.set(key, buffer.slice(0));
    if (speechCache.size > 8) speechCache.delete(speechCache.keys().next().value);
    self.postMessage({ type: 'audio', id, buffer, mime: 'audio/wav', engine, voiceSource }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Omoluabi Paul generation failed' });
  } finally { release(); }
};
