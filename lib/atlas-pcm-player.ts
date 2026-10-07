// Direct mono PCM playback avoids WAV encoding/decoding on every response.
export function speechGain(samples: Float32Array) {
  let peak = 0, sum = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) throw new Error('Invalid voice samples');
    peak = Math.max(peak, Math.abs(sample)); sum += sample * sample;
  }
  if (peak < 0.0001) return 1;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return Math.min(6, 0.16 / Math.max(rms, 0.0001), 0.94 / peak);
}

export class AtlasPCMPlayer {
  readonly analyser: AnalyserNode;
  private sources = new Map<AudioBufferSourceNode, GainNode>();
  private pending: Float32Array[] = [];
  private queuedSeconds = 0;
  private nextStart = 0;
  private primed = false;
  private ended = false;
  private stopped = false;
  private rate = 24000;
  private resolveEnd: ((played: boolean) => void) | null = null;
  private hasAudio = false;

  constructor(private context: AudioContext, private onStart: () => void) {
    this.analyser = context.createAnalyser();
    this.analyser.connect(context.destination);
  }
  push(samples: Float32Array, sampleRate: number) {
    if (this.stopped) return;
    if (sampleRate !== 24000 || !samples.length) throw new Error('Unexpected personal voice sample rate');
    this.rate = sampleRate;
    if (!this.primed) {
      this.pending.push(samples); this.queuedSeconds += samples.length / sampleRate;
      if (this.queuedSeconds >= 0.4) this.flush();
    } else this.schedule(samples);
  }
  private flush() {
    if (this.primed || this.stopped) return;
    this.primed = true; this.nextStart = this.context.currentTime + 0.04;
    for (const samples of this.pending) this.schedule(samples);
    this.pending = []; this.queuedSeconds = 0;
  }
  private schedule(samples: Float32Array) {
    const buffer = this.context.createBuffer(1, samples.length, this.rate);
    buffer.getChannelData(0).set(samples);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = speechGain(samples);
    source.buffer = buffer;
    // Pitch and duration follow the model's 24 kHz PCM exactly.
    source.playbackRate.value = 1;
    source.connect(gain); gain.connect(this.analyser);
    const start = Math.max(this.context.currentTime + 0.01, this.nextStart);
    this.nextStart = start + buffer.duration;
    this.sources.set(source, gain);
    source.onended = () => {
      this.sources.delete(source); source.disconnect(); gain.disconnect();
      this.settle();
    };
    source.start(start);
    if (!this.hasAudio) { this.hasAudio = true; this.onStart(); }
  }
  finish() {
    this.ended = true; this.flush();
    return new Promise<boolean>(resolve => { this.resolveEnd = resolve; this.settle(); });
  }
  private settle() {
    if ((this.ended || this.stopped) && this.sources.size === 0) {
      this.resolveEnd?.(this.hasAudio && !this.stopped); this.resolveEnd = null;
      this.analyser.disconnect();
    }
  }
  stop() {
    this.stopped = true; this.pending = []; this.queuedSeconds = 0;
    for (const [source, gain] of this.sources) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); gain.disconnect(); }
    this.sources.clear(); this.settle();
  }
}
