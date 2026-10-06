let ttsPromise = null;
let engine = 'loading';

const ALLOWED_VOICES = new Set(['af_bella', 'af_nicole', 'am_michael', 'am_fenrir', 'bf_emma', 'bm_fable', 'af_heart']);

async function createEngine() {
  const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
  const model = 'onnx-community/Kokoro-82M-v1.0-ONNX';

  // Reliability is more important than benchmark speed for a spoken assistant.
  // Kokoro's current WebGPU vocoder path has device/backend-specific failures,
  // while the q8 WASM model is compact and consistent across modern browsers.
  const tts = await KokoroTTS.from_pretrained(model, { device: 'wasm', dtype: 'q8' });
  engine = 'wasm-q8';
  return tts;
}

function getEngine() {
  if (!ttsPromise) ttsPromise = createEngine();
  return ttsPromise;
}

self.onmessage = async (event) => {
  const { type, id, text, voice, speed } = event.data || {};
  if (type === 'warm') {
    try {
      await getEngine();
      self.postMessage({ type: 'ready', engine });
    } catch (error) {
      ttsPromise = null;
      self.postMessage({ type: 'unavailable', message: error instanceof Error ? error.message : 'Neural voice unavailable' });
    }
    return;
  }
  if (type !== 'speak' || !id || typeof text !== 'string' || !text.trim()) return;
  try {
    const tts = await getEngine();
    const selectedVoice = ALLOWED_VOICES.has(voice) ? voice : 'af_bella';
    const selectedSpeed = typeof speed === 'number' ? Math.min(1.12, Math.max(0.88, speed)) : 1;
    const audio = await tts.generate(text.trim(), { voice: selectedVoice, speed: selectedSpeed });
    const blob = audio.toBlob();
    const buffer = await blob.arrayBuffer();
    self.postMessage({ type: 'audio', id, buffer, mime: blob.type || 'audio/wav', engine, voice: selectedVoice }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Neural voice generation failed' });
  }
};