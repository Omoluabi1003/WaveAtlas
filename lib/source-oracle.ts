import type { Station } from './stations';

export type SourceTier = 1 | 2 | 3 | 4;

export type SourceId =
  | 'radio_browser'
  | 'tunein'
  | 'mytuner'
  | 'streema'
  | 'radio_garden'
  | 'bbc'
  | 'nhk'
  | 'abc_australia'
  | 'cbc'
  | 'radio_france'
  | 'rfi'
  | 'dw'
  | 'sabc'
  | 'voa'
  | 'vatican_radio'
  | 'station_steward'
  | 'community';

export type SourceProfile = { id: SourceId; label: string; tier: SourceTier; weight: number; purpose: string };

export type StationSourceClaim = {
  source: SourceId;
  stationUuid?: string;
  name?: string;
  url?: string;
  homepage?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  state?: string;
  language?: string;
  genres?: string[];
  latitude?: number;
  longitude?: number;
  streamHealthy?: boolean;
  healthScore?: number;
  updatedAt?: string;
};

export type StationTruthScores = {
  identityScore: number;
  geoScore: number;
  metadataScore: number;
  streamHealthScore: number;
  consensusScore: number;
  confidenceScore: number;
  conflictCount: number;
};

export type StationTruthResult = {
  canonical: Partial<Station> & { source: SourceId; source_count: number; consensus_score: number; confidence_score: number };
  scores: StationTruthScores;
  conflicts: Array<{ field: string; winningValue: string; rejectedValues: string[] }>;
  sources: Array<StationSourceClaim & { weight: number; tier: SourceTier }>;
};

export const SOURCE_PROFILES: Record<SourceId, SourceProfile> = {
  radio_browser: { id: 'radio_browser', label: 'Radio Browser', tier: 1, weight: 0.8, purpose: 'Global station discovery' },
  tunein: { id: 'tunein', label: 'TuneIn', tier: 1, weight: 0.9, purpose: 'Commercial metadata enrichment' },
  mytuner: { id: 'mytuner', label: 'MyTuner', tier: 1, weight: 0.85, purpose: 'International metadata enrichment' },
  streema: { id: 'streema', label: 'Streema', tier: 1, weight: 0.8, purpose: 'Station identity and descriptive metadata' },
  radio_garden: { id: 'radio_garden', label: 'Radio Garden', tier: 1, weight: 0.75, purpose: 'Geographic validation' },
  bbc: { id: 'bbc', label: 'BBC', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  nhk: { id: 'nhk', label: 'NHK', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  abc_australia: { id: 'abc_australia', label: 'ABC Australia', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  cbc: { id: 'cbc', label: 'CBC', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  radio_france: { id: 'radio_france', label: 'Radio France', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  rfi: { id: 'rfi', label: 'RFI', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  dw: { id: 'dw', label: 'DW', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  sabc: { id: 'sabc', label: 'SABC', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  voa: { id: 'voa', label: 'VOA', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  vatican_radio: { id: 'vatican_radio', label: 'Vatican Radio', tier: 2, weight: 1, purpose: 'Authoritative broadcaster source' },
  station_steward: { id: 'station_steward', label: 'Station Steward', tier: 3, weight: 0.95, purpose: 'Direct stream and homepage discovery' },
  community: { id: 'community', label: 'Community', tier: 4, weight: 0.65, purpose: 'Human submitted corrections awaiting consensus' },
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const normalized = (value?: string) => value?.trim().toLowerCase();
const hasCoordinate = (claim: StationSourceClaim) => typeof claim.latitude === 'number' && typeof claim.longitude === 'number';

function weightedVote(claims: StationSourceClaim[], field: keyof StationSourceClaim) {
  const votes = new Map<string, { label: string; score: number }>();
  for (const claim of claims) {
    const value = claim[field];
    if (typeof value !== 'string' || !value.trim()) continue;
    const key = normalized(value)!;
    const profile = SOURCE_PROFILES[claim.source];
    votes.set(key, { label: value.trim(), score: (votes.get(key)?.score ?? 0) + profile.weight });
  }
  return [...votes.values()].sort((a, b) => b.score - a.score)[0];
}

function fieldAgreement(claims: StationSourceClaim[], field: keyof StationSourceClaim) {
  const winner = weightedVote(claims, field);
  if (!winner) return 0;
  const total = claims.reduce((sum, claim) => sum + SOURCE_PROFILES[claim.source].weight, 0);
  return total ? winner.score / total : 0;
}

export function buildRadioBrowserClaim(station: Station): StationSourceClaim {
  return {
    source: 'radio_browser', stationUuid: station.station_uuid, name: station.name, url: station.url_resolved || station.url,
    homepage: station.homepage, country: station.country, countryCode: station.country_code, city: station.city, state: station.state,
    language: station.language, genres: station.tags, latitude: station.latitude, longitude: station.longitude,
    streamHealthy: station.is_active, healthScore: station.health_score, updatedAt: station.last_checked_at,
  };
}

export function reconcileStationTruth(claims: StationSourceClaim[]): StationTruthResult {
  const validClaims = claims.filter((claim) => SOURCE_PROFILES[claim.source]);
  if (!validClaims.length) throw new Error('Source Oracle requires at least one recognized source claim');
  const sourceWeight = validClaims.reduce((sum, claim) => sum + SOURCE_PROFILES[claim.source].weight, 0);
  const country = weightedVote(validClaims, 'country');
  const countryCode = weightedVote(validClaims, 'countryCode');
  const name = weightedVote(validClaims, 'name');
  const url = weightedVote(validClaims, 'url');
  const language = weightedVote(validClaims, 'language');
  const identityAgreement = (fieldAgreement(validClaims, 'name') + fieldAgreement(validClaims, 'url')) / 2;
  const geoAgreement = (fieldAgreement(validClaims, 'countryCode') || fieldAgreement(validClaims, 'country')) * (validClaims.some(hasCoordinate) ? 1 : 0.75);
  const metadataFields = ['name', 'countryCode', 'language', 'homepage'] as const;
  const metadataScore = metadataFields.reduce((sum, field) => sum + fieldAgreement(validClaims, field), 0) / metadataFields.length;
  const streamHealthScore = validClaims.reduce((sum, claim) => sum + (claim.healthScore ?? (claim.streamHealthy ? 90 : 40)) * SOURCE_PROFILES[claim.source].weight, 0) / sourceWeight;
  const consensusScore = (identityAgreement * 0.3 + geoAgreement * 0.25 + metadataScore * 0.2 + streamHealthScore / 100 * 0.25) * 100;
  const conflicts = (['country', 'countryCode', 'name', 'url'] as const).flatMap((field) => {
    const winner = weightedVote(validClaims, field);
    if (!winner) return [];
    const rejectedValues = Array.from(new Set(validClaims.map((claim) => claim[field]).filter((value): value is string => typeof value === 'string' && normalized(value) !== normalized(winner.label))));
    return rejectedValues.length ? [{ field, winningValue: winner.label, rejectedValues }] : [];
  });
  const confidenceScore = consensusScore - Math.min(20, conflicts.length * 4) + Math.min(10, validClaims.length * 2);
  return {
    canonical: {
      name: name?.label, url: url?.label, country: country?.label, country_code: countryCode?.label?.toUpperCase(), language: language?.label,
      source: validClaims.length === 1 ? validClaims[0].source : 'station_steward', source_count: validClaims.length,
      consensus_score: clampScore(consensusScore), confidence_score: clampScore(confidenceScore),
    },
    scores: { identityScore: clampScore(identityAgreement * 100), geoScore: clampScore(geoAgreement * 100), metadataScore: clampScore(metadataScore * 100), streamHealthScore: clampScore(streamHealthScore), consensusScore: clampScore(consensusScore), confidenceScore: clampScore(confidenceScore), conflictCount: conflicts.length },
    conflicts,
    sources: validClaims.map((claim) => ({ ...claim, weight: SOURCE_PROFILES[claim.source].weight, tier: SOURCE_PROFILES[claim.source].tier })),
  };
}
