export type PocketProgress = { type?: string; label?: string; loaded?: number; total?: number; fromCache?: boolean; status?: string };
export type PocketChunkMeta = { [key: string]: unknown };

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };
type WorkerMessage = PocketProgress & { type: string; id?: number; bundle?: { sampleRate?: number; predefinedVoices?: string[] }; audio?: Float32Array; meta?: PocketChunkMeta; result?: any; error?: string };

export class AtlasPocketTTS {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private chunkHandler: ((audio: Float32Array, meta: PocketChunkMeta) => void) | null = null;
  private progressHandler: ((progress: PocketProgress) => void) | null = null;
  private bundle: { sampleRate?: number; predefinedVoices?: string[] } | null = null;

  get sampleRate() { return Number(this.bundle?.sampleRate) || 24000; }

  private ensureWorker() {
    if (this.worker) return;
    // Pocket TTS's inference worker MUST be same-origin. The previous Atlas runtime
    // imported the package from a CDN inside another worker, which could not satisfy
    // the library's worker/bundler contract reliably on mobile browsers.
    this.worker = new Worker('/api/atlas-voice/vendor/worker.js', { type: 'module', name: 'atlas-omoluabi-tts' });
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Omoluabi voice worker failed');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  private handleMessage(message: WorkerMessage) {
    if (message.type === 'ready') { this.bundle = message.bundle || null; return; }
    if (message.type === 'chunk') { if (message.audio && this.chunkHandler) this.chunkHandler(message.audio, message.meta || {}); return; }
    if (message.type === 'progress' || message.type === 'status') { this.progressHandler?.(message); return; }
    if (message.id == null) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (message.type === 'error') {
      this.pending.delete(message.id);
      pending.reject(new Error(message.error || 'Pocket TTS error'));
      return;
    }
    if (message.type === 'result') {
      this.pending.delete(message.id);
      pending.resolve(message.result);
    }
  }

  private request(type: string, payload: Record<string, unknown>, transfer: Transferable[] = []) {
    this.ensureWorker();
    const id = this.nextId++;
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, payload }, transfer);
    });
  }

  async load(onProgress?: (progress: PocketProgress) => void) {
    this.progressHandler = onProgress || null;
    await this.request('init', {
      language: 'english_2026-04',
      quantized: true,
      voiceCloning: true,
      modelBaseUrl: 'https://huggingface.co/vlapky/pocket-tts-onnx/resolve/main/onnx',
      ortBaseUrl: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/',
      voicesUrl: null,
      maxThreads: 2,
      cache: true,
      cacheName: 'waveatlas-omoluabi-pocket-tts-v2',
    });
    return this.bundle;
  }

  async cloneVoice(audio: Float32Array, inputSampleRate: number) {
    const pcm = audio.slice();
    const result = await this.request('cloneVoice', { audio: pcm.buffer, ref: 'omoluabi-paul-v2', inputSampleRate }, [pcm.buffer]);
    return String(result?.ref || 'omoluabi-paul-v2');
  }

  async generate(text: string, voice: string, onChunk: (audio: Float32Array, meta: PocketChunkMeta) => void) {
    this.chunkHandler = onChunk;
    try {
      const result = await this.request('generate', { text, voiceRef: voice });
      return result?.metrics || result;
    } finally {
      this.chunkHandler = null;
    }
  }

  async stop() {
    if (!this.worker) return;
    try { await this.request('stop', {}); } catch { /* best effort */ }
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) pending.reject(new Error('Atlas voice engine closed'));
    this.pending.clear();
    this.bundle = null;
  }
}
