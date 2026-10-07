import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function main() {
  const handlers = new Map<string, (event: any) => void>();
  const buckets = new Map<string, Map<string, Response>>();
  const deleted: string[] = [];
  let offline = false;
  const source = fs.readFileSync('public/sw.js', 'utf8');
  const version = source.match(/const SW_VERSION = "([^"]+)"/)![1];
  const staticCache = `${version}-static`;
  const cache = (name: string) => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const entries = buckets.get(name)!;
    return {
      match: async (request: any) => entries.get(typeof request === 'string' ? request : request.url)?.clone(),
      put: async (request: any, response: Response) => { entries.set(request.url, response); },
      addAll: async () => {},
    };
  };
  for (const name of [staticCache, 'waveatlas-sw-v1-static', 'waveatlas-sw-v2-api', 'pocket-tts-js-v1', 'waveatlas-ready-speech-v1', 'unrelated-cache']) cache(name);
  const origin = 'https://wave-atlas.test';
  vm.runInNewContext(source, {
    URL, Response, Date, Promise, Error,
    self: { location: { origin }, clients: { claim: async () => {}, matchAll: async () => [] }, skipWaiting: async () => {}, addEventListener: (type: string, handler: any) => handlers.set(type, handler) },
    caches: { open: async (name: string) => cache(name), keys: async () => [...buckets.keys()], delete: async (name: string) => { deleted.push(name); return buckets.delete(name); } },
    fetch: async () => { if (offline) throw new Error('Offline'); return new Response('current-runtime'); },
  });
  async function fetchEvent(path: string, overrides = {}) {
    const request = { url: new URL(path, origin).href, method: 'GET', destination: 'script', cache: 'default', mode: 'cors', ...overrides };
    let response: Promise<Response> | undefined;
    handlers.get('fetch')!({ request, respondWith: (value: Promise<Response>) => { response = value; } });
    return response ? (await response).text() : null;
  }
  for (const path of ['/vendor/pocket-tts-js/index.js', '/vendor/pocket-tts-js/worker.js', '/vendor/pocket-tts-js/voice-state.js', '/atlas-neural-voice-worker.mjs?v=release', '/atlas-voice-profile.mjs?v=release', '/atlas-voice-store.mjs?v=release', '/atlas-reference-audio.mjs?v=release', '/atlas-ready-speech.mjs?v=release']) {
    buckets.get(staticCache)!.set(new URL(path, origin).href, new Response('obsolete-sdk'));
    assert.equal(await fetchEvent(path), 'current-runtime', 'An installed app cache must not return obsolete voice modules before revalidation');
    offline = true;
    assert.equal(await fetchEvent(path), 'current-runtime', 'Offline reuse must retain the exact requested runtime URL');
    offline = false;
  }
  const icon = '/brand/waveatlas-192x192.png';
  buckets.get(staticCache)!.set(new URL(icon, origin).href, new Response('cached-icon'));
  assert.equal(await fetchEvent(icon), 'cached-icon', 'Ordinary assets retain fast cached loading');
  assert.equal(await fetchEvent('/radio.mp3', { destination: 'audio' }), null);
  assert.equal(await fetchEvent('https://huggingface.co/model.onnx'), null, 'The SDK owns model caching');
  assert.equal(await fetchEvent('/vendor/pocket-tts-js/index.js', { method: 'POST' }), null);
  assert.equal(await fetchEvent('/vendor/pocket-tts-js/index.js', { cache: 'only-if-cached' }), null);
  let activation!: Promise<void>;
  handlers.get('activate')!({ waitUntil: (promise: Promise<void>) => { activation = promise; } });
  await activation;
  assert.deepEqual(deleted.sort(), ['waveatlas-sw-v1-static', 'waveatlas-sw-v2-api']);
  assert.ok(buckets.has('pocket-tts-js-v1'), 'App updates must preserve downloaded generation models');
  assert.ok(buckets.has('waveatlas-ready-speech-v1'), 'App updates must preserve prepared replies');
  assert.ok(buckets.has('unrelated-cache'));
  assert.ok(buckets.has(staticCache));
  console.log('Voice service worker: fresh module loading, offline fallback, app-only cleanup and model cache preservation passed.');
}
void main();
