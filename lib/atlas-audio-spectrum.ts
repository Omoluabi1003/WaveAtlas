type AtlasSpectrumSource = "analyser" | "unavailable";

export type AtlasAudioSpectrum = {
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  source: AtlasSpectrumSource;
};

type CaptureCapableMedia = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

type SpectrumBinding = {
  cleanup: () => void;
};

const bindings = new WeakMap<HTMLMediaElement, SpectrumBinding>();

function emit(detail: AtlasAudioSpectrum) {
  window.dispatchEvent(new CustomEvent<AtlasAudioSpectrum>("waveatlas:audio-spectrum", { detail }));
}

function average(data: Uint8Array, start: number, end: number) {
  const safeStart = Math.max(0, Math.min(data.length - 1, start));
  const safeEnd = Math.max(safeStart + 1, Math.min(data.length, end));
  let total = 0;
  for (let index = safeStart; index < safeEnd; index += 1) total += data[index];
  return total / Math.max(1, safeEnd - safeStart) / 255;
}

export function bindAtlasAudioSpectrum(media: HTMLMediaElement) {
  if (typeof window === "undefined") return () => undefined;
  const existing = bindings.get(media);
  if (existing) return existing.cleanup;

  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let frame = 0;
  let starting = false;
  let stopped = false;
  let lastUnavailableAt = 0;

  const stopFrame = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  };

  const markUnavailable = () => {
    const now = performance.now();
    if (now - lastUnavailableAt < 1500) return;
    lastUnavailableAt = now;
    emit({ energy: 0, bass: 0, mid: 0, treble: 0, source: "unavailable" });
  };

  const renderSpectrum = () => {
    if (stopped || !analyser || media.paused || media.ended) {
      frame = 0;
      return;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const bass = average(data, 1, Math.max(4, Math.floor(data.length * 0.08)));
    const mid = average(data, Math.floor(data.length * 0.08), Math.floor(data.length * 0.38));
    const treble = average(data, Math.floor(data.length * 0.38), data.length);
    const energy = Math.min(1, bass * 0.46 + mid * 0.36 + treble * 0.18);
    emit({ energy, bass, mid, treble, source: "analyser" });
    frame = window.requestAnimationFrame(renderSpectrum);
  };

  const start = async () => {
    if (starting || stopped || analyser) return;
    starting = true;
    try {
      const capable = media as CaptureCapableMedia;
      const capture = capable.captureStream ?? capable.mozCaptureStream;
      if (!capture) {
        markUnavailable();
        return;
      }
      const stream = capture.call(capable);
      if (!stream.getAudioTracks().length) {
        markUnavailable();
        return;
      }
      const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        markUnavailable();
        return;
      }
      context = new AudioContextCtor({ latencyHint: "interactive" });
      if (context.state === "suspended") await context.resume().catch(() => undefined);
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      stopFrame();
      frame = window.requestAnimationFrame(renderSpectrum);
    } catch {
      markUnavailable();
      analyser = null;
      source = null;
      if (context) void context.close().catch(() => undefined);
      context = null;
    } finally {
      starting = false;
    }
  };

  const onPlay = () => void start();
  const onPause = () => stopFrame();
  const onEnded = () => stopFrame();

  media.addEventListener("play", onPlay);
  media.addEventListener("playing", onPlay);
  media.addEventListener("pause", onPause);
  media.addEventListener("ended", onEnded);

  if (!media.paused) void start();

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    stopFrame();
    media.removeEventListener("play", onPlay);
    media.removeEventListener("playing", onPlay);
    media.removeEventListener("pause", onPause);
    media.removeEventListener("ended", onEnded);
    try { source?.disconnect(); } catch {}
    try { analyser?.disconnect(); } catch {}
    if (context) void context.close().catch(() => undefined);
    bindings.delete(media);
  };

  bindings.set(media, { cleanup });
  return cleanup;
}

export function releaseAtlasAudioSpectrum(media: HTMLMediaElement) {
  bindings.get(media)?.cleanup();
}
