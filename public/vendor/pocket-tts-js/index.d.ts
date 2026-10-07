export const LANGUAGES: readonly string[];

export interface PocketTTSOptions {
  /** Language bundle to load. Default "english_2026-04". */
  language?: string;
  /** Use INT8 models (smaller/faster) instead of full precision. Default true. */
  quantized?: boolean;
  /** WaveAtlas extension: quantize the one-time voice encoder. Default true. */
  encoderQuantized?: boolean;
  /** Download the encoder so cloneVoice() works. Default true. */
  voiceCloning?: boolean;
  /** Base URL of the `onnx/` folder on Hugging Face. */
  modelBaseUrl?: string;
  /** Base URL for onnxruntime-web dist files. */
  ortBaseUrl?: string;
  /** Explicit URL to a voices.bin for built-in voices. */
  voicesUrl?: string | null;
  /** Max WASM threads (needs cross-origin isolation). Default 8. */
  maxThreads?: number;
  /** Persist downloaded assets in Cache Storage so later loads are instant/offline. Default true. */
  cache?: boolean;
  /** Override the Cache Storage bucket name. */
  cacheName?: string;
}

export interface BundleInfo {
  language: string;
  sampleRate: number;
  samplesPerFrame: number;
  predefinedVoices: string[];
}

export interface ProgressInfo {
  type: "progress" | "status";
  label?: string;
  loaded?: number;
  total?: number;
  status?: string;
  /** True when the bytes came from Cache Storage rather than the network. */
  fromCache?: boolean;
}

export interface ChunkMeta {
  chunkDuration: number;
  genTimeSec?: number;
  isFirst: boolean;
  isLast: boolean;
  chunkStart?: boolean;
  isSilence?: boolean;
}

export interface GenerationMetrics {
  rtfx: number;
  genTime: number;
  audioDuration: number;
  stopped?: boolean;
}

export interface CloneOptions {
  inputSampleRate?: number;
  name?: string;
}

export interface GenerateOptions {
  voice: string;
  onChunk?: (audio: Float32Array, meta: ChunkMeta) => void;
}

/** WaveAtlas extension: structured tensors suitable for IndexedDB, not JSON. */
export interface PreparedVoice {
  format: 2;
  language: string;
  sampleRate: number;
  manifest: Array<{ input_name: string; dtype: string; shape: number[]; [key: string]: unknown }>;
  tensors: Record<string, {
    type: string;
    dims: number[];
    data?: Float32Array | BigInt64Array | Uint8Array;
    runs?: Array<{ offset: number; data: Float32Array }>;
  }>;
}

export class PocketTTS {
  constructor(options?: PocketTTSOptions);
  readonly sampleRate: number;
  readonly predefinedVoices: string[];
  ready: boolean;
  bundle: BundleInfo | null;
  load(onProgress?: (info: ProgressInfo) => void): Promise<BundleInfo | null>;
  cloneVoice(audio: Float32Array, opts?: CloneOptions): Promise<string>;
  exportVoice(ref: string): Promise<PreparedVoice>;
  importVoice(profile: PreparedVoice, ref?: string): Promise<string>;
  loadVoice(name: string): Promise<string>;
  generate(text: string, opts: GenerateOptions): Promise<GenerationMetrics>;
  stop(): Promise<void>;
  destroy(): void;
  static clearCache(cacheName?: string): Promise<boolean>;
  static storageEstimate(): Promise<{ usage: number; quota: number } | null>;
}

export function resampleLinear(
  data: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array;

export class SentencePieceTokenizer {
  static fromUrl(url: string, fetchImpl?: typeof fetch): Promise<SentencePieceTokenizer>;
  static fromBytes(bytes: Uint8Array): SentencePieceTokenizer;
  load(modelBytes: Uint8Array): void;
  encodeIds(text: string): number[];
  decodeIds(ids: number[]): string;
}

export interface StreamingPlayerOptions {
  sampleRate?: number;
  audioContext?: AudioContext;
  /** Audio to buffer before playback starts (jitter cushion). Default 0.4. 0 = play immediately. */
  primeSeconds?: number;
  /** Small scheduling lead applied when playback starts. Default 0.05. */
  leadSeconds?: number;
  /** Called when a chunk arrives after its scheduled slot (audible gap). */
  onUnderrun?: (info: { gapSeconds: number; count: number }) => void;
}

export class StreamingPlayer {
  constructor(opts?: StreamingPlayerOptions);
  readonly analyser: AnalyserNode | null;
  underruns: number;
  resume(): Promise<void>;
  reset(): void;
  play(float32: Float32Array, meta?: { isLast?: boolean }): void;
  /** Release any audio still held by the priming buffer. */
  flush(): void;
  stop(): void;
  destroy(): Promise<void>;
}

export function chunksToWavBlob(chunks: Float32Array[], sampleRate: number): Blob;
