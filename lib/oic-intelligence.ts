export type OicReachChannel = 'web' | 'github' | 'youtube' | 'reddit' | 'x' | 'rss';

export type OicExternalObservation = {
  channel: OicReachChannel;
  sourceUrl?: string;
  retrievedAt: string;
  summary?: string;
  raw?: unknown;
};

export type OicGeoVerification = {
  verified: boolean;
  source: 'GeoAware-Core';
  confidence?: number;
  location?: {
    name?: string;
    countryCode?: string;
    latitude?: number;
    longitude?: number;
  };
};

export type WaveAtlasIntelligenceSignal = {
  id: string;
  kind: 'distress' | 'emergency' | 'weather' | 'station-context' | 'world-event' | 'discovery';
  title: string;
  summary: string;
  observedAt: string;
  provenance: OicExternalObservation[];
  geoVerification?: OicGeoVerification;
  spatialAuthority: 'GeoAware-Core' | 'unverified';
  degraded: boolean;
};

export type OicWaveAtlasRequest = {
  intent: 'observe-world' | 'verify-event' | 'station-context' | 'distress-context';
  query: string;
  stationId?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
};

export interface OicWaveAtlasClient {
  discover(request: OicWaveAtlasRequest): Promise<WaveAtlasIntelligenceSignal[]>;
}

/**
 * WaveAtlas pilot invariant:
 * OIC may observe and synthesize external intelligence, but it may not promote
 * a material location claim to spatial truth until GeoAware-Core verifies it.
 */
export function normalizeOicSignal(signal: WaveAtlasIntelligenceSignal): WaveAtlasIntelligenceSignal {
  const spatiallyVerified = signal.geoVerification?.verified === true && signal.geoVerification.source === 'GeoAware-Core';
  return {
    ...signal,
    spatialAuthority: spatiallyVerified ? 'GeoAware-Core' : 'unverified',
    degraded: signal.degraded || !spatiallyVerified,
  };
}

export class HttpOicWaveAtlasClient implements OicWaveAtlasClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async discover(request: OicWaveAtlasRequest): Promise<WaveAtlasIntelligenceSignal[]> {
    if (!this.baseUrl) return [];
    const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}/v1/products/waveatlas/reach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`OIC reach request failed with HTTP ${response.status}`);
    const payload = (await response.json()) as { signals?: WaveAtlasIntelligenceSignal[] };
    return (payload.signals ?? []).map(normalizeOicSignal);
  }
}
