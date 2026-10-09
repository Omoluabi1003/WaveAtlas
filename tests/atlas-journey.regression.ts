import assert from 'node:assert/strict';
import { geoDistance } from 'd3-geo';
import { JOURNEY_PRESETS, JOURNEY_COUNTRIES, decodeJourney, journeyClock, journeyFlightSeconds, journeyFlightLabel, journeyRouteCountries, journeyDistance, journeyPosition, journeyRegion, nearbyJourneyStations, validJourneyRoute } from '../lib/atlas-journey';
import type { Station } from '../lib/stations';

const route = JOURNEY_PRESETS[0];
assert(validJourneyRoute(route));
assert(journeyDistance(route) > 5800 && journeyDistance(route) < 6000, 'Lagos to Dubai plausible distance');
for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
  const position = journeyPosition(route, progress);
  const travelled = geoDistance([route.from.lng, route.from.lat], [position.lng, position.lat]) * 6371;
  assert(Math.abs(travelled - progress * journeyDistance(route)) < 0.001, 'Constant great-circle progress');
}
assert.deepEqual(journeyPosition(route, -1), journeyPosition(route, 0));
assert.deepEqual(journeyPosition(route, 2), journeyPosition(route, 1));
assert.equal(journeyRegion(route.from)?.code, 'NG');
assert.equal(journeyRegion(route.to)?.code, 'AE');
assert.equal(journeyRegion({ lat: 0, lng: -30 }), null, 'Ocean must not be assigned a nearby country');
const antipodes = { from: { label: 'A', lat: 0, lng: 0 }, to: { label: 'B', lat: 0, lng: 180 } };
assert(Math.abs(journeyPosition(antipodes, 0.25).lng - 45) < 0.0001, 'Antipodal constant velocity');
const dateLine = { from: { label: 'East', lat: 10, lng: 179 }, to: { label: 'West', lat: 10, lng: -179 } };
assert(journeyDistance(dateLine) < 225, 'Shortest path across the date line');
assert(Math.abs(journeyPosition(dateLine, 0.5).lng) > 179);
assert.equal(decodeJourney('invalid'), null);
assert.equal(decodeJourney(JSON.stringify({ from: route.from, to: route.from })), null);
assert.equal(decodeJourney(JSON.stringify({ ...route, to: { ...route.to, lat: 999 } })), null);
assert.equal(decodeJourney(' '.repeat(1201)), null);
assert.deepEqual(decodeJourney(JSON.stringify(route)), route);
assert(JOURNEY_COUNTRIES.length > 150);
assert(JOURNEY_COUNTRIES.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.approximate));
assert.equal(journeyClock(240), '4:00'); assert.equal(journeyClock(-1), '0:00');
const station = (id: string, extra: Partial<Station> = {}): Station => ({ id, station_uuid: id, name: id, country: 'Nigeria', country_code: 'NG', city: 'Lagos', latitude: 6.5244, longitude: 3.3792, url: 'https://radio.example/stream', language: 'English', tags: ['music'], codec: 'MP3', bitrate: 128, votes: 0, click_count: 0, health_score: 90, is_active: true, last_checked_at: '2026-10-09', failure_count: 0, response_time_ms: 100, ...extra });
const good = station('good');
const available = nearbyJourneyStations([good, good, station('offline', { is_active: false }), station('failed', { failure_count: 3 }), station('unlocated', { city: undefined, latitude: undefined, longitude: undefined }), station('far', { country: 'Japan', country_code: 'JP', city: 'Tokyo', latitude: 35.6762, longitude: 139.6503 })], route.from);
assert.equal(available.length, 1, 'Deduplicate and exclude offline, failed, unlocated and distant stations');
assert.equal(available[0].station.id, 'good');
assert(available[0].distanceKm < 1);
console.log('Atlas Journey: route distances, constant progress, dateline, country/ocean geography, shared-route validation, worldwide destination choices, countdown and nearby station eligibility passed');

assert(journeyFlightSeconds(route) > 7 * 3600 && journeyFlightSeconds(route) < 8 * 3600, 'Lagos to Dubai estimate is hours, not four preview minutes');
assert(journeyFlightSeconds(JOURNEY_PRESETS[1]) > journeyFlightSeconds(route), 'Longer route has longer ETA');
assert(journeyFlightSeconds(route, 700) > journeyFlightSeconds(route, 900), 'Cruise speed changes flight estimate');
assert(Number.isFinite(journeyFlightSeconds(route, NaN)), 'Invalid speed has safe default');
assert.equal(journeyFlightLabel(7 * 3600 + 25 * 60), '7h 25m');
const itinerary = journeyRouteCountries(route);
assert.equal(itinerary[0].code, 'NG'); assert.equal(itinerary.at(-1)?.code, 'AE');
assert(itinerary.length > 3 && itinerary.length <= 15, 'Route discovery includes intermediate countries');
assert.equal(new Set(itinerary.map(region => region.code)).size, itinerary.length);
console.log('Journey flight estimates, cruise adjustment, bounded regional itinerary and distinct preview time passed');
