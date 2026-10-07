import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readyAtlasReply, ATLAS_READY_REPLIES, atlasStationVoicePhrases } from '../lib/atlas-ready-replies';
import { answerAtlasIntelligently } from '../lib/atlas-intelligence';

async function main() {
  const codec = await import(new URL('../public/atlas-ready-speech.mjs', import.meta.url).href);
  const store = await import(new URL('../public/atlas-voice-store.mjs', import.meta.url).href);
  const bytes = fs.readFileSync('public/omoluabi-ready-speech.bin');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const expected = { version: codec.READY_SPEECH_VERSION, referenceSha: store.REFERENCE_SHA, modelRevision: store.MODEL_REVISION, voiceCacheVersion: store.VOICE_CACHE_VERSION, engine: 'pocket-tts-omoluabi-paul', voiceSource: 'repository-canonical' };
  const { replies, metadata } = codec.decodeReadySpeech(buffer, expected);
  const provenance = JSON.parse(fs.readFileSync('docs/omoluabi-ready-speech-provenance.json', 'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.sha256);
  assert.equal(createHash('sha256').update(fs.readFileSync('public/omoluabi-voice-profile.bin')).digest('hex'), metadata.profileSha256);
  assert.equal(replies.size, ATLAS_READY_REPLIES.length);
  for (const reply of ATLAS_READY_REPLIES) {
    const audio = replies.get(reply.text);
    assert.ok(audio, `Missing real prepared reply: ${reply.id}`);
    assert.equal(audio.sampleRate, 24000);
    assert.ok(audio.samples.length >= 24000 * 0.5 && audio.samples.length < 24000 * 30);
    assert.ok(audio.samples.some((sample: number) => Math.abs(sample) > 0.01));
    assert.ok(audio.samples.every(Number.isFinite));
  }
  const original = new Float32Array([0, 0.001, 0.2, -0.3, 1.4, -1.8]);
  const encoded = codec.encodeReadySpeech(expected, [{ id: 'test', text: 'Codec test.', samples: original }]);
  const restored = codec.decodeReadySpeech(encoded, expected).replies.get('Codec test.').samples;
  original.forEach((sample, index) => assert.ok(Math.abs(sample - restored[index]) <= 1.8 / 32767, 'PCM16 scaling must preserve the waveform without clipping or pitch changes'));
  assert.throws(() => codec.decodeReadySpeech(buffer.slice(0, -2), expected));
  assert.throws(() => codec.decodeReadySpeech(buffer, { ...expected, referenceSha: 'another-speaker' }));
  assert.throws(() => codec.encodeReadySpeech(expected, [{ id: 'bad', text: 'Invalid.', samples: new Float32Array([NaN]) }]));

  for (const question of ['Hello Atlas', 'Thank you', 'What can you do?', 'What am I listening to?', 'Something I do not understand']) {
    const reply = answerAtlasIntelligently(question);
    assert.ok(replies.has(readyAtlasReply(reply.answer)), `A routine response must ship ready audio: ${question}`);
  }
  const cases = ['pause', 'resume', 'mute', 'volume 60', 'turn it up', 'turn it down', 'open the map', 'open the globe', 'open settings', 'open the Brief', 'surprise me', 'teleport'];
  for (const question of cases) {
    const reply = answerAtlasIntelligently(question);
    assert.ok(reply.action, `Expected command: ${question}`);
    assert.ok(replies.has(readyAtlasReply(reply.answer, reply.action, { ok: true, status: 'completed' })), `Command confirmation must bypass inference: ${question}`);
    assert.equal(readyAtlasReply(reply.answer, reply.action, undefined), null, 'Unknown action outcomes must not claim completion');
    assert.equal(readyAtlasReply(reply.answer, reply.action, false), ATLAS_READY_REPLIES.find(reply => reply.id === 'failed')!.text);
  }
  const play = answerAtlasIntelligently('Play Premier FM');
  for (const status of ['playing', 'connecting', 'already_playing'] as const) {
    const speech = readyAtlasReply('Named station result.', play.action, { ok: true, status });
    assert.equal(speech, ATLAS_READY_REPLIES.find(reply => reply.id === status)!.text);
  }
  assert.doesNotMatch(readyAtlasReply('Found a station. Connecting.', play.action, { ok: true, status: 'connecting' })!, /is playing/i);
  assert.equal(readyAtlasReply('No matches.', play.action, { ok: false, status: 'not_found' }), ATLAS_READY_REPLIES.find(reply => reply.id === 'not_found')!.text);
  const search = answerAtlasIntelligently('Find stations in Lagos');
  assert.ok(replies.has(readyAtlasReply('Named search results.', search.action, { ok: true, status: 'completed' })));
  const station = { name: 'Signal FM', country: 'Nigeria', country_code: 'NG', city: 'Lagos', state: '', language: 'English', tags: ['jazz'], codec: 'MP3', bitrate: 128 };
  const contextual = answerAtlasIntelligently('What am I listening to?', { station });
  assert.equal(readyAtlasReply(contextual.answer), null, 'Verified station details must retain their full dynamic wording');
  assert.ok(atlasStationVoicePhrases(station).includes(contextual.answer));

  const buckets = new Map<string, Response>(); let downloads = 0, deletes = 0;
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => ({ match: async (url: string) => buckets.get(url)?.clone(), put: async (url: string, response: Response) => { buckets.set(url, response); }, delete: async (url: string) => { deletes++; return buckets.delete(url); } }) } });
  const fetcher = async (url: string) => { assert.equal(url, `/omoluabi-ready-speech.bin?v=${codec.READY_SPEECH_VERSION}`); downloads++; return new Response(new Uint8Array(buffer)); };
  assert.equal((await codec.loadReadySpeech(expected, fetcher)).size, 28);
  assert.equal((await codec.loadReadySpeech(expected, async () => { throw new Error('Offline'); })).size, 28);
  assert.equal(downloads, 1, 'Reloads must reuse prepared audio offline');
  buckets.set(`/omoluabi-ready-speech.bin?v=${codec.READY_SPEECH_VERSION}`, new Response('corrupt-cache'));
  assert.equal((await codec.loadReadySpeech(expected, fetcher)).size, 28);
  assert.equal(deletes, 1, 'Invalid cached audio must be replaced by the canonical package');
  Object.defineProperty(globalThis, 'caches', { configurable: true, get: () => { throw new Error('Storage denied'); } });
  assert.equal((await codec.loadReadySpeech(expected, fetcher)).size, 28, 'Blocked storage must not disable prepared replies');
  const assistant = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');
  assert.match(assistant, /window\.setTimeout\(\(\) => warmVoiceRef\.current\(\), 100\)/);
  assert.match(assistant, /answerAtlasIntelligently\(value, \{ station, history \}\)/);
  assert.doesNotMatch(assistant, /fetch\('\/api\/atlas-assistant'/);
  assert.doesNotMatch(assistant, /setVoiceMessage\('Preparing|Downloading voice model/);
  console.log('Ready Omoluabi speech: real audio/provenance, waveform fidelity, all routine intents, verified outcomes, dynamic facts, early preload, cache recovery and offline/denied storage passed.');
}
void main();
