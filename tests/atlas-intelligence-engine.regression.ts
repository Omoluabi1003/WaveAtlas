import assert from 'node:assert/strict';
import { AIE_ARCHITECTURAL_RULES, AIE_ENGINES, calculateStationReliabilityIndex, rankStationsWithAIE, unclePaulsWeatherForecast } from '../lib/atlas-intelligence-engine';
import type { Station } from '../lib/stations';

function station(input: Partial<Station> & Pick<Station, 'id' | 'name'>): Station {
  return {
    station_uuid: input.id,
    url: 'https://example.com/live.mp3',
    url_resolved: 'https://example.com/live.mp3',
    country: 'United States',
    country_code: 'US',
    state: 'Test',
    city: 'Test City',
    language: 'English',
    tags: ['music'],
    codec: 'MP3',
    bitrate: 128,
    latitude: 40,
    longitude: -73,
    votes: 100,
    click_count: 100,
    health_score: 80,
    is_active: true,
    last_check_ok: true,
    last_checked_at: '2026-07-09T00:00:00.000Z',
    failure_count: 0,
    response_time_ms: 100,
    ...input,
  };
}

assert.ok(AIE_ARCHITECTURAL_RULES.some((rule) => rule.includes('Every station decision')));
assert.ok(AIE_ENGINES.includes("Uncle Paul's Weather Forecast"));

const nearButWeak = station({ id: 'near-weak', name: 'Nearest Weak Signal', health_score: 35, failure_count: 2, votes: 1, click_count: 1, last_check_ok: false, tags: ['music'] });
const trustedFarther = station({ id: 'trusted-farther', name: 'Trusted Public Radio', health_score: 98, votes: 5000, click_count: 60000, curation_tier: 'curated_atlas', verification_status: 'verified', tags: ['public', 'news'] });

const ranked = rankStationsWithAIE([nearButWeak, trustedFarther], (candidate) => ({
  kind: 'beacon',
  geographicRelevance: candidate.id === 'near-weak' ? 100 : 72,
  geoConfidence: 90,
  weather: { condition: 'Thunderstorms nearby', severity: 'warning', officialBroadcasterPreferred: true },
}));
assert.equal(ranked[0].station.id, 'trusted-farther', 'AIE should prefer the trusted station over the nearest weak station');
assert.equal(calculateStationReliabilityIndex(nearButWeak).tier, 'Bronze');
assert.match(unclePaulsWeatherForecast({ condition: 'Heavy rain approaching', severity: 'watch' }), /Uncle Paul's Weather Forecast/);

console.log('atlas intelligence engine regression passed');
