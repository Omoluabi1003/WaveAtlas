import type { Station } from '../stations';

export type ConnectorStatus = 'active' | 'stub';
export type StationSourceName = 'radio_browser' | 'curated' | 'future_provider';

export type RawStationEvidence = {
  sourceName: StationSourceName | string;
  sourceStationId: string;
  sourceUrl?: string;
  rawName?: string;
  rawCountry?: string;
  rawCountryCode?: string;
  rawCity?: string;
  rawLanguage?: string;
  rawGenres?: string[];
  rawStreamUrl?: string;
  rawHomepage?: string;
  rawLat?: number;
  rawLng?: number;
  evidenceConfidence?: number;
  rawPayload?: unknown;
  collectedAt?: string;
};

export type NormalizedStationEvidence = RawStationEvidence & {
  stationUuid: string;
  normalized: Partial<Station>;
  evidenceConfidence: number;
  collectedAt: string;
};

export interface StationSourceConnector<RawStation = unknown> {
  readonly name: StationSourceName | string;
  readonly status: ConnectorStatus;
  readonly purpose: string;
  searchStations(query: string): Promise<RawStation[]>;
  getStationsByCountry(countryCode: string): Promise<RawStation[]>;
  getStationsByGenre(genre: string): Promise<RawStation[]>;
  getStationById(id: string): Promise<RawStation | null>;
  normalize(rawStation: RawStation): NormalizedStationEvidence;
}

export function stableStationUuid(sourceName: string, sourceStationId: string, fallbackName = '') {
  const seed = `${sourceName}:${sourceStationId || fallbackName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return seed || `station-${Date.now()}`;
}

export function clampConfidence(value = 0.5) {
  return Math.max(0, Math.min(1, value));
}
