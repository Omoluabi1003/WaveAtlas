import type Hls from 'hls.js';

type StreamConnection = { url: string; generation: number; hls?: Hls; ready?: Promise<void>; reject?: (error: Error) => void };
const connections = new WeakMap<HTMLMediaElement, StreamConnection>();
export const isHlsStream = (url: string) => /\.m3u8(?:[?#]|$)/i.test(url);

export function releaseRadioStream(media: HTMLMediaElement) {
  const connection = connections.get(media);
  connections.delete(media);
  connection?.reject?.(new Error('Stream selection changed'));
  connection?.hls?.destroy();
}

/** Safari uses native HLS. Other browsers load the free HLS engine on demand. */
export async function attachRadioStream(media: HTMLMediaElement, url: string, onFatal: (message: string) => void) {
  const existing = connections.get(media);
  if (existing?.url === url && !media.error) { await existing.ready; return; }
  releaseRadioStream(media);
  const connection: StreamConnection = { url, generation: Date.now() };
  connections.set(media, connection);
  if (!isHlsStream(url) || media.canPlayType('application/vnd.apple.mpegurl')) {
    media.src = url; media.load(); return;
  }
  const { default: Engine } = await import('hls.js');
  if (connections.get(media) !== connection) throw new Error('Stream selection changed');
  if (!Engine.isSupported()) throw new Error('This browser does not support this HLS radio stream');
  const engine = new Engine({ enableWorker: true, lowLatencyMode: true, liveSyncDurationCount: 2, maxBufferLength: 12, backBufferLength: 0 });
  connection.hls = engine;
  connection.ready = new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => { settled = true; if (connections.get(media) === connection) connections.delete(media); reject(new Error('Radio playlist timed out')); engine.destroy(); }, 12000);
    connection.reject = error => { window.clearTimeout(timeout); if (!settled) { settled = true; reject(error); } };
    engine.on(Engine.Events.MANIFEST_PARSED, () => { window.clearTimeout(timeout); settled = true; connection.reject = undefined; resolve(); });
    engine.on(Engine.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      window.clearTimeout(timeout);
      const message = `HLS stream unavailable: ${data.details}`;
      if (!settled) { settled = true; reject(new Error(message)); } else onFatal(message);
      if (connections.get(media) === connection) connections.delete(media);
      engine.destroy();
    });
    engine.attachMedia(media);
    engine.loadSource(url);
  });
  await connection.ready;
}
