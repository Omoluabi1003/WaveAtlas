import assert from 'node:assert/strict';
import fs from 'node:fs';
import { confirmationSpeechGain, speechGain, speechPeakCurve } from '../lib/atlas-pcm-player';

async function main() {
  const { decodeReadySpeech } = await import(new URL('../public/atlas-ready-speech.mjs', import.meta.url).href);
  const bytes = fs.readFileSync('public/omoluabi-ready-speech.bin');
  const { replies } = decodeReadySpeech(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {});
  const curve = speechPeakCurve();
  // WaveShaperNode interpolates its curve and clamps out-of-range inputs.
  const shape = (input: number) => {
    const index = (Math.min(1, Math.max(-1, input)) + 1) * (curve.length - 1) / 2;
    const low = Math.floor(index), high = Math.min(curve.length - 1, low + 1);
    return curve[low] + (curve[high] - curve[low]) * (index - low);
  };
  for (const text of ['Your station is playing.', 'I found your station. Connecting now.', 'You’re already listening to that station.']) {
    const audio = replies.get(text)!;
    assert.ok(audio.samples.length > 24000);
    const beforeGain = speechGain(audio.samples), afterGain = confirmationSpeechGain(audio.samples);
    let beforeSum = 0, afterSum = 0, peak = 0;
    for (const sample of audio.samples) {
      const before = sample * beforeGain, after = shape(sample * afterGain);
      beforeSum += before * before; afterSum += after * after; peak = Math.max(peak, Math.abs(after));
    }
    const increaseDb = 10 * Math.log10(afterSum / beforeSum);
    assert.ok(increaseDb >= 2, `Confirmation must be meaningfully louder: ${text}`);
    assert.ok(peak < 0.94, 'Soft limiter must preserve peak headroom');
    console.log(`${text} +${increaseDb.toFixed(2)} dB RMS, peak ${peak.toFixed(3)} (signal-level estimate; excludes browser oversampling).`);
  }
}
void main();
