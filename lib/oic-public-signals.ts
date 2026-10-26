import { HttpOicWaveAtlasClient, type WaveAtlasIntelligenceSignal } from './oic-intelligence';

export type OicPublicSignalContext = {
  layer: 'earthquakes' | 'events' | 'iss';
  pointCount: number;
};

export type OicPublicSignalEnrichment = {
  enabled: boolean;
  signals: WaveAtlasIntelligenceSignal[];
  degraded: boolean;
  reason?: string;
};

export function isOicWorldSignalsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.WAVEATLAS_OIC_WORLD_SIGNALS === 'true' && Boolean(env.OIC_BASE_URL);
}

export async function enrichPublicSignalsWithOic(
  context: OicPublicSignalContext,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OicPublicSignalEnrichment> {
  if (!isOicWorldSignalsEnabled(env)) return { enabled: false, signals: [], degraded: false };

  try {
    const client = new HttpOicWaveAtlasClient(env.OIC_BASE_URL ?? '');
    const signals = await client.discover({
      intent: 'observe-world',
      query: `WaveAtlas public signal layer ${context.layer} contains ${context.pointCount} normalized observations. Add external context only when provenance is retained. Geographic claims require GeoAware-Core verification.`,
    });

    return {
      enabled: true,
      signals,
      degraded: signals.some((signal) => signal.degraded || signal.spatialAuthority !== 'GeoAware-Core'),
    };
  } catch (error) {
    return {
      enabled: true,
      signals: [],
      degraded: true,
      reason: error instanceof Error ? error.message : 'OIC enrichment unavailable',
    };
  }
}
