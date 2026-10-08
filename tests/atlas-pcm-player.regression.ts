import assert from 'node:assert/strict';
import { AtlasPCMPlayer, speechGain, confirmationSpeechGain, speechPeakCurve } from '../lib/atlas-pcm-player';

function context() {
  const sources: any[] = [], gains: any[] = [], buffers: any[] = [], limiters: any[] = [];
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
    createWaveShaper() { const limiter = { ...node(), curve: null as Float32Array | null, oversample: '' }; limiters.push(limiter); return limiter; },
    createGain() { const gain = { ...node(), gain: { value: 0 } }; gains.push(gain); return gain; },
  };
  return { audio: audio as unknown as AudioContext, advanceTo: (seconds: number) => { audio.currentTime = seconds; }, sources, gains, buffers, limiters };
}

async function main() {
  const quiet = new Float32Array([0.03, -0.03]);
  assert.ok(speechGain(quiet) > 1, 'Quiet output must receive gain');
  assert.ok(speechGain(new Float32Array([20, -20])) * 20 <= 0.94, 'Peak protection must also handle out-of-range model output');
  assert.equal(speechGain(new Float32Array(8)), 1);
  assert.throws(() => speechGain(new Float32Array([NaN])));

  const mock = context(); let started = 0;
  const player = new AtlasPCMPlayer(mock.audio, () => { started++; });
  const first = new Float32Array(5760).fill(0.03), second = new Float32Array(5760).fill(-0.3);
  player.push(first, 24000);
  mock.advanceTo(8);
  player.push(second, 24000);
  mock.advanceTo(15);
  const third = new Float32Array(5760).fill(0.05);
  player.push(third, 24000);
  assert.equal(mock.sources.length, 0, 'Generation slower than playback must not start a reply that will underrun');
  assert.equal(started, 0, 'Buffering must not report speaking');
  const complete = new Float32Array(first.length + second.length + third.length);
  complete.set(first); complete.set(second, first.length); complete.set(third, first.length + second.length);
  const playback = player.finish();
  assert.equal(player.finish(), playback, 'Repeated completion must share the same audible playback');
  assert.equal(started, 1);
  assert.equal(mock.sources.length, 1, 'A complete reply must use one source with no chunk scheduling gaps');
  assert.ok(mock.sources[0].startAt >= mock.audio.currentTime);
  assert.deepEqual(mock.buffers[0].getChannelData(0), complete, 'Buffering and gain must preserve every sample in order');
  for (const source of mock.sources) { assert.equal(source.playbackRate.value, 1); assert.equal(source.buffer.sampleRate, 24000); }
  assert.equal(mock.gains.length, 1, 'Loudness must remain consistent across former chunk boundaries');
  assert.equal(mock.gains[0].gain.value, speechGain(complete));
  let settled = false;
  const finished = playback.then(played => { settled = true; return played; });
  await Promise.resolve(); assert.equal(settled, false, 'Generation completion must wait for audible playback');
  mock.sources[0].onended(); assert.equal(await finished, true);
  assert.equal((player.analyser as any).disconnected, true);

  const confirmation = context();
  const clear = new AtlasPCMPlayer(confirmation.audio, () => {}, true);
  const spoken = new Float32Array([0.06, -0.06, 0.8, -0.8]);
  clear.push(spoken, 24000); const confirmationEnd = clear.finish();
  assert.equal(confirmation.gains[0].gain.value, confirmationSpeechGain(spoken));
  assert.equal(confirmation.limiters[0].oversample, '4x');
  assert.deepEqual(confirmation.buffers[0].getChannelData(0), spoken, 'Reference PCM must not be rewritten for louder confirmations');
  const curve = speechPeakCurve();
  assert.ok(curve.every(value => Math.abs(value) < 0.94));
  assert.equal(curve[(curve.length - 1) / 2], 0);
  for (let n = 1; n < curve.length; n++) assert.ok(curve[n] >= curve[n - 1]);
  confirmation.sources[0].onended(); assert.equal(await confirmationEnd, true);
  assert.equal(confirmation.limiters[0].disconnected, true);

  const small = context(); const short = new AtlasPCMPlayer(small.audio, () => {});
  short.push(quiet, 24000); const shortFinish = short.finish();
  assert.equal(small.sources.length, 1, 'A complete short cached response must play immediately');
  small.sources[0].onended(); assert.equal(await shortFinish, true);
  const stopping = context(); const interrupted = new AtlasPCMPlayer(stopping.audio, () => {});
  interrupted.push(first, 24000); interrupted.push(second, 24000);
  const stopFinish = interrupted.finish(); interrupted.stop();
  assert.equal(await stopFinish, false);
  assert.ok(stopping.sources.every(source => source.stopped && source.disconnected));
  assert.ok(stopping.gains.every(gain => gain.disconnected));
  const preparing = context(); let cancelledStarts = 0;
  const cancelled = new AtlasPCMPlayer(preparing.audio, () => { cancelledStarts++; });
  cancelled.push(first, 24000); cancelled.push(second, 24000); cancelled.stop();
  assert.equal(await cancelled.finish(), false);
  assert.equal(preparing.sources.length, 0, 'Cancelling preparation must never play partial speech');
  assert.equal(cancelledStarts, 0);
  const empty = new AtlasPCMPlayer(context().audio, () => { throw new Error('Empty reply must not start'); });
  assert.equal(await empty.finish(), false);
  assert.throws(() => new AtlasPCMPlayer(context().audio, () => {}).push(quiet, 48000));
  assert.throws(() => new AtlasPCMPlayer(context().audio, () => {}).push(new Float32Array([NaN]), 24000));
  assert.throws(() => player.push(quiet, 24000), /complete/);
  console.log('PCM playback: slow generation without underruns, one continuous source, uniform gain, unchanged samples/pitch/rate, cached replay, audible completion and cancellation passed.');
}
void main();
