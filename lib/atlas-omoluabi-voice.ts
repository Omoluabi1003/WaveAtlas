import { AtlasPocketTTS, type PocketProgress } from '@/lib/atlas-pocket-client';

export type OmoluabiVoiceState = 'idle' | 'loading' | 'cloning' | 'ready' | 'speaking' | 'unavailable';
export type OmoluabiVoiceStatus = { state: OmoluabiVoiceState; progress?: number; detail?: string };

type StatusListener = (status: OmoluabiVoiceStatus) => void;
type EnergyListener = (energy: number) => void;

export class OmoluabiPaulVoice {
  private tts: AtlasPocketTTS | null = null;
  private voiceRef: string | null = null;
  private preparePromise: Promise<boolean> | null = null;
  private audioContext: AudioContext | null = null;
  private scheduled: AudioBufferSourceNode[] = [];
  private nextStartTime = 0;
  private statusListener: StatusListener | null = null;
  private energyListener: EnergyListener | null = null;
  private state: OmoluabiVoiceState = 'idle';

  constructor(onStatus?: StatusListener, onEnergy?: EnergyListener) {
    this.statusListener = onStatus || null;
    this.energyListener = onEnergy || null;
  }

  get currentState() { return this.state; }
  get ready() { return this.state === 'ready' || this.state === 'speaking'; }

  private setStatus(status: OmoluabiVoiceStatus) {
    this.state = status.state;
    this.statusListener?.(status);
  }

  private progress(info: PocketProgress) {
    if (info.total && typeof info.loaded === 'number') {
      const progress = Math.max(0, Math.min(1, info.loaded / info.total));
      this.setStatus({ state: 'loading', progress, detail: info.label || info.status || 'Loading local voice model' });
    } else if (info.status) {
      this.setStatus({ state: 'loading', detail: info.status });
    }
  }

  async primeAudio() {
    if (typeof window === 'undefined') return false;
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return false;
    if (!this.audioContext || this.audioContext.state === 'closed') this.audioContext = new AudioCtor({ latencyHint: 'interactive' });
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    return this.audioContext.state === 'running';
  }

  prepare() {
    if (this.ready) return Promise.resolve(true);
    if (this.preparePromise) return this.preparePromise;
    this.preparePromise = this.prepareInternal().finally(() => { this.preparePromise = null; });
    return this.preparePromise;
  }

  private async prepareInternal() {
    try {
      this.setStatus({ state: 'loading', progress: 0, detail: 'Preparing Omoluabi Paul locally' });
      this.tts = new AtlasPocketTTS();
      await this.tts.load((info) => this.progress(info));

      this.setStatus({ state: 'cloning', detail: 'Building Omoluabi Paul voice profile' });
      const response = await fetch('/api/atlas-voice-reference', { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Voice reference unavailable (${response.status})`);
      if (!await this.primeAudio() || !this.audioContext) throw new Error('Audio output unavailable');
      const decoded = await this.audioContext.decodeAudioData(await response.arrayBuffer());
      const channel = decoded.getChannelData(0);
      this.voiceRef = await this.tts.cloneVoice(channel, decoded.sampleRate);
      this.setStatus({ state: 'ready', progress: 1, detail: 'Omoluabi Paul ready' });
      return true;
    } catch (error) {
      this.tts?.destroy();
      this.tts = null;
      this.voiceRef = null;
      this.setStatus({ state: 'unavailable', detail: error instanceof Error ? error.message : 'Omoluabi Paul unavailable' });
      return false;
    }
  }

  private playChunk(pcm: Float32Array, sampleRate: number) {
    const context = this.audioContext;
    if (!context || context.state === 'closed' || !pcm.length) return;
    const buffer = context.createBuffer(1, pcm.length, sampleRate);
    buffer.copyToChannel(pcm, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const now = context.currentTime;
    const start = Math.max(now + 0.025, this.nextStartTime || now + 0.025);
    source.start(start);
    this.nextStartTime = start + buffer.duration;
    this.scheduled.push(source);
    source.onended = () => { this.scheduled = this.scheduled.filter((item) => item !== source); };

    let peak = 0;
    const stride = Math.max(1, Math.floor(pcm.length / 256));
    for (let i = 0; i < pcm.length; i += stride) peak = Math.max(peak, Math.abs(pcm[i]));
    this.energyListener?.(Math.min(1, peak * 1.8));
  }

  async speak(text: string) {
    if (!text.trim()) return false;
    if (!this.ready && !await this.prepare()) return false;
    if (!this.tts || !this.voiceRef || !await this.primeAudio()) return false;
    this.setStatus({ state: 'speaking', detail: 'Omoluabi Paul speaking' });
    this.nextStartTime = this.audioContext?.currentTime || 0;
    try {
      await this.tts.generate(text.trim(), this.voiceRef, (audio) => this.playChunk(audio, this.tts?.sampleRate || 24000));
      const remainingMs = this.audioContext ? Math.max(0, (this.nextStartTime - this.audioContext.currentTime) * 1000) : 0;
      if (remainingMs > 0) await new Promise((resolve) => window.setTimeout(resolve, Math.min(remainingMs + 80, 30000)));
      this.energyListener?.(0);
      this.setStatus({ state: 'ready', progress: 1, detail: 'Omoluabi Paul ready' });
      return true;
    } catch (error) {
      this.energyListener?.(0);
      this.setStatus({ state: 'unavailable', detail: error instanceof Error ? error.message : 'Voice generation failed' });
      return false;
    }
  }

  async stop() {
    for (const source of this.scheduled) { try { source.stop(); } catch { /* already ended */ } }
    this.scheduled = [];
    this.nextStartTime = 0;
    this.energyListener?.(0);
    await this.tts?.stop();
    if (this.voiceRef) this.setStatus({ state: 'ready', progress: 1, detail: 'Omoluabi Paul ready' });
  }

  destroy() {
    void this.stop();
    this.tts?.destroy();
    this.tts = null;
    this.voiceRef = null;
    if (this.audioContext && this.audioContext.state !== 'closed') void this.audioContext.close();
    this.audioContext = null;
    this.setStatus({ state: 'idle' });
  }
}
