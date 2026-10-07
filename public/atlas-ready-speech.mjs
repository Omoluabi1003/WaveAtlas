// Compact prepared mono PCM. Only a lightweight asset read is needed to speak.
export const READY_SPEECH_VERSION = 'paul-ready-20261007-v1';
const MAGIC = 'ATLASSP1';
const MAX_SAMPLES = 24000 * 600;

export function encodeReadySpeech(metadata, clips) {
  let offset = 0;
  const manifest = { ...metadata, format: 1, sampleRate: 24000, clips: clips.map(clip => {
    if (!(clip.samples instanceof Float32Array) || !clip.samples.length) throw new Error('Empty prepared reply');
    let peak = 1;
    for (const sample of clip.samples) { if (!Number.isFinite(sample)) throw new Error('Invalid prepared samples'); peak = Math.max(peak, Math.abs(sample)); }
    const entry = { id: clip.id, text: clip.text, offset, length: clip.samples.length, scale: 1 / peak };
    offset += clip.samples.length; return entry;
  }) };
  if (offset > MAX_SAMPLES) throw new Error('Prepared speech exceeds limit');
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const start = Math.ceil((12 + json.length) / 4) * 4;
  const buffer = new ArrayBuffer(start + offset * 2), view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode(MAGIC));
  view.setUint32(8, json.length, true); new Uint8Array(buffer).set(json, 12);
  clips.forEach((clip, index) => { const entry = manifest.clips[index]; for (let n = 0; n < clip.samples.length; n++) view.setInt16(start + (entry.offset + n) * 2, Math.max(-32768, Math.min(32767, Math.round(clip.samples[n] * entry.scale * 32767))), true); });
  return buffer;
}

export function decodeReadySpeech(buffer, expected) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16) throw new Error('Invalid prepared speech');
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC) throw new Error('Invalid prepared speech header');
  const size = view.getUint32(8, true), start = Math.ceil((12 + size) / 4) * 4;
  if (size > 128 * 1024 || start > buffer.byteLength) throw new Error('Invalid prepared speech metadata');
  const metadata = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + size)));
  if (metadata.format !== 1 || metadata.sampleRate !== 24000 || !Array.isArray(metadata.clips) || !metadata.clips.length || metadata.clips.length > 128) throw new Error('Invalid prepared speech format');
  for (const [key, value] of Object.entries(expected)) if (metadata[key] !== value) throw new Error('Prepared speech identity mismatch');
  const replies = new Map(); let offset = 0;
  for (const clip of metadata.clips) {
    if (typeof clip.id !== 'string' || typeof clip.text !== 'string' || !clip.text.trim() || replies.has(clip.text) || clip.offset !== offset || !Number.isSafeInteger(clip.length) || clip.length <= 0 || !Number.isFinite(clip.scale) || clip.scale <= 0 || clip.scale > 1) throw new Error('Invalid prepared reply');
    offset += clip.length;
    if (offset > MAX_SAMPLES || start + offset * 2 > buffer.byteLength) throw new Error('Truncated prepared speech');
    const samples = new Float32Array(clip.length);
    for (let n = 0; n < clip.length; n++) samples[n] = view.getInt16(start + (clip.offset + n) * 2, true) / 32767 / clip.scale;
    replies.set(clip.text.trim().replace(/\s+/g, ' '), { samples, sampleRate: 24000 });
  }
  if (start + offset * 2 !== buffer.byteLength) throw new Error('Unexpected prepared speech data');
  return { replies, metadata };
}

export async function loadReadySpeech(expected, fetcher = fetch) {
  const url = `/omoluabi-ready-speech.bin?v=${READY_SPEECH_VERSION}`;
  let cache = null;
  try { if (typeof caches !== 'undefined') cache = await caches.open('waveatlas-ready-speech-v1'); } catch { /* Persistence is optional. */ }
  const read = async response => decodeReadySpeech(await response.arrayBuffer(), expected).replies;
  if (cache) {
    try { const saved = await cache.match(url); if (saved) return await read(saved); }
    catch { try { await cache.delete(url); } catch { /* Recover from the network. */ } }
  }
  const response = await fetcher(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error('Prepared speech unavailable');
  const saved = cache ? response.clone() : null;
  const replies = await read(response);
  if (cache && saved) try { await cache.put(url, saved); } catch { /* Playback remains available. */ }
  return replies;
}
