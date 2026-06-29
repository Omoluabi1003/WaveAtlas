import type { Station } from './stations';
import { getStationStreamUrl, stationKey } from './fast-connect-engine';

export type LiveTrackMetadata = {
  title: string;
  artist: string;
  album?: string;
  releaseYear?: number;
  coverArtUrl?: string;
  isrc?: string;
  confidence: number;
  provider: string;
  recognizedAt: string;
  stationKey: string;
};

export type LiveTrackMetadataState = {
  status: 'disabled' | 'idle' | 'identifying' | 'recognized' | 'unrecognized' | 'unsupported' | 'error';
  metadata?: LiveTrackMetadata;
  message?: string;
  nextRefreshAt?: number;
};

type RecognitionResponse = { metadata?: LiveTrackMetadata; message?: string; status?: LiveTrackMetadataState['status'] };

export const LIVE_TRACK_METADATA_MIN_REFRESH_MS = 45_000;
export const LIVE_TRACK_METADATA_MAX_REFRESH_MS = 90_000;
const CACHE_TTL_MS = 8 * 60_000;
const CACHE_BUCKET_MS = 60_000;
const STORAGE_KEY = 'waveatlas:live-track-cache:v1';

function featureFlagEnabled() {
  return process.env.NEXT_PUBLIC_WAVEATLAS_LIVE_TRACK_METADATA === 'true';
}

function refreshIntervalMs() {
  const configured = Number(process.env.NEXT_PUBLIC_WAVEATLAS_LIVE_TRACK_REFRESH_MS ?? '60000');
  if (!Number.isFinite(configured)) return 60_000;
  return Math.min(LIVE_TRACK_METADATA_MAX_REFRESH_MS, Math.max(LIVE_TRACK_METADATA_MIN_REFRESH_MS, configured));
}

function cacheBucket(timestamp = Date.now()) {
  return Math.floor(timestamp / CACHE_BUCKET_MS) * CACHE_BUCKET_MS;
}

function readCache(): Record<string, { expiresAt: number; state: LiveTrackMetadataState }> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '{}') as Record<string, { expiresAt: number; state: LiveTrackMetadataState }>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, { expiresAt: number; state: LiveTrackMetadataState }>) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); } catch { /* live metadata cache is optional */ }
}

function cacheKeyFor(station: Station, timestamp = Date.now()) {
  return `${stationKey(station)}:${cacheBucket(timestamp)}`;
}

function cachedState(station: Station) {
  const now = Date.now();
  const cache = readCache();
  const hit = cache[cacheKeyFor(station, now)];
  return hit && hit.expiresAt > now ? hit.state : undefined;
}

function storeCachedState(station: Station, state: LiveTrackMetadataState) {
  const now = Date.now();
  const cache = readCache();
  for (const [key, value] of Object.entries(cache)) if (value.expiresAt <= now) delete cache[key];
  cache[cacheKeyFor(station, now)] = { expiresAt: now + CACHE_TTL_MS, state };
  writeCache(cache);
}

function browserSupportsIdentification(station: Station) {
  const streamUrl = getStationStreamUrl(station);
  if (!streamUrl || !/^https:\/\//i.test(streamUrl)) return { allowed: false, reason: 'Live track ID requires an HTTPS stream URL.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { allowed: false, reason: 'Offline; live track ID paused.' };
  return { allowed: true, streamUrl };
}

export class LiveTrackMetadataEngine {
  private timer: number | undefined;
  private controller: AbortController | undefined;
  private currentStationKey = '';

  constructor(private onState: (state: LiveTrackMetadataState) => void) {}

  start(station: Station, playbackStatus: string) {
    this.stop(false);
    this.currentStationKey = stationKey(station);
    if (!featureFlagEnabled()) {
      this.onState({ status: 'disabled', message: 'Live song recognition is disabled for this environment.' });
      return;
    }
    if (playbackStatus !== 'playing') {
      this.onState({ status: 'idle', message: 'Song recognition starts after playback is stable.' });
      return;
    }
    const support = browserSupportsIdentification(station);
    if (!support.allowed) {
      this.onState({ status: 'unsupported', message: support.reason });
      return;
    }
    const cached = cachedState(station);
    if (cached) {
      this.onState({ ...cached, nextRefreshAt: Date.now() + refreshIntervalMs() });
      this.schedule(station, support.streamUrl!, refreshIntervalMs());
      return;
    }
    this.identify(station, support.streamUrl!);
  }

  stop(emit = true) {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = undefined;
    this.controller?.abort();
    this.controller = undefined;
    if (emit) this.onState({ status: 'idle' });
  }

  private schedule(station: Station, streamUrl: string, delay = refreshIntervalMs()) {
    this.timer = window.setTimeout(() => this.identify(station, streamUrl), delay);
  }

  private async identify(station: Station, streamUrl: string) {
    const activeKey = stationKey(station);
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const nextRefreshAt = Date.now() + refreshIntervalMs();
    this.onState({ status: 'identifying', message: 'Identifying current song…', nextRefreshAt });
    try {
      const params = new URLSearchParams({ stationKey: activeKey, stationName: station.name, streamUrl });
      const response = await fetch(`/api/live-track-metadata?${params.toString()}`, { signal: controller.signal, cache: 'no-store' });
      const payload: RecognitionResponse = response.ok ? await response.json() as RecognitionResponse : { status: 'error', message: `Recognition provider returned ${response.status}.` };
      if (this.currentStationKey !== activeKey || controller.signal.aborted) return;
      const state: LiveTrackMetadataState = payload.metadata
        ? { status: 'recognized', metadata: payload.metadata, nextRefreshAt }
        : { status: payload.status === 'unsupported' ? 'unsupported' : 'unrecognized', message: payload.message || 'No song match found.', nextRefreshAt };
      storeCachedState(station, state);
      this.onState(state);
      this.schedule(station, streamUrl, refreshIntervalMs());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const state: LiveTrackMetadataState = { status: 'error', message: 'Live song recognition failed without affecting playback.', nextRefreshAt };
      storeCachedState(station, state);
      if (this.currentStationKey === activeKey) {
        this.onState(state);
        this.schedule(station, streamUrl, refreshIntervalMs());
      }
    }
  }
}
