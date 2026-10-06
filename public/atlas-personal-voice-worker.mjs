import { ChatterboxModel, AutoProcessor, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0-next.2/+esm';

const MODEL_ID = 'onnx-community/chatterbox-ONNX';
const DTYPE = {
  wasm: { embed_tokens: 'fp32', speech_encoder: 'fp32', language_model: 'q4', conditional_decoder: 'fp32' },
  webgpu: { embed_tokens: 'fp32', speech_encoder: 'fp32', language_model: 'q4f16', conditional_decoder: 'fp32' },
};

let model = null;
let processor = null;
let speaker = null;
let loading = null;

async function hasWebGPU() {
  if (!self.navigator?.gpu) return false;
  try { return Boolean(await self.navigator.gpu.requestAdapter()); } catch { return false; }
}

async function loadModel() {
  if (model && processor) return;
  if (loading) return loading;
  loading = (async () => {
    const device = await hasWebGPU() ? 'webgpu' : 'wasm';
    self.postMessage({ type: 'status', status: 'loading', device, message: 'Loading private clone engine' });
    processor = await AutoProcessor.from_pretrained(MODEL_ID);
    model = await ChatterboxModel.from_pretrained(MODEL_ID, {
      device,
      dtype: DTYPE[device],
      progress_callback: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    self.postMessage({ type: 'ready', device });
  })();
  try { await loading; } finally { loading = null; }
}

async function enroll(audioData) {
  await loadModel();
  const audio = new Float32Array(audioData);
  const tensor = new Tensor('float32', audio, [1, audio.length]);
  speaker = await model.encode_speech(tensor);
  self.postMessage({ type: 'enrolled' });
}

async function speak(text) {
  await loadModel();
  if (!speaker) throw new Error('Enroll a voice reference before synthesis.');
  const inputs = await processor._call(text);
  const waveform = await model.generate({ ...inputs, ...speaker, exaggeration: 0.48, max_new_tokens: 256 });
  const data = waveform.data;
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  self.postMessage({ type: 'audio', buffer }, [buffer]);
}

self.addEventListener('message', async (event) => {
  const { type, audioData, text } = event.data || {};
  try {
    if (type === 'load') await loadModel();
    else if (type === 'enroll') await enroll(audioData);
    else if (type === 'speak') await speak(String(text || '').slice(0, 220));
    else if (type === 'reset') { speaker = null; self.postMessage({ type: 'reset' }); }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
