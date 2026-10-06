let ttsPromise = null;
let clonedVoice = null;
let engine = 'pocket-tts';
const DB_NAME = 'waveatlas-atlas-voice-v1';
const STORE = 'references';
const VOICE_KEY = 'omoluabi-paul';

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

async function loadReference() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(VOICE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read enrolled voice'));
    });
  } finally { db.close(); }
}

async function createEngine() {
  const { PocketTTS } = await import('https://cdn.jsdelivr.net/npm/pocket-tts-js@0.1.0/+esm');
  const tts = new PocketTTS({ language: 'english_2026-04', quantized: true, voiceCloning: true, maxThreads: 2 });
  await tts.load();
  const saved = await loadReference();
  if (!saved?.pcm) throw new Error('Omoluabi Paul is not enrolled on this device');
  const pcm = saved.pcm instanceof Float32Array ? saved.pcm : new Float32Array(saved.pcm);
  clonedVoice = await tts.cloneVoice(pcm, { inputSampleRate: Number(saved.sampleRate) || 24000, name: 'Omoluabi Paul' });
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
    try { const tts = await getEngine(); self.postMessage({ type: 'ready', engine, voice: 'Omoluabi Paul', sampleRate: tts.sampleRate }); }
    catch (error) { ttsPromise = null; clonedVoice = null; self.postMessage({ type: 'unavailable', message: error instanceof Error ? error.message : 'Omoluabi Paul unavailable' }); }
    return;
  }
  if (type !== 'speak' || !id || typeof text !== 'string' || !text.trim()) return;
  try {
    const tts = await getEngine(); if (!clonedVoice) throw new Error('Omoluabi Paul is not enrolled');
    const chunks = [];
    await tts.generate(text.trim(), { voice: clonedVoice, onChunk: (audio) => chunks.push(new Float32Array(audio)) });
    const buffer = wavBuffer(chunks, Number(tts.sampleRate) || 24000);
    self.postMessage({ type: 'audio', id, buffer, mime: 'audio/wav', engine }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Omoluabi Paul generation failed' });
  }
};
