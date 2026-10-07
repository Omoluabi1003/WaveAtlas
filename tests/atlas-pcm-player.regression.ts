import assert from 'node:assert/strict';
import { AtlasPCMPlayer, speechGain } from '../lib/atlas-pcm-player';

function context() {
  const sources: any[] = [], gains: any[] = [], buffers: any[] = [];
  const node = () => ({ disconnected: false, connect() {}, disconnect() { this.disconnected = true; } });
  const audio = {
    currentTime: 2, destination: {},
    createAnalyser: node,
    createBuffer(channels: number, length: number, rate: number) {
      const data = new Float32Array(length);
      const buffer = { channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => data };
      buffers.push(buffer); return buffer;
    },
    createBufferSource() {
      const source = { ...node(), buffer: null as any, playbackRate: { value: 0 }, onended: null as (() => void) | null, startAt: -1, stopped: false,
        start(at: number) { this.startAt = at; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
    createGain() { const gain = { ...node(), gain: { value: 0 } }; gains.push(gain); return gain; },
  };
  return { audio: audio as unknown as AudioContext, sources, gains, buffers };
}

async function main() {
  const quiet = new Float32Array([0.03, -0.03]);
  assert.ok(speechGain(quiet) > 1, 'Quiet output must receive gain');
  assert.ok(speechGain(new Float32Array([20, -20])) * 20 <= 0.94, 'Peak protection must also handle out-of-range model output');
  assert.equal(speechGain(new Float32Array(8)), 1);
  assert.throws(() => speechGain(new Float32Array([NaN])));

  const mock = context(); let started = 0;
  const player = new AtlasPCMPlayer(mock.audio, () => { started++; });
  const first = new Float32Array(5760).fill(0.03), second = new Float32Array(5760).fill(-0.03);
  player.push(first, 24000);
  assert.equal(mock.sources.length, 0, 'Small priming buffer must absorb initial streaming jitter');
  player.push(second, 24000);
  assert.equal(started, 1);
  assert.equal(mock.sources.length, 2, 'Streaming must schedule audio before finish');
  assert.equal(mock.sources[1].startAt, mock.sources[0].startAt + first.length / 24000);
  assert.deepEqual(mock.buffers[0].getChannelData(0), first, 'Gain must not modify the recorded waveform');
  for (const source of mock.sources) { assert.equal(source.playbackRate.value, 1); assert.equal(source.buffer.sampleRate, 24000); }
  assert.ok(mock.gains[0].gain.value > 1);
  let settled = false;
  const finished = player.finish().then(played => { settled = true; return played; });
  await Promise.resolve(); assert.equal(settled, false, 'Generation completion must wait for audible playback');
  mock.sources[0].onended(); await Promise.resolve(); assert.equal(settled, false);
  mock.sources[1].onended(); assert.equal(await finished, true);
  assert.equal((player.analyser as any).disconnected, true);

  const small = context(); const short = new AtlasPCMPlayer(small.audio, () => {});
  short.push(quiet, 24000); const shortFinish = short.finish();
  assert.equal(small.sources.length, 1, 'A short cached response must flush without the streaming threshold');
  small.sources[0].onended(); assert.equal(await shortFinish, true);
  const stopping = context(); const interrupted = new AtlasPCMPlayer(stopping.audio, () => {});
  interrupted.push(first, 24000); interrupted.push(second, 24000);
  const stopFinish = interrupted.finish(); interrupted.stop();
  assert.equal(await stopFinish, false);
  assert.ok(stopping.sources.every(source => source.stopped && source.disconnected));
  assert.ok(stopping.gains.every(gain => gain.disconnected));
  assert.throws(() => new AtlasPCMPlayer(context().audio, () => {}).push(quiet, 48000));
  console.log('PCM playback: early scheduling, unchanged samples/pitch/rate, loudness, peak limits, short replay, audible completion and interruption passed.');
}
void main();
