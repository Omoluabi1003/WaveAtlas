import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export type ProbeOutcome = 'healthy' | 'unavailable' | 'inconclusive' | 'unsafe';
export type StreamProbe = { ok: boolean; reason: string; status: number; resolvedUrl?: string; sampledUrl?: string; bytesSampled: number; responseTimeMs: number; outcome?: ProbeOutcome; requests?: number };
export type ProbeDependencies = { resolve?: (host: string) => Promise<Array<{ address: string; family: number }>>; request?: typeof httpRequest };
export type ProbeResource = { status: number; url: string; bytes: Buffer; contentType: string; truncated: boolean; redirect?: string };
const MAX_REQUESTS = 12;
const MAX_MANIFEST_BYTES = 65536;

export function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  return isIP(ip) === 6 && /^[23][0-9a-f]{0,3}:/.test(ip) && !ip.startsWith('2001:db8:');
}

export function audioSampleKind(bytes: Uint8Array): string | undefined {
  const data = Buffer.from(bytes);
  if (data.length < 16) return;
  if (data.subarray(0, 4).toString() === 'OggS') return 'ogg';
  if (data.subarray(0, 4).toString() === 'fLaC') return 'flac';
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WAVE') return 'wav';
  for (let i = 0; i < data.length - 16; i++) {
    if (data[i] !== 0xff) continue;
    const next = data[i + 1], third = data[i + 2];
    if ((next & 0xf6) === 0xf0 && ((third >> 2) & 15) < 13) return 'aac';
    if ((next & 0xe0) === 0xe0 && ((next >> 3) & 3) !== 1 && ((next >> 1) & 3) !== 0 && (third >> 4) > 0 && (third >> 4) < 15 && ((third >> 2) & 3) !== 3) return 'mpeg';
  }
}

function playlistText(bytes: Buffer) { return bytes.toString('utf8').replace(/^\uFEFF/, '').trimStart(); }
function looksLikePlaylist(bytes: Buffer, url: string, type: string) {
  return /mpegurl|scpls/i.test(type) || /\.(?:m3u8?|pls)(?:[?#]|$)/i.test(url) || /^(?:#EXTM3U|\[playlist\])/i.test(playlistText(bytes));
}

/** Bounded GET with DNS pinning. Every redirect, playlist, init map and segment uses this path. */
export async function fetchProbeResource(url: string, signal: AbortSignal, dependencies: ProbeDependencies = {}, options: { media?: boolean; maxBytes?: number; document?: boolean } = {}): Promise<ProbeResource> {
  const target = new URL(url);
  if (url.length > 8192 || !['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('unsafe-url');
  const host = target.hostname.replace(/^\[|\]$/g, '');
  const addresses = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    const abort = () => reject(new Error('timeout'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    (dependencies.resolve ? dependencies.resolve(host) : lookup(host, { all: true })).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
  if (signal.aborted) throw new Error('timeout');
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('non-public-address');
  const address = addresses.find(item => item.family === 4) ?? addresses[0];
  const maximum = Math.min(options.document ? 1048576 : MAX_MANIFEST_BYTES, Math.max(4096, options.maxBytes ?? MAX_MANIFEST_BYTES));
  return new Promise((resolve, reject) => {
    const request = (dependencies.request ?? (target.protocol === 'https:' ? httpsRequest : httpRequest))(target, {
      method: 'GET', agent: false, family: address.family, signal,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { 'User-Agent': 'WaveAtlasAgents/1.0 (https://github.com/Omoluabi1003/WaveAtlas)', Range: `bytes=0-${maximum - 1}`, Accept: 'audio/*,application/vnd.apple.mpegurl,application/x-mpegurl,video/mp2t,application/octet-stream,*/*;q=0.1', 'Accept-Encoding': 'identity' },
    }, res => {
      const status = res.statusCode ?? 0, contentType = String(res.headers['content-type'] ?? '');
      let settled = false, bytes = Buffer.alloc(0);
      const finish = (truncated = false) => {
        if (settled) return;
        settled = true;
        resolve({ status, url: target.href, bytes, contentType, truncated, ...([301,302,303,307,308].includes(status) && res.headers.location ? { redirect: res.headers.location } : {}) });
        res.destroy();
      };
      if (status !== 200 && status !== 206) { finish(); return; }
      res.on('data', (chunk: Buffer) => {
        if (settled) return;
        const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const peek = bytes.length < 256 ? Buffer.concat([bytes, incoming.subarray(0, 256)]) : bytes;
        const limit = options.media || options.document || looksLikePlaylist(peek, target.href, contentType) ? maximum : 4096;
        bytes = Buffer.concat([bytes, incoming.subarray(0, Math.max(0, limit - bytes.length))]);
        if ((!options.media && !looksLikePlaylist(bytes, target.href, contentType) && audioSampleKind(bytes)) || bytes.length >= limit) finish(bytes.length >= limit);
      });
      res.on('end', () => finish());
      res.on('error', reject);
      res.on('aborted', () => { if (!settled) reject(new Error('response-aborted')); });
    });
    request.on('error', reject); request.end();
  });
}

function attributes(line: string) {
  const result: Record<string, string> = {};
  for (const match of line.matchAll(/([\w-]+)=(?:"([^"\r\n]*)"|([^,\r\n]*))/g)) result[match[1]] = match[2] ?? match[3];
  return result;
}

export function parseStreamPlaylist(text: string): { kind: 'hls-master' | 'hls-media' | 'playlist' | 'invalid'; urls: string[]; init?: string; encrypted?: boolean; unsupported?: string } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (/^\[playlist\]/i.test(lines[0] ?? '')) return { kind: 'playlist', urls: lines.filter(line => /^File\d+=/i.test(line)).map(line => line.slice(line.indexOf('=') + 1)).slice(0, 3) };
  if (lines[0] !== '#EXTM3U') return { kind: 'invalid', urls: [] };
  const renditions = lines.filter(line => line.startsWith('#EXT-X-MEDIA:')).map(attributes).filter(row => row.TYPE === 'AUDIO' && row.URI).map(row => row.URI);
  const variants = lines.flatMap((line, index) => line.startsWith('#EXT-X-STREAM-INF:') && lines[index + 1] && !lines[index + 1].startsWith('#') ? [{ url: lines[index + 1], audioOnly: !/avc|hev|hvc|vp0|av01/i.test(attributes(line).CODECS ?? '') }] : []);
  if (variants.length || renditions.length) return { kind: 'hls-master', urls: [...new Set([...renditions, ...variants.filter(row => row.audioOnly).map(row => row.url), ...variants.map(row => row.url)])].slice(0, 3) };
  if (lines.some(line => line.startsWith('#EXT-X-'))) {
    // Encrypted or byte-range streams require a richer verifier. They remain unknown, not offline.
    const encrypted = lines.some(line => line.startsWith('#EXT-X-KEY:') && attributes(line).METHOD !== 'NONE');
    const init = lines.filter(line => line.startsWith('#EXT-X-MAP:')).map(attributes).at(-1)?.URI;
    const unsupported = lines.some(line => line.startsWith('#EXT-X-BYTERANGE:') || (line.startsWith('#EXT-X-MAP:') && attributes(line).BYTERANGE)) ? 'hls-byte-range-unverified' : undefined;
    return { kind: 'hls-media', urls: lines.filter(line => !line.startsWith('#')).slice(-3).reverse(), init, encrypted, unsupported };
  }
  return { kind: 'playlist', urls: lines.filter(line => !line.startsWith('#')).slice(0, 3) };
}

type IsoBox = { type: string; payload: Buffer };
function isoBoxes(data: Buffer, partial = false): IsoBox[] {
  const boxes: IsoBox[] = [];
  for (let offset = 0; offset + 8 <= data.length;) {
    const size = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8);
    if (size < 8 || (!partial && offset + size > data.length)) break;
    boxes.push({ type, payload: data.subarray(offset + 8, Math.min(data.length, offset + size)) });
    if (offset + size > data.length) break;
    offset += size;
  }
  return boxes;
}
export function hasCmafAudio(init: Buffer, media: Buffer) {
  const audio = isoBoxes(init).filter(box => box.type === 'moov').flatMap(box => isoBoxes(box.payload)).filter(box => box.type === 'trak').flatMap(box => isoBoxes(box.payload)).filter(box => box.type === 'mdia').flatMap(box => isoBoxes(box.payload)).some(box => box.type === 'hdlr' && box.payload.length >= 12 && box.payload.toString('ascii',8,12) === 'soun');
  const boxes = isoBoxes(media, true);
  return audio && boxes.some(box => box.type === 'moof' && box.payload.length > 0) && boxes.some(box => box.type === 'mdat' && box.payload.length > 0);
}

/** Inspect audio PES payloads only; a video packet containing sync-like bytes is not audio evidence. */
export function hlsAudioSampleKind(media: Buffer, init: Buffer = Buffer.alloc(0)): string | undefined {
  if (isoBoxes(media, true).some(box => ['ftyp', 'moof', 'moov', 'styp'].includes(box.type))) {
    return hasCmafAudio(init.length ? init : media, media) ? 'cmaf' : undefined;
  }
  if (media[0] === 0x47 && media[188] === 0x47) {
    for (let offset = 0; offset + 188 <= media.length; offset += 188) {
      if (media[offset] !== 0x47 || !(media[offset + 1] & 0x40) || (media[offset + 3] & 0xc0)) continue;
      const control = (media[offset + 3] >> 4) & 3;
      if (control !== 1 && control !== 3) continue;
      const start = offset + 4 + (control === 3 ? 1 + media[offset + 4] : 0);
      if (start + 9 >= offset + 188 || media[start] !== 0 || media[start + 1] !== 0 || media[start + 2] !== 1) continue;
      const stream = media[start + 3];
      if (stream !== 0xbd && (stream < 0xc0 || stream > 0xdf)) continue;
      const payload = start + 9 + media[start + 8];
      if (payload < offset + 188) {
        const audio = audioSampleKind(media.subarray(payload, offset + 188));
        if (audio) return audio;
      }
    }
    return;
  }
  return audioSampleKind(media);
}

export function probeOutcome(probe: Pick<StreamProbe, 'ok' | 'reason' | 'outcome'>): ProbeOutcome {
  if (probe.outcome) return probe.outcome;
  if (probe.ok) return 'healthy';
  if (['unsafe-url','non-public-address','redirect-limit','playlist-loop','request-limit'].includes(probe.reason)) return 'unsafe';
  if (/^http-(?:404|410)$/.test(probe.reason)) return 'unavailable';
  return 'inconclusive';
}

/** Validates media behind playlists without treating the playlist text itself as audio. */
export async function probeStream(url: string, timeoutMs = 8000, dependencies: ProbeDependencies = {}): Promise<StreamProbe> {
  const started = Date.now(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cache = new Map<string, ProbeResource>(); let requests = 0, bytesSampled = 0;
  const result = (ok: boolean, reason: string, status = 0, resolvedUrl?: string, sampledUrl?: string): StreamProbe => {
    const probe: StreamProbe = { ok, reason, status, resolvedUrl, sampledUrl, bytesSampled, responseTimeMs: Date.now() - started, requests };
    return { ...probe, outcome: probeOutcome(probe) };
  };
  async function resource(input: string, media = false) {
    let target = input;
    const redirects = new Set<string>();
    for (let hop = 0; hop <= 4; hop++) {
      const parsed = new URL(target); parsed.hash = '';
      if (redirects.has(parsed.href)) throw new Error('playlist-loop');
      redirects.add(parsed.href);
      const key = `${media ? 'media' : 'manifest'}:${parsed.href}`;
      let response = cache.get(key);
      if (!response) {
        if (requests >= MAX_REQUESTS) throw new Error('request-limit');
        requests++;
        response = await fetchProbeResource(parsed.href, controller.signal, dependencies, { media });
        bytesSampled += response.bytes.length;
        cache.set(key, response);
      }
      if (!response.redirect) return response;
      if (hop === 4) throw new Error('redirect-limit');
      target = new URL(response.redirect, response.url).href;
    }
    throw new Error('redirect-limit');
  }
  async function inspect(input: string, depth = 0, hlsRoot?: string, ancestors = new Set<string>()): Promise<StreamProbe> {
    if (depth > 4) return result(false, 'playlist-depth-limit', 0, hlsRoot || input);
    const normalized = new URL(input); normalized.hash = '';
    if (ancestors.has(normalized.href)) return result(false, 'playlist-loop');
    const path = new Set([...ancestors, normalized.href]);
    const response = await resource(input);
    if (response.status !== 200 && response.status !== 206) return result(false, `http-${response.status}`, response.status, hlsRoot || response.url);
    const direct = audioSampleKind(response.bytes);
    const playlist = parseStreamPlaylist(playlistText(response.bytes));
    if (playlist.kind === 'invalid') return result(Boolean(direct), direct ? (hlsRoot ? `audio-hls-${direct}` : `audio-${direct}`) : 'no-audio-evidence', response.status, hlsRoot || response.url, response.url);
    if (response.truncated) return result(false, 'playlist-too-large', response.status, hlsRoot || response.url);
    const root = playlist.kind.startsWith('hls') ? hlsRoot || response.url : hlsRoot;
    if (playlist.encrypted) return result(false, 'hls-encrypted-unverified', response.status, root);
    if (playlist.unsupported) return result(false, playlist.unsupported, response.status, root);
    if (!playlist.urls.length) return result(false, 'playlist-empty', response.status, root || response.url);
    let last: StreamProbe | undefined;
    if (playlist.kind === 'hls-media') {
      let init: Buffer = Buffer.alloc(0);
      if (playlist.init) {
        const map = await resource(new URL(playlist.init, response.url).href, true);
        if (map.status !== 200 && map.status !== 206) return result(false, `http-${map.status}`, map.status, root);
        init = map.bytes;
      }
      for (const segment of playlist.urls.slice(0,2)) {
        const media = await resource(new URL(segment, response.url).href, true);
        const kind = hlsAudioSampleKind(media.bytes, init);
        if ((media.status === 200 || media.status === 206) && kind) return result(true, `audio-hls-${kind}`, media.status, root, media.url);
        last = result(false, media.status !== 200 && media.status !== 206 ? `http-${media.status}` : 'hls-no-audio-evidence', media.status, root, media.url);
      }
    } else {
      for (const child of playlist.urls) {
        last = await inspect(new URL(child, response.url).href, depth + 1, root, path);
        if (last.ok || probeOutcome(last) === 'unsafe') return last;
      }
    }
    // A missing live segment or child rendition does not prove the station endpoint is gone.
    if (last && probeOutcome(last) === 'unavailable') return { ...last, outcome: 'inconclusive', reason: 'playlist-child-unavailable' };
    return last ?? result(false, 'playlist-unverified', response.status, root || response.url);
  }
  try { return await inspect(url); }
  catch (error) { const message = error instanceof Error ? error.message : ''; return result(false, controller.signal.aborted ? 'timeout' : ['unsafe-url','non-public-address','redirect-limit','playlist-loop','request-limit'].includes(message) ? message : 'network-or-invalid-url'); }
  finally { clearTimeout(timer); }
}
