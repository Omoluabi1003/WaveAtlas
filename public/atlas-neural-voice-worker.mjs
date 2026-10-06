let ttsPromise = null;
let engine = 'loading';

async function createEngine() {
  const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
  const model = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  if (hasWebGpu) {
    try {
      const tts = await KokoroTTS.from_pretrained(model, { device: 'webgpu', dtype: 'q4f16' });
      engine = 'webgpu';
      return tts;
    } catch {
      // Safari/WebGPU support varies. WASM remains the compatibility path.
    }
  }
  const tts = await KokoroTTS.from_pretrained(model, { device: 'wasm', dtype: 'q8' });
  engine = 'wasm';
  return tts;
}

function getEngine() {
  if (!ttsPromise) ttsPromise = createEngine();
  return ttsPromise;
}

self.onmessage = async (event) => {
  const { type, id, text } = event.data || {};
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
    const audio = await tts.generate(text.trim(), { voice: 'af_heart', speed: 1.03 });
    const blob = audio.toBlob();
    const buffer = await blob.arrayBuffer();
    self.postMessage({ type: 'audio', id, buffer, mime: blob.type || 'audio/wav', engine }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Neural voice generation failed' });
  }
};
