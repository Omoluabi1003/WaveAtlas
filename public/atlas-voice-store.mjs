// Version the reference + encoder configuration so old speech cannot survive a voice change.
export const MODEL_REVISION = 'c469236dbc5f68287fa2fbf175b66de3b80123af';
export const REFERENCE_SHA = 'f29df38fcbd0901bf752d64b00030edd6495385d';
export const VOICE_CACHE_VERSION = 'paul-f29df38-pcm-v3-prepared-c469236';
const DATABASE = 'waveatlas-personal-voice-cache';
const STORE = 'artifacts';
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_AUDIO_ENTRIES = 64;

async function transact(mode, action) {
  if (typeof indexedDB === 'undefined') return null;
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value = null;
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      action(tx.objectStore(STORE), next => { value = next; });
    });
  } finally { db.close(); }
}

async function read(key) {
  try {
    return await transact('readonly', (store, result) => {
      const request = store.get(key);
      request.onsuccess = () => result(request.result?.data || null);
    });
  } catch { return null; }
}
async function write(key, data, bytes = 0) {
  try {
    return Boolean(await transact('readwrite', (store, result) => {
      store.put({ data, bytes, used: Date.now() }, key);
      result(true);
    }));
  } catch { return false; }
}
export function loadVoiceProfile() { return read(`profile:${VOICE_CACHE_VERSION}`); }
export function saveVoiceProfile(profile) { return write(`profile:${VOICE_CACHE_VERSION}`, profile); }
export async function deleteVoiceProfile() {
  try { await transact('readwrite', store => store.delete(`profile:${VOICE_CACHE_VERSION}`)); } catch { /* Storage is optional. */ }
}
const speechKey = text => `audio:${VOICE_CACHE_VERSION}:${text.trim().replace(/\s+/g, ' ')}`;
export function loadSpeech(text) { return read(speechKey(text)); }
export async function saveSpeech(text, audio) {
  if (!(audio.samples instanceof Float32Array) || audio.samples.byteLength > MAX_AUDIO_BYTES) return false;
  const saved = await write(speechKey(text), audio, audio.samples.byteLength);
  if (!saved) return false;
  try {
    await transact('readwrite', store => {
      const entries = [];
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (item) { if (String(item.key).startsWith('audio:')) entries.push({ key: item.key, bytes: item.value.bytes || 0, used: item.value.used || 0 }); item.continue(); return; }
        entries.sort((a, b) => b.used - a.used);
        let bytes = 0;
        entries.forEach((entry, index) => { bytes += entry.bytes; if (index >= MAX_AUDIO_ENTRIES || bytes > MAX_AUDIO_BYTES) store.delete(entry.key); });
      };
    });
  } catch { /* A full cache must not prevent playback. */ }
  return true;
}
