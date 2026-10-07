export type AtlasInteractionState = 'RADIO_PLAYING' | 'ATLAS_LISTENING' | 'ATLAS_PROCESSING' | 'ATLAS_SPEAKING' | 'ATLAS_IDLE';
export type AtlasActivity = { conversation: boolean; capture: boolean; processing: boolean; speechPending: boolean; playback: boolean; queuedSpeech: boolean };
export function atlasInteractionState(activity: AtlasActivity): AtlasInteractionState {
  if (activity.playback) return 'ATLAS_SPEAKING';
  if (activity.processing || activity.speechPending || activity.queuedSpeech) return 'ATLAS_PROCESSING';
  if (activity.capture || activity.conversation) return 'ATLAS_LISTENING';
  return 'ATLAS_IDLE';
}

export type RadioAudio = Partial<Pick<HTMLAudioElement, 'volume' | 'muted'>>;

// The stream stays connected. Every radio output write goes through this gate.
export class AtlasAudioFocus {
  private saved: { volume: number; muted: boolean } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;
  constructor(private audio: RadioAudio) {}
  private cancel() {
    this.revision++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  acquire() {
    this.cancel();
    this.saved ??= { volume: this.audio.volume ?? 1, muted: this.audio.muted ?? false };
    this.audio.muted = true;
    this.audio.volume = 0;
  }
  setVolume(volume: number, userChange = false) {
    if (this.saved) {
      if (userChange) { this.saved.volume = Math.min(1, Math.max(0, volume)); this.saved.muted = volume === 0; }
      return; // Remember controls without making the radio audible.
    }
    this.audio.volume = Math.min(1, Math.max(0, volume));
    this.audio.muted = false;
  }
  release() {
    if (!this.saved || this.timer !== null) return;
    const revision = this.revision;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (revision !== this.revision || !this.saved) return;
      const saved = this.saved;
      this.audio.volume = 0;
      this.audio.muted = saved.muted;
      const start = performance.now();
      const fade = () => {
        if (revision !== this.revision) return;
        const progress = Math.min(1, (performance.now() - start) / 700);
        this.audio.volume = saved.volume * progress;
        if (progress < 1) this.timer = setTimeout(fade, 16);
        else { this.timer = null; this.saved = null; }
      };
      fade();
    }, 350);
  }
  dispose() { this.cancel(); } // Teardown never unmutes an active interaction.
}
const controllers = new WeakMap<object, AtlasAudioFocus>();
export function radioAudioFocus(audio: RadioAudio) {
  let focus = controllers.get(audio);
  if (!focus) { focus = new AtlasAudioFocus(audio); controllers.set(audio, focus); }
  return focus;
}
