export type AtlasVoiceReadiness = 'idle' | 'loading' | 'ready' | 'unavailable';

// A slow initial model download must never select a different speaker.
export async function waitForAtlasPersonalVoice(options: {
  state: () => AtlasVoiceReadiness;
  active: () => boolean;
  wait: (ms: number) => Promise<unknown>;
  now?: () => number;
  timeoutMs?: number;
}) {
  const now = options.now || Date.now;
  const start = now();
  while (options.active()) {
    const state = options.state();
    if (state === 'ready') return true;
    if (state !== 'loading' || now() - start >= (options.timeoutMs ?? 120000)) return false;
    await options.wait(180);
  }
  return false;
}
