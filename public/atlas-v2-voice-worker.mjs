/* Atlas Voice v2: fresh, keyless, client-side Omoluabi Paul voice path.
 * Heavy ONNX inference runs inside this same-origin worker. The runtime is
 * pinned to the published clone-voice 0.2.1 engine. No API key or server-side
 * inference service is used.
 */
import clone from 'https://cdn.jsdelivr.net/npm/clone-voice@0.2.1/dist/index.mjs';

let voice = null;
let loading = null;
let stopped = false;

async function ensureVoice() {
  if (voice) return voice;
  if (!loading) {
    loading = (async () => {
      self.postMessage({ type: 'status', state: 'loading', label: 'Loading Omoluabi Paul' });
      const cloned = await clone('/api/atlas-voice-reference', { lang: 'english_2026-04' });
      voice = cloned;
      self.postMessage({ type: 'ready', state: 'ready', voice: 'Omoluabi Paul', engine: 'clone-voice-0.2.1' });
      return cloned;
    })().catch((error) => {
      loading = null;
      voice = null;
      throw error;
    });
  }
  return loading;
}

self.onmessage = async (event) => {
  const { type, id, text } = event.data || {};
  if (type === 'warm') {
    try { await ensureVoice(); }
    catch (error) { self.postMessage({ type: 'unavailable', state: 'unavailable', message: error instanceof Error ? error.message : 'Omoluabi Paul could not initialize' }); }
    return;
  }
  if (type === 'stop') { stopped = true; try { voice?.stop?.(); } catch {} return; }
  if (type !== 'speak' || !id || typeof text !== 'string' || !text.trim()) return;
  stopped = false;
  try {
    const activeVoice = await ensureVoice();
    if (stopped) return;
    const wav = await activeVoice.speak(text.trim());
    if (stopped) return;
    const buffer = wav instanceof ArrayBuffer ? wav : wav?.buffer;
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 44) throw new Error('Omoluabi Paul returned invalid audio');
    self.postMessage({ type: 'audio', id, buffer, mime: 'audio/wav', voice: 'Omoluabi Paul', engine: 'clone-voice-0.2.1' }, [buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Omoluabi Paul generation failed' });
  }
};
