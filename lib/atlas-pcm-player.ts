// Buffer a complete reply before playback: local synthesis can be slower than
// real time, so a fixed streaming threshold cannot guarantee continuous speech.
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
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private pending: Float32Array[] = [];
  private sampleCount = 0;
  private ended = false;
  private stopped = false;
  private completion: Promise<boolean> | null = null;
  private resolveEnd: ((played: boolean) => void) | null = null;
  private hasAudio = false;

  constructor(private context: AudioContext, private onStart: () => void) {
    this.analyser = context.createAnalyser();
    this.analyser.connect(context.destination);
  }
  push(samples: Float32Array, sampleRate: number) {
    if (this.stopped) return;
    if (this.ended) throw new Error('Personal voice response is already complete');
    if (sampleRate !== 24000 || !samples.length) throw new Error('Unexpected personal voice sample rate');
    for (const sample of samples) if (!Number.isFinite(sample)) throw new Error('Invalid voice samples');
    this.pending.push(samples); this.sampleCount += samples.length;
  }
  finish() {
    if (this.completion) return this.completion;
    this.ended = true;
    this.completion = new Promise<boolean>((resolve, reject) => {
      this.resolveEnd = resolve;
      if (this.stopped || !this.sampleCount) { this.settle(); return; }
      try {
        const buffer = this.context.createBuffer(1, this.sampleCount, 24000);
        const samples = buffer.getChannelData(0);
        let offset = 0;
        for (const chunk of this.pending) { samples.set(chunk, offset); offset += chunk.length; }
        this.pending = []; this.sampleCount = 0;
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        this.source = source; this.gain = gain;
        // One gain for the whole utterance prevents volume jumps between chunks.
        gain.gain.value = speechGain(samples);
        source.buffer = buffer;
        source.playbackRate.value = 1;
        source.connect(gain); gain.connect(this.analyser);
        source.onended = () => { this.disconnect(); this.settle(); };
        source.start(this.context.currentTime);
        this.hasAudio = true; this.onStart();
      } catch (error) {
        this.stopped = true; this.resolveEnd = null;
        this.disconnect(true); this.analyser.disconnect(); reject(error);
      }
    });
    return this.completion;
  }
  private disconnect(stop = false) {
    if (this.source) {
      this.source.onended = null;
      if (stop) try { this.source.stop(); } catch { /* Already ended. */ }
      this.source.disconnect(); this.source = null;
    }
    this.gain?.disconnect(); this.gain = null;
    this.pending = []; this.sampleCount = 0;
  }
  private settle() {
    if ((this.ended || this.stopped) && !this.source) {
      this.resolveEnd?.(this.hasAudio && !this.stopped); this.resolveEnd = null;
      this.analyser.disconnect();
    }
  }
  stop() {
    this.stopped = true; this.disconnect(true); this.settle();
  }
}
