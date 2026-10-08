/**
 * Device Capability Engine & Adaptive Runtime Profiles for WaveAtlas.
 * Provides safe feature detection, failure isolation, and runtime profile management.
 */

export type RuntimeProfile = 'FULL' | 'BALANCED' | 'LITE' | 'SAFE';

export interface DeviceCapabilities {
  webgl: boolean;
  webgl2: boolean;
  webAudio: boolean;
  speechRecognition: boolean;
  webWorkers: boolean;
  geolocation: boolean;
  permissionsApi: boolean;
  serviceWorker: boolean;
  intersectionObserver: boolean;
  resizeObserver: boolean;
  requestAnimationFrame: boolean;
  pointerFine: boolean;
  touch: boolean;
  prefersReducedMotion: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connectionType?: string;
  effectiveConnectionType?: string;
  saveData?: boolean;
}

/**
 * Safely inspect device and browser capabilities without throwing.
 */
export function detectCapabilities(): DeviceCapabilities {
  const isServer = typeof window === 'undefined' || typeof navigator === 'undefined';

  if (isServer) {
    return {
      webgl: false,
      webgl2: false,
      webAudio: false,
      speechRecognition: false,
      webWorkers: false,
      geolocation: false,
      permissionsApi: false,
      serviceWorker: false,
      intersectionObserver: false,
      resizeObserver: false,
      requestAnimationFrame: false,
      pointerFine: false,
      touch: false,
      prefersReducedMotion: false,
    };
  }

  // WebGL 1 probe
  let webgl = false;
  try {
    const canvas = document.createElement('canvas');
    webgl = Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    webgl = false;
  }

  // WebGL 2 probe
  let webgl2 = false;
  try {
    const canvas = document.createElement('canvas');
    webgl2 = Boolean(canvas.getContext('webgl2'));
  } catch {
    webgl2 = false;
  }

  // WebAudio probe
  let webAudio = false;
  try {
    webAudio = Boolean(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
  } catch {
    webAudio = false;
  }

  // SpeechRecognition probe
  let speechRecognition = false;
  try {
    speechRecognition = Boolean(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );
  } catch {
    speechRecognition = false;
  }

  // WebWorker probe
  let webWorkers = false;
  try {
    webWorkers = typeof Worker !== 'undefined';
  } catch {
    webWorkers = false;
  }

  // Geolocation probe
  let geolocation = false;
  try {
    geolocation = Boolean(navigator.geolocation);
  } catch {
    geolocation = false;
  }

  // Permissions API probe
  let permissionsApi = false;
  try {
    permissionsApi = Boolean(navigator.permissions && typeof navigator.permissions.query === 'function');
  } catch {
    permissionsApi = false;
  }

  // ServiceWorker probe
  let serviceWorker = false;
  try {
    serviceWorker = 'serviceWorker' in navigator;
  } catch {
    serviceWorker = false;
  }

  // Observer & RAF probes
  const intersectionObserver = typeof IntersectionObserver !== 'undefined';
  const resizeObserver = typeof ResizeObserver !== 'undefined';
  const requestAnimationFrame = typeof window.requestAnimationFrame === 'function';

  // Pointer & Touch capabilities
  let pointerFine = false;
  let prefersReducedMotion = false;
  try {
    if (window.matchMedia) {
      pointerFine = window.matchMedia('(pointer: fine)').matches;
      prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  } catch {
    // Ignore media query errors
  }

  let touch = false;
  try {
    touch = 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
  } catch {
    touch = false;
  }

  // Optional hardware signals
  let deviceMemory: number | undefined;
  try {
    if ('deviceMemory' in navigator && typeof (navigator as unknown as { deviceMemory?: number }).deviceMemory === 'number') {
      deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    }
  } catch {
    deviceMemory = undefined;
  }

  let hardwareConcurrency: number | undefined;
  try {
    if (typeof navigator.hardwareConcurrency === 'number') {
      hardwareConcurrency = navigator.hardwareConcurrency;
    }
  } catch {
    hardwareConcurrency = undefined;
  }

  // Connection API
  let connectionType: string | undefined;
  let effectiveConnectionType: string | undefined;
  let saveData: boolean | undefined;
  try {
    const conn = (navigator as unknown as { connection?: { type?: string; effectiveType?: string; saveData?: boolean } }).connection;
    if (conn) {
      connectionType = conn.type;
      effectiveConnectionType = conn.effectiveType;
      saveData = Boolean(conn.saveData);
    }
  } catch {
    // Ignore network info errors
  }

  return {
    webgl,
    webgl2,
    webAudio,
    speechRecognition,
    webWorkers,
    geolocation,
    permissionsApi,
    serviceWorker,
    intersectionObserver,
    resizeObserver,
    requestAnimationFrame,
    pointerFine,
    touch,
    prefersReducedMotion,
    deviceMemory,
    hardwareConcurrency,
    connectionType,
    effectiveConnectionType,
    saveData,
  };
}

/**
 * Derives the initial target RuntimeProfile based on detected capabilities.
 */
export function determineProfile(caps: DeviceCapabilities): RuntimeProfile {
  // SAFE mode fallback if essential features missing or extreme constraints
  if (!caps.requestAnimationFrame) {
    return 'SAFE';
  }

  if (caps.saveData || caps.effectiveConnectionType === 'slow-2g' || caps.effectiveConnectionType === '2g') {
    return caps.webgl ? 'LITE' : 'SAFE';
  }

  if (caps.prefersReducedMotion) {
    return 'LITE';
  }

  const memory = caps.deviceMemory ?? 4;
  const cores = caps.hardwareConcurrency ?? 4;

  if (memory <= 2 || cores <= 2) {
    return caps.webgl ? 'LITE' : 'SAFE';
  }

  if (caps.webgl2 && memory >= 4 && cores >= 4 && caps.effectiveConnectionType !== '3g') {
    return 'FULL';
  }

  if (caps.webgl) {
    return 'BALANCED';
  }

  return 'SAFE';
}

/**
 * Adaptive Runtime Performance Monitor with hysteresis.
 */
export class AdaptiveRuntimeMonitor {
  private currentProfile: RuntimeProfile;
  private initialProfile: RuntimeProfile;
  private frameTimes: number[] = [];
  private lastFrameTimestamp = 0;
  private lowFpsCount = 0;
  private highFpsCount = 0;
  private listeners: Set<(profile: RuntimeProfile) => void> = new Set();

  constructor(initialCaps?: DeviceCapabilities) {
    const caps = initialCaps || detectCapabilities();
    this.initialProfile = determineProfile(caps);
    this.currentProfile = this.initialProfile;
  }

  public getProfile(): RuntimeProfile {
    return this.currentProfile;
  }

  public subscribe(listener: (profile: RuntimeProfile) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Called on animation frame to record frame duration and perform hysteresis analysis.
   */
  public recordFrame(timestamp: number) {
    if (this.lastFrameTimestamp > 0) {
      const delta = timestamp - this.lastFrameTimestamp;
      if (delta > 0 && delta < 1000) {
        this.frameTimes.push(delta);
        if (this.frameTimes.length > 60) {
          this.frameTimes.shift();
        }
      }
    }
    this.lastFrameTimestamp = timestamp;

    if (this.frameTimes.length >= 30) {
      const avgMs = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      const fps = 1000 / avgMs;

      // Hysteresis rules:
      // Downgrade if FPS consistently drops below threshold (< 30 FPS)
      if (fps < 28) {
        this.lowFpsCount++;
        this.highFpsCount = 0;
        if (this.lowFpsCount >= 3) {
          this.downgrade();
          this.lowFpsCount = 0;
          this.frameTimes = [];
        }
      } else if (fps > 55) {
        // Upgrade only after sustained high FPS (> 55 FPS) and not exceeding initial target profile
        this.highFpsCount++;
        this.lowFpsCount = 0;
        if (this.highFpsCount >= 10) {
          this.upgrade();
          this.highFpsCount = 0;
          this.frameTimes = [];
        }
      } else {
        this.lowFpsCount = 0;
        this.highFpsCount = 0;
      }
    }
  }

  public downgrade() {
    let nextProfile: RuntimeProfile = this.currentProfile;
    if (this.currentProfile === 'FULL') nextProfile = 'BALANCED';
    else if (this.currentProfile === 'BALANCED') nextProfile = 'LITE';
    else if (this.currentProfile === 'LITE') nextProfile = 'SAFE';

    if (nextProfile !== this.currentProfile) {
      this.currentProfile = nextProfile;
      this.notify();
    }
  }

  public upgrade() {
    let nextProfile: RuntimeProfile = this.currentProfile;
    // Upgrade cannot exceed the hardware initialProfile upper bound
    if (this.currentProfile === 'SAFE' && this.initialProfile !== 'SAFE') nextProfile = 'LITE';
    else if (this.currentProfile === 'LITE' && (this.initialProfile === 'BALANCED' || this.initialProfile === 'FULL')) nextProfile = 'BALANCED';
    else if (this.currentProfile === 'BALANCED' && this.initialProfile === 'FULL') nextProfile = 'FULL';

    if (nextProfile !== this.currentProfile) {
      this.currentProfile = nextProfile;
      this.notify();
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentProfile);
      } catch {
        // Prevent listener error from breaking monitor
      }
    }
  }
}

/**
 * Isolated Subsystem Execution Wrapper.
 * Catches optional subsystem failures without crashing WaveAtlas or interrupting radio audio.
 */
export function isolateSubsystem<T>(
  name: string,
  fn: () => T,
  fallback: T,
  onError?: (err: unknown) => void
): T {
  try {
    return fn();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Subsystem Isolated: ${name}]`, err);
    }
    onError?.(err);
    return fallback;
  }
}

/**
 * Isolated Async Subsystem Execution Wrapper.
 */
export async function isolateSubsystemAsync<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
  onError?: (err: unknown) => void
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Subsystem Isolated: ${name}]`, err);
    }
    onError?.(err);
    return fallback;
  }
}
