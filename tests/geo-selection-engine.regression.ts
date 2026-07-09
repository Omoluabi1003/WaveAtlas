import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeGeoClick, selectStationFromGeoClick, applyGeoSelectionDecision } from '../lib/geo-selection-engine';
import type { Station } from '../lib/stations';

const base = (overrides: Partial<Station>): Station => ({
  id: 'station', station_uuid: overrides.id ?? 'station', name: 'Station', url: 'https://example.com/live.mp3', country: 'United States', country_code: 'US', state: 'Test', city: 'Test', language: 'English', tags: [], codec: 'MP3', bitrate: 128, latitude: 40, longitude: -75, votes: 10, click_count: 10, health_score: 70, is_active: true, last_check_ok: true, last_checked_at: new Date().toISOString(), failure_count: 0, response_time_ms: 200, ...overrides,
});

assert.equal(normalizeGeoClick({ lat: Number.NaN, lng: -75, view: 'map' }), null);
assert.equal(normalizeGeoClick({ lat: 91, lng: -75, view: 'globe' }), null);

const mapLocation = normalizeGeoClick({ lat: 40, lng: -75, view: 'map', source: 'mouse', rawEventType: 'click', timestamp: 10 });
const globeLocation = normalizeGeoClick({ latitude: 40, longitude: 285, view: 'globe', source: 'pointer', rawEventType: 'pointerup', timestamp: 10, precision: 'projected' });
assert.ok(mapLocation);
assert.ok(globeLocation);
assert.deepEqual(Object.keys(mapLocation).sort(), ['lat', 'lng', 'precision', 'rawEventType', 'source', 'timestamp', 'view'].sort());
assert.deepEqual(Object.keys(globeLocation).sort(), Object.keys(mapLocation).sort());
assert.equal(globeLocation.lng, -75);

const brokenNear = base({ id: 'broken-near', station_uuid: 'broken-near', name: 'Broken Near', url: 'https://example.com/broken.mp3', latitude: 40.01, longitude: -75.01, health_score: 95, last_check_ok: false });
const trustedFar = base({ id: 'trusted-far', station_uuid: 'trusted-far', name: 'Trusted Far', latitude: 40.2, longitude: -75.2, health_score: 96, votes: 5000, click_count: 20000, validation_status: 'verified', verification_status: 'verified' });
let decision = selectStationFromGeoClick(mapLocation, [brokenNear, trustedFar], { view: 'map', countryCode: 'US' });
assert.equal(decision.selectedStation?.id, 'trusted-far');
assert.equal(decision.candidateStations.some((station) => station.id === 'broken-near'), false);

const fallbackNearest = base({ id: 'fallback-nearest', station_uuid: 'fallback-nearest', name: 'Fallback Near', latitude: 40.02, longitude: -75.02, health_score: 70, votes: 1, click_count: 1, validation_status: undefined, verification_status: undefined });
decision = selectStationFromGeoClick(mapLocation, [fallbackNearest], { view: 'map' });
assert.equal(decision.selectedStation?.id, 'fallback-nearest');

const handedOff: Station[] = [];
assert.equal(applyGeoSelectionDecision(decision, { onStationSelect: (station) => { handedOff.push(station); } }), true);
assert.equal(handedOff[0]?.id, 'fallback-nearest');

const app = readFileSync('components/WaveAtlasApp.tsx', 'utf8');
const globe = readFileSync('components/BlueMarbleGlobe.tsx', 'utf8');
const atlasInteraction = readFileSync('lib/atlas-interaction-engine.ts', 'utf8');
assert.match(app, /selectStationFromGeoClick/);
assert.match(app, /applyGeoSelectionDecision/);
assert.match(atlasInteraction, /getGeoSelectionCandidates/);
assert.match(globe, /AtlasInteractionEngine/);
assert.match(app, /setScopedStationAndDestination\(selected, "manual", candidates, label\)/);

console.log('Geo Selection Engine regression checks passed.');
