import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function main() {
  const { decodeReferenceWav } = await import('../public/atlas-reference-audio.mjs');
  const bytes = fs.readFileSync('public/omoluabi-voice-reference.wav');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const reference = decodeReferenceWav(buffer);
  assert.equal(reference.sampleRate, 24000);
  assert.equal(reference.pcm.length, 240000);
  assert.ok(reference.pcm.some((sample: number) => Math.abs(sample) > 0.01));
  assert.throws(() => decodeReferenceWav(new ArrayBuffer(44)));
  const messages: any[] = [];
  let cloned = false, generated = 0;
  class PocketTTS {
    sampleRate = 24000;
    async load(progress: any) { progress({ label: 'Model', loaded: 1, total: 2 }); }
    async cloneVoice(pcm: Float32Array, options: any) { assert.equal(pcm.length, 240000); assert.equal(options.name, 'Omoluabi Paul'); cloned = true; return 'paul-reference'; }
    async generate(_text: string, options: any) { assert.equal(options.voice, 'paul-reference'); generated++; options.onChunk(new Float32Array([0, 0.25, -0.25])); }
    async stop() {} destroy() {}
  }
  const source = fs.readFileSync('public/atlas-neural-voice-worker.mjs', 'utf8')
    .replace("await import('./vendor/pocket-tts-js/index.js')", 'sdk')
    .replace("await import('./atlas-reference-audio.mjs')", 'decoder');
  const context: any = { sdk: { PocketTTS }, decoder: { decodeReferenceWav }, fetch: async (url: string) => { assert.equal(url, '/omoluabi-voice-reference.wav'); return { ok: true, arrayBuffer: async () => buffer }; }, self: { postMessage: (message: any) => messages.push(message) }, Float32Array, ArrayBuffer, DataView, Uint8Array, Map, Promise, Error };
  vm.runInNewContext(source, context);
  await context.self.onmessage({ data: { type: 'warm' } });
  for (let n = 0; n < 6; n++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(cloned);
  assert.equal(messages[0].type, 'loading');
  assert.ok(messages.some(message => message.type === 'ready' && message.voiceSource === 'repository-canonical'));
  await context.self.onmessage({ data: { type: 'speak', id: 'one', text: 'Welcome to WaveAtlas.' } });
  await context.self.onmessage({ data: { type: 'speak', id: 'two', text: 'Welcome to WaveAtlas.' } });
  assert.equal(generated, 1, 'Repeated phrases reuse personal voice audio');
  assert.equal(messages.filter(message => message.type === 'audio').length, 2);
  const sdk = fs.readFileSync('public/vendor/pocket-tts-js/index.js', 'utf8');
  assert.match(sdk, /new URL\("\.\/worker.js", import.meta.url\)/);
  for (const file of ['worker.js', 'tokenizer.js', 'binary.js', 'player.js', 'LICENSE']) assert.ok(fs.existsSync(`public/vendor/pocket-tts-js/${file}`));
  console.log('Omoluabi primary voice: real reference PCM, clone identity, readiness, generation, cache and local worker assets passed.');
}
void main();
