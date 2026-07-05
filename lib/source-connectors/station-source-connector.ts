import type { Station } from '../stations';

export type ConnectorStatus = 'active' | 'stub';
export type StationSourceName = 'radio_browser' | 'curated' | 'xiph_icecast' | 'official_broadcaster' | 'campus_directory' | 'public_media_network' | 'national_broadcaster_list' | 'community_signal' | 'future_provider';
export type ValidationStatus = 'candidate' | 'verified' | 'needs_review' | 'failed' | 'rejected';

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

export type StreamValidationResult = {
  validation_status: ValidationStatus;
  is_active: boolean;
  url_resolved?: string;
  response_time_ms: number;
  content_type: string;
  codec: string;
  bitrate: number;
  last_verified_at?: string;
  last_checked_at: string;
  failure_count: number;
  health_score: number;
  validation_reason: string;
};

export type NormalizedStationEvidence = RawStationEvidence & {
  stationUuid: string;
  normalized: Partial<Station>;
  evidenceConfidence: number;
  collectedAt: string;
  validation_status?: ValidationStatus;
  last_verified_at?: string;
  response_time_ms?: number;
  codec?: string;
  bitrate?: number;
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
  fetchCandidates?(input?: { query?: string; countryCode?: string; genre?: string; limit?: number }): Promise<RawStation[]>;
  normalizeCandidate?(rawStation: RawStation): NormalizedStationEvidence;
  validateStream?(candidate: NormalizedStationEvidence): Promise<StreamValidationResult>;
  enrichGeo?(candidate: NormalizedStationEvidence): Promise<NormalizedStationEvidence>;
  scoreCandidate?(candidate: NormalizedStationEvidence): number;
}

export interface StationSourceProvider<RawStation = unknown> extends StationSourceConnector<RawStation> {
  readonly primary?: boolean;
  readonly referenceOnly?: boolean;
  readonly usageConstraints?: string[];
}

export function stableStationUuid(sourceName: string, sourceStationId: string, fallbackName = '') {
  const seed = `${sourceName}:${sourceStationId || fallbackName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return seed || `station-${Date.now()}`;
}

export function clampConfidence(value = 0.5) {
  return Math.max(0, Math.min(1, value));
}
