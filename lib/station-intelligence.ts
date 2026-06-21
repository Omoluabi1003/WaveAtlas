import type { Station } from '@/lib/stations';
import { isCuratedStation, rankStations } from '@/lib/stations';
import { healthMemoryBoost } from '@/lib/station-health';
import { prioritizeWeakCountryPacks } from '@/lib/country-packs';

export const STATION_INTELLIGENCE_TIERS = {
  curatedAtlas: { priority: 1, trusted: true, label: 'Tier 1 Curated Atlas' },
  radioBrowser: { priority: 2, trusted: true, label: 'Tier 2 Radio Browser Backbone' },
  candidateDiscovery: { priority: 3, trusted: false, autoPublish: false, label: 'Tier 3 Candidate Discovery' },
} as const;

export type StationIntelligenceStatus = 'candidate' | 'needs_review' | 'verified' | 'rejected' | 'curated';

export function stationIntelligenceStatus(station: Station): StationIntelligenceStatus {
  if (isCuratedStation(station)) return 'curated';
  if (station.validation_status === 'needs_review') return 'needs_review';
  if (station.validation_status === 'failed') return 'rejected';
  if (station.validation_status === 'verified' || station.last_check_ok) return 'verified';
  return 'candidate';
}

export function stationTrustScore(station: Station) {
  const tierBoost = isCuratedStation(station) ? 220 : station.curation_tier === 'radio_browser' ? 90 : 0;
  const reviewBoost = stationIntelligenceStatus(station) === 'verified' ? 80 : stationIntelligenceStatus(station) === 'curated' ? 140 : 0;
  const penalties = station.failure_count * 25 + (station.is_active ? 0 : 120);
  return Math.max(0, Math.round(station.health_score + tierBoost + reviewBoost + healthMemoryBoost(station) - penalties));
}

export function prioritizeVerifiedCoverage(stations: Station[], query = '') {
  return rankStations(stations, query).sort((a, b) => stationTrustScore(b) - stationTrustScore(a));
}

export function buildStationIntelligenceReport(stations: Station[]) {
  const byStatus = stations.reduce<Record<StationIntelligenceStatus, number>>((acc, station) => {
    const status = stationIntelligenceStatus(station);
    acc[status] += 1;
    return acc;
  }, { candidate: 0, needs_review: 0, verified: 0, rejected: 0, curated: 0 });
  return {
    mission: 'Prioritize verified coverage over raw quantity.',
    totalStations: stations.length,
    byStatus,
    weakCountryPacks: prioritizeWeakCountryPacks(stations),
    principles: ['Quality first', 'Fast playback always', 'Never trust unknown streams automatically', 'Human curation beats random scraping', 'The user should never experience silence'],
  };
}
