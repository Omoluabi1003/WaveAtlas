import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export type StreamProbe = { ok: boolean; reason: string; status: number; resolvedUrl?: string; bytesSampled: number; responseTimeMs: number };

export function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  // Accept global-unicast IPv6 only. IPv4-mapped and local addresses fail closed.
  return isIP(ip) === 6 && /^[23][0-9a-f]{0,3}:/.test(ip) && !ip.startsWith('2001:db8:');
}

export function audioSampleKind(bytes: Uint8Array): string | undefined {
  const data = Buffer.from(bytes);
  if (data.length < 16) return;
  if (data.subarray(0, 4).toString() === 'OggS') return 'ogg';
  if (data.subarray(0, 4).toString() === 'fLaC') return 'flac';
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WAVE') return 'wav';
  // A stream must contain an MPEG/ADTS frame, not just an ID3 tag or HTML.
  for (let i = 0; i < data.length - 16; i++) {
    if (data[i] !== 0xff) continue;
    const next = data[i + 1], third = data[i + 2];
    if ((next & 0xf6) === 0xf0 && ((third >> 2) & 15) < 13) return 'aac';
    if ((next & 0xe0) === 0xe0 && ((next >> 3) & 3) !== 1 && ((next >> 1) & 3) !== 0 && (third >> 4) > 0 && (third >> 4) < 15 && ((third >> 2) & 3) !== 3) return 'mpeg';
  }
}

// DNS results are checked and pinned to the actual connection, including redirects.
// This runner is server-only and never reads an unbounded live response.
export async function probeStream(url: string, timeoutMs = 8000, dependencies: { resolve?: (host: string) => Promise<Array<{ address: string; family: number }>>; request?: typeof httpRequest } = {}): Promise<StreamProbe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const result = (ok: boolean, reason: string, status = 0, resolvedUrl?: string, bytesSampled = 0): StreamProbe => ({ ok, reason, status, resolvedUrl, bytesSampled, responseTimeMs: Date.now() - started });
  try {
    let target = new URL(url);
    for (let redirects = 0; redirects <= 4; redirects++) {
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return result(false, 'unsafe-url');
      const host = target.hostname.replace(/^\[|\]$/g, '');
      const lookupPromise = dependencies.resolve ? dependencies.resolve(host) : lookup(host, { all: true });
      const addresses = await new Promise<Awaited<typeof lookupPromise>>((resolve, reject) => {
        const abort = () => reject(new Error('timeout'));
        if (controller.signal.aborted) return abort();
        controller.signal.addEventListener('abort', abort, { once: true });
        lookupPromise.then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort));
      });
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) return result(false, 'non-public-address');
      const address = addresses.find((item) => item.family === 4) ?? addresses[0];
      const response = await new Promise<{ redirect?: string; probe?: StreamProbe }>((resolve, reject) => {
        const request = (dependencies.request ?? (target.protocol === 'https:' ? httpsRequest : httpRequest))(target, {
          method: 'GET', agent: false, family: address.family, signal: controller.signal,
          lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
          headers: { 'User-Agent': 'WaveAtlasAgents/1.0 (https://github.com/Omoluabi1003/WaveAtlas)', Range: 'bytes=0-4095', Accept: 'audio/*,application/ogg,*/*;q=0.1', 'Accept-Encoding': 'identity' },
        }, (res) => {
          const status = res.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            resolve({ redirect: res.headers.location }); res.destroy(); return;
          }
          if (status !== 200 && status !== 206) { resolve({ probe: result(false, `http-${status}`, status, target.href) }); res.destroy(); return; }
          let sample = Buffer.alloc(0);
          const finish = () => {
            const kind = audioSampleKind(sample);
            resolve({ probe: result(Boolean(kind), kind ? `audio-${kind}` : 'no-audio-evidence', status, target.href, sample.length) });
            res.destroy();
          };
          res.on('data', (chunk: Buffer) => {
            sample = Buffer.concat([sample, chunk.subarray(0, 4096 - sample.length)]);
            if (audioSampleKind(sample) || sample.length >= 4096) finish();
          });
          res.on('end', finish);
          res.on('error', reject);
        });
        request.on('error', reject); request.end();
      });
      if (response.probe) return response.probe;
      target = new URL(response.redirect!, target);
    }
    return result(false, 'redirect-limit');
  } catch {
    return result(false, controller.signal.aborted ? 'timeout' : 'network-or-invalid-url');
  } finally { clearTimeout(timer); }
}
