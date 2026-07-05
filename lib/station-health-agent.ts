import type { Station } from '@/lib/stations';
import {
  healthMemoryBoost,
  markStationHealthy,
  markStationUnhealthy,
  stationHealthKey,
} from '@/lib/station-health';

export type StationHealthAgentStatus = 'healthy' | 'degraded' | 'dead' | 'skipped';

export type StationHealthProbeReason =
  | 'missing-stream-url'
  | 'probe-ok'
  | 'playlist-response'
  | 'http-error'
  | 'timeout'
  | 'network-error'
  | 'opaque-response'
  | 'unsupported-content-type'
  | 'metadata-only';

export type StationHealthProbeOptions = {
  timeoutMs?: number;
  markMemory?: boolean;
  now?: number;
  fetcher?: typeof fetch;
};

export type StationHealthProbeResult = {
  stationKey: string;
  stationName: string;
  countryCode: string;
  url: string;
  status: StationHealthAgentStatus;
  reason: StationHealthProbeReason;
  httpStatus?: number;
  contentType?: string;
  responseTimeMs?: number;
  checkedAt: string;
  healthMemoryDelta: number;
};

export type StationHealthAgentRunOptions = StationHealthProbeOptions & {
  concurrency?: number;
  limit?: number;
  includeSkipped?: boolean;
};

export type StationHealthAgentSummary = {
  checked: number;
  healthy: number;
  degraded: number;
  dead: number;
  skipped: number;
  averageResponseTimeMs: number | null;
};

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CONCURRENCY = 6;
const PLAYLIST_TYPES = ['mpegurl', 'm3u', 'pls', 'scpls', 'x-scpls'];
const STREAM_TYPES = ['audio/', 'application/ogg', 'application/octet-stream'];

function streamUrl(station: Station) {
  return (station.url_resolved || station.url || '').trim();
}

function isPlaylistContentType(contentType = '') {
  const value = contentType.toLowerCase();
  return PLAYLIST_TYPES.some((type) => value.includes(type));
}

function isLikelyPlayableContentType(contentType = '') {
  const value = contentType.toLowerCase();
  return STREAM_TYPES.some((type) => value.includes(type)) || isPlaylistContentType(value);
}

function classifySuccessfulResponse(contentType: string): Pick<StationHealthProbeResult, 'status' | 'reason'> {
  if (!contentType) return { status: 'degraded', reason: 'metadata-only' };
  if (isPlaylistContentType(contentType)) return { status: 'healthy', reason: 'playlist-response' };
  if (isLikelyPlayableContentType(contentType)) return { status: 'healthy', reason: 'probe-ok' };
  return { status: 'degraded', reason: 'unsupported-content-type' };
}

function abortAfter(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeout };
}

export async function probeStationHealth(station: Station, options: StationHealthProbeOptions = {}): Promise<StationHealthProbeResult> {
  const now = options.now ?? Date.now();
  const url = streamUrl(station);
  const stationKey = stationHealthKey(station);
  const checkedAt = new Date(now).toISOString();
  const healthMemoryDelta = healthMemoryBoost(station, now);

  if (!url) {
    if (options.markMemory !== false) markStationUnhealthy(station, 'missing-stream-url', now);
    return {
      stationKey,
      stationName: station.name,
      countryCode: station.country_code,
      url,
      status: 'skipped',
      reason: 'missing-stream-url',
      checkedAt,
      healthMemoryDelta,
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetcher = options.fetcher ?? fetch;
  const startedAt = Date.now();
  const { controller, timeout } = abortAfter(timeoutMs);

  try {
    const response = await fetcher(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'audio/*,application/ogg,application/vnd.apple.mpegurl,application/x-mpegurl,*/*;q=0.5',
        Range: 'bytes=0-1023',
      },
    });
    const responseTimeMs = Date.now() - startedAt;
    const contentType = response.headers.get('content-type') ?? '';

    if (response.type === 'opaque') {
      if (options.markMemory !== false) markStationUnhealthy(station, 'opaque-response', now);
      return {
        stationKey,
        stationName: station.name,
        countryCode: station.country_code,
        url,
        status: 'degraded',
        reason: 'opaque-response',
        responseTimeMs,
        checkedAt,
        healthMemoryDelta,
      };
    }

    if (!response.ok && response.status !== 206) {
      if (options.markMemory !== false) markStationUnhealthy(station, `http-${response.status}`, now);
      return {
        stationKey,
        stationName: station.name,
        countryCode: station.country_code,
        url,
        status: response.status >= 500 ? 'degraded' : 'dead',
        reason: 'http-error',
        httpStatus: response.status,
        contentType,
        responseTimeMs,
        checkedAt,
        healthMemoryDelta,
      };
    }

    const classification = classifySuccessfulResponse(contentType);
    if (options.markMemory !== false) {
      if (classification.status === 'healthy') markStationHealthy(station, now);
      else markStationUnhealthy(station, classification.reason, now);
    }

    return {
      stationKey,
      stationName: station.name,
      countryCode: station.country_code,
      url,
      ...classification,
      httpStatus: response.status,
      contentType,
      responseTimeMs,
      checkedAt,
      healthMemoryDelta,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startedAt;
    const aborted = error instanceof Error && error.name === 'AbortError';
    const reason: StationHealthProbeReason = aborted ? 'timeout' : 'network-error';
    if (options.markMemory !== false) markStationUnhealthy(station, reason, now);
    return {
      stationKey,
      stationName: station.name,
      countryCode: station.country_code,
      url,
      status: aborted ? 'degraded' : 'dead',
      reason,
      responseTimeMs,
      checkedAt,
      healthMemoryDelta,
    };
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export function summarizeStationHealthRun(results: StationHealthProbeResult[]): StationHealthAgentSummary {
  const responseTimes = results
    .map((result) => result.responseTimeMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    checked: results.length,
    healthy: results.filter((result) => result.status === 'healthy').length,
    degraded: results.filter((result) => result.status === 'degraded').length,
    dead: results.filter((result) => result.status === 'dead').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    averageResponseTimeMs: responseTimes.length
      ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
      : null,
  };
}

export async function runStationHealthAgent(stations: Station[], options: StationHealthAgentRunOptions = {}) {
  const limit = Math.max(0, options.limit ?? stations.length);
  const queue = stations.slice(0, limit);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 12));
  const results: StationHealthProbeResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const station = queue[cursor++];
      const result = await probeStationHealth(station, options);
      if (options.includeSkipped !== false || result.status !== 'skipped') results.push(result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  const summary = summarizeStationHealthRun(results);
  return { summary, results };
}

export function buildStationHealthReport(results: StationHealthProbeResult[]) {
  const summary = summarizeStationHealthRun(results);
  const groups: Record<string, StationHealthProbeResult[]> = {};

  for (const result of results) {
    const country = result.countryCode || 'UN';
    groups[country] ??= [];
    groups[country].push(result);
  }

  const byCountry: Record<string, StationHealthAgentSummary> = {};
  for (const [country, list] of Object.entries(groups)) {
    byCountry[country] = summarizeStationHealthRun(list);
  }

  return {
    generatedAt: new Date().toISOString(),
    summary,
    byCountry,
    deadStations: results.filter((result) => result.status === 'dead'),
    degradedStations: results.filter((result) => result.status === 'degraded'),
  };
}
