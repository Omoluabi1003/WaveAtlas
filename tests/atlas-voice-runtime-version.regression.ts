import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ATLAS_VOICE_RUNTIME_VERSION } from '../lib/atlas-voice-status';

async function main() {
  const root = path.resolve('public');
  const origin = 'https://wave-atlas.test';
  const visited = new Set<string>();
  function inspect(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const imports = [...source.matchAll(/(?:from\s+|import\(['"])(['"]?)(\.\.?\/[^'"\s)]+)['"]/g)];
    for (const match of imports) {
      const dependency = new URL(match[2], `${origin}/${file}`);
      assert.equal(dependency.searchParams.get('v'), ATLAS_VOICE_RUNTIME_VERSION, `Unversioned or incompatible dependency in ${file}: ${match[2]}`);
      inspect(dependency.pathname.slice(1));
    }
  }
  inspect('atlas-neural-voice-worker.mjs');
  inspect('vendor/pocket-tts-js/worker.js');
  assert.ok(visited.has('vendor/pocket-tts-js/index.js'));
  assert.ok(visited.has('vendor/pocket-tts-js/tokenizer.js'));
  assert.ok(visited.has('vendor/pocket-tts-js/voice-state.js'));
  assert.ok(visited.has('vendor/pocket-tts-js/player.js'));
  const assistant = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');
  assert.match(assistant, /new Worker\(`\/atlas-neural-voice-worker\.mjs\?v=\$\{ATLAS_VOICE_RUNTIME_VERSION\}`/);

  // Exercise the actual SDK facade, including the URL used for its nested worker.
  const urls: URL[] = [], requests: any[] = [];
  const profile = { format: 2, tensors: { cache: new Float32Array([0.2]) } };
  class WorkerTransport {
    onmessage: ((event: any) => void) | null = null;
    onerror = null;
    constructor(url: URL) { urls.push(url); }
    postMessage(message: any) {
      requests.push(message);
      const result = message.type === 'importVoice' ? { ref: message.payload.ref } : profile;
      queueMicrotask(() => this.onmessage?.({ data: { id: message.id, type: 'result', result } }));
    }
    terminate() {}
  }
  const moduleUrl = `${origin}/vendor/pocket-tts-js/index.js?v=${ATLAS_VOICE_RUNTIME_VERSION}`;
  const source = fs.readFileSync('public/vendor/pocket-tts-js/index.js', 'utf8')
    .replace(/^export \{.*$/gm, '')
    .replace(/export (const|class|function)/g, '$1')
    .replace(/import\.meta\.url/g, JSON.stringify(moduleUrl));
  const context: any = { URL, Worker: WorkerTransport, Float32Array, Map, Promise, Error };
  vm.runInNewContext(`${source}\nglobalThis.sdk = PocketTTS;`, context);
  const sdk = new context.sdk({ voiceCloning: false });
  assert.equal(await sdk.importVoice(profile, 'Omoluabi Paul'), 'Omoluabi Paul');
  assert.deepEqual(await sdk.exportVoice('Omoluabi Paul'), profile);
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/vendor/pocket-tts-js/worker.js');
  assert.equal(urls[0].searchParams.get('v'), ATLAS_VOICE_RUNTIME_VERSION, 'The nested worker must retain the SDK runtime version');
  assert.deepEqual(requests.map(request => request.type), ['importVoice', 'exportVoice']);
  assert.equal(requests[0].payload.profile, profile);
  console.log('Voice runtime: complete versioned module graph, actual SDK profile interface and nested worker URL passed.');
}
void main();
