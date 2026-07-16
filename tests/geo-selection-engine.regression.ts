import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AtlasInteractionEngine } from '../lib/atlas-interaction-engine';
import { normalizeGeoClick, selectStationFromGeoClick, applyGeoSelectionDecision, getGeoSelectionCandidates } from '../lib/geo-selection-engine';
import type { Station } from '../lib/stations';

const base = (overrides: Partial<Station>): Station => ({
  id: 'station', station_uuid: overrides.id ?? 'station', name: 'Station', url: 'https://example.com/live.mp3', country: 'United States', country_code: 'US', state: 'Test', city: 'Test', language: 'English', tags: [], codec: 'MP3', bitrate: 128, latitude: 40, longitude: -75, votes: 10, click_count: 10, health_score: 70, is_active: true, last_check_ok: true, last_checked_at: new Date().toISOString(), failure_count: 0, response_time_ms: 200, ...overrides,
});

assert.equal(normalizeGeoClick({ lat: Number.NaN, lng: -75, view: 'map' }), null);
assert.equal(normalizeGeoClick({ lat: 91, lng: -75, view: 'globe' }), null);
assert.equal(normalizeGeoClick({ lat: null, lng: -75, view: 'map' }), null);
assert.equal(normalizeGeoClick({ lat: '', lng: -75, view: 'map' }), null);
assert.equal(normalizeGeoClick({ lat: true, lng: -75, view: 'map' }), null);
assert.equal(normalizeGeoClick({ lat: 40, lng: null, view: 'map' }), null);

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

const crossBorderNear = base({ id: 'cross-border-near', station_uuid: 'cross-border-near', name: 'Cross Border Near', country: 'Canada', country_code: 'CA', latitude: 40.001, longitude: -75.001, health_score: 100, votes: 9000, click_count: 9000 });
const inCountryFar = base({ id: 'in-country-far', station_uuid: 'in-country-far', name: 'In Country Far', latitude: 41, longitude: -76, health_score: 75 });
decision = selectStationFromGeoClick(mapLocation, [crossBorderNear, inCountryFar], { view: 'map', countryCode: 'US', countryName: 'United States' });
assert.equal(decision.selectedStation?.id, 'in-country-far');
assert.equal(decision.candidateStations.some((station) => station.id === 'cross-border-near'), false);

assert.deepEqual(getGeoSelectionCandidates(mapLocation, null as unknown as Station[], { view: 'map' }), []);

const fallbackNearest = base({ id: 'fallback-nearest', station_uuid: 'fallback-nearest', name: 'Fallback Near', latitude: 40.02, longitude: -75.02, health_score: 70, votes: 1, click_count: 1, validation_status: undefined, verification_status: undefined });
decision = selectStationFromGeoClick(mapLocation, [fallbackNearest], { view: 'map' });
assert.equal(decision.selectedStation?.id, 'fallback-nearest');

const handedOff: Station[] = [];
assert.equal(applyGeoSelectionDecision(decision, { onStationSelect: (station) => { handedOff.push(station); } }), true);
assert.equal(applyGeoSelectionDecision(decision, { onStationSelect: (station) => { handedOff.push(station); } }), true);
assert.equal(handedOff.length, 1, 'synthetic click after touchend must not trigger duplicate station selection');
assert.equal(handedOff[0]?.id, 'fallback-nearest');
assert.equal(applyGeoSelectionDecision(decision, {}), false);

const activeOnly = base({ id: 'active-only', station_uuid: 'active-only', name: 'Active Only', latitude: 40.03, longitude: -75.03 });
decision = selectStationFromGeoClick(mapLocation, [activeOnly], { view: 'map', activeStationKey: 'active-only' });
assert.equal(decision.selectedStation?.id, 'active-only', 'active station may be retained only when it is the sole playable option');
assert.equal(decision.candidateCountBeforeActiveExclusion, 1);
assert.equal(decision.candidateCountAfterActiveExclusion, 1);

const activeNear = base({ id: 'active-near', station_uuid: 'active-near', name: 'Active Near', latitude: 40.001, longitude: -75.001, health_score: 95 });
const alternateFar = base({ id: 'alternate-far', station_uuid: 'alternate-far', name: 'Alternate Far', latitude: 40.04, longitude: -75.04, health_score: 90 });
decision = selectStationFromGeoClick(mapLocation, [activeNear, alternateFar], { view: 'map', activeStationKey: 'active-near' });
assert.equal(decision.selectedStation?.id, 'alternate-far', 'active station is excluded when alternatives exist');
assert.equal(decision.candidateCountBeforeActiveExclusion, 2);
assert.equal(decision.candidateCountAfterActiveExclusion, 1);

const borderLocation = normalizeGeoClick({ lat: 56.13, lng: -106.34, view: 'map', source: 'mouse', rawEventType: 'click', timestamp: 11 });
assert.ok(borderLocation);
const canadaOnly = base({ id: 'canada-only', station_uuid: 'canada-only', name: 'Canada Only', country: 'Canada', country_code: 'CA', latitude: 56.1304, longitude: -106.3468, health_score: 88 });
decision = selectStationFromGeoClick(borderLocation, [canadaOnly], { view: 'map', countryCode: 'US', countryName: 'United States' });
assert.equal(decision.selectedStation, null, 'known country does not silently cross borders');
decision = selectStationFromGeoClick(borderLocation, [canadaOnly], { view: 'map', countryCode: 'US', countryName: 'United States', allowCrossBorderFallback: true });
assert.equal(decision.selectedStation?.id, 'canada-only', 'explicit cross-border fallback selects nearest playable when country has none');
assert.equal(decision.fallbackReason, 'cross-border-fallback-no-country-playable-candidates');

const infiniteA = base({ id: 'infinite-a', station_uuid: 'infinite-a', name: 'Infinite A', latitude: null as unknown as number, longitude: null as unknown as number, country: 'United States', country_code: 'US', votes: 2, click_count: 1, health_score: 70 });
const infiniteB = base({ id: 'infinite-b', station_uuid: 'infinite-b', name: 'Infinite B', latitude: null as unknown as number, longitude: null as unknown as number, country: 'United States', country_code: 'US', votes: 2, click_count: 1, health_score: 70 });
const infiniteCandidates = getGeoSelectionCandidates(mapLocation, [infiniteB, infiniteA], { view: 'map', countryCode: 'US' });
assert.deepEqual(infiniteCandidates.map((item) => item.station.id), ['infinite-a', 'infinite-b'], 'infinite distance tie-breaker is deterministic');


const globeFallbackStation = base({ id: 'globe-fallback', station_uuid: 'globe-fallback', name: 'Globe Fallback', country: 'Sao Tome and Principe', country_code: 'ST', latitude: 0.1864, longitude: 6.6131, health_score: 92 });
const interaction = new AtlasInteractionEngine({
  dragThresholdPx: 8,
  stationsProvider: () => [globeFallbackStation],
  activeStationKeyProvider: () => null,
  countryResolver: () => null,
  geometryProvider: () => ({
    geometry: { width: 200, height: 200, radius: 90, centerX: 100, centerY: 100, usableBounds: { left: 100, top: 100, right: 0, bottom: 0 } },
    rotation: { rotX: 0, rotY: 0 },
  }),
});
interaction.pointerDown({ pointerId: 1, clientX: 100, clientY: 100 });
const interactionResult = interaction.pointerUp({
  pointerId: 1,
  clientX: 100,
  clientY: 100,
  canvasRect: { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
});


const usaCountry = { name: 'United States', code: 'US', flag: '🇺🇸', centroid: { lat: 39, lng: -98 }, station_count: 2 };
const countryInteraction = new AtlasInteractionEngine({
  dragThresholdPx: 8,
  stationsProvider: () => [crossBorderNear, inCountryFar],
  activeStationKeyProvider: () => null,
  countryResolver: () => usaCountry,
  geometryProvider: () => ({ geometry: { width: 200, height: 200, radius: 90, centerX: 100, centerY: 100 }, rotation: { rotX: 0, rotY: 0 } }),
});
countryInteraction.pointerDown({ pointerId: 5, clientX: 100, clientY: 100 });
const countryResult = countryInteraction.pointerUp({ pointerId: 5, clientX: 100, clientY: 100, canvasRect: { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect });
assert.equal(countryResult.kind, 'destination');
if (countryResult.kind === 'destination') assert.equal(countryResult.event.station.country_code, 'US', 'globe country polygon selections remain country scoped when candidates exist');

const dragInteraction = new AtlasInteractionEngine({ dragThresholdPx: 8, stationsProvider: () => [globeFallbackStation], activeStationKeyProvider: () => null, countryResolver: () => null, geometryProvider: () => ({ geometry: { width: 200, height: 200, radius: 90, centerX: 100, centerY: 100 }, rotation: { rotX: 0, rotY: 0 } }) });
dragInteraction.pointerDown({ pointerId: 7, clientX: 100, clientY: 100 });
dragInteraction.pointerMove({ pointerId: 7, clientX: 130, clientY: 100 });
assert.equal(dragInteraction.pointerUp({ pointerId: 7, clientX: 130, clientY: 100, canvasRect: { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect }).kind, 'rejected', 'drag gestures are rejected');

const pinchInteraction = new AtlasInteractionEngine({ dragThresholdPx: 8, stationsProvider: () => [globeFallbackStation], activeStationKeyProvider: () => null, countryResolver: () => null, geometryProvider: () => ({ geometry: { width: 200, height: 200, radius: 90, centerX: 100, centerY: 100 }, rotation: { rotX: 0, rotY: 0 } }) });
pinchInteraction.pointerDown({ pointerId: 8, clientX: 100, clientY: 100 });
pinchInteraction.pointerDown({ pointerId: 9, clientX: 102, clientY: 102 });
assert.equal(pinchInteraction.pointerUp({ pointerId: 8, clientX: 100, clientY: 100, canvasRect: { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect }).kind, 'rejected', 'pinch gestures are rejected');
pinchInteraction.pointerCancel(9);
pinchInteraction.pointerDown({ pointerId: 10, clientX: 100, clientY: 100 });
assert.equal(pinchInteraction.pointerUp({ pointerId: 10, clientX: 100, clientY: 100, canvasRect: { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect }).kind, 'destination', 'engine recovers after stale pointer cancellation');

assert.equal(interactionResult.kind, 'destination');
if (interactionResult.kind === 'destination') {
  assert.equal(interactionResult.event.station.id, 'globe-fallback');
  assert.equal(interactionResult.diagnostics.fallbackReason, 'country-boundaries-unavailable-nearest-playable-station');
}

const app = readFileSync('components/WaveAtlasApp.tsx', 'utf8');
const globe = readFileSync('components/BlueMarbleGlobe.tsx', 'utf8');
const atlasInteraction = readFileSync('lib/atlas-interaction-engine.ts', 'utf8');
assert.match(app, /selectStationFromGeoClick/);
assert.match(app, /applyGeoSelectionDecision/);
assert.match(atlasInteraction, /getGeoSelectionCandidates/);
assert.match(atlasInteraction, /country-boundaries-unavailable-nearest-playable-station/);
assert.match(globe, /AtlasInteractionEngine/);
assert.match(app, /setScopedStationAndDestination\(selected, "manual", candidates, label\)/);

console.log('Geo Selection Engine regression checks passed.');
