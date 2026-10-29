import assert from 'node:assert/strict';
import test from 'node:test';
import {
  atlasLocationDistanceMeters,
  atlasLocationMayPrompt,
  isPreciseAtlasLocation,
  plausibleLocationTransition,
  PRECISE_LOCATION_MAX_ACCURACY_METERS,
  validAtlasCoordinates,
  type AtlasCoordinates,
} from '../lib/atlas-location';

const now = Date.now();
const newZealand: AtlasCoordinates = {
  lat: -36.8485,
  lng: 174.7633,
  accuracy: 24,
  timestamp: now,
  source: 'device',
};
const chile: AtlasCoordinates = {
  lat: -33.4489,
  lng: -70.6693,
  accuracy: 30,
  timestamp: now + 60_000,
  source: 'device',
};

test('accepts valid high-accuracy device coordinates', () => {
  assert.equal(validAtlasCoordinates(newZealand), true);
  assert.equal(isPreciseAtlasLocation(newZealand), true);
});

test('coarse positions never qualify as precise current location', () => {
  const coarse = { lat: -40.9006, lng: 174.886, accuracy: PRECISE_LOCATION_MAX_ACCURACY_METERS + 1 };
  assert.equal(validAtlasCoordinates(coarse), true);
  assert.equal(isPreciseAtlasLocation(coarse), false);
});

test('invalid coordinate bounds are rejected', () => {
  assert.equal(validAtlasCoordinates({ lat: 95, lng: 174, accuracy: 10 }), false);
  assert.equal(validAtlasCoordinates({ lat: -36, lng: 190, accuracy: 10 }), false);
});

test('New Zealand cannot suddenly become Chile from a fresh precise fix', () => {
  assert.ok(atlasLocationDistanceMeters(newZealand, chile) > 9_000_000);
  assert.equal(plausibleLocationTransition(newZealand, chile, now + 60_000), false);
});

test('genuine long-distance travel is allowed after sufficient elapsed time', () => {
  const previous = { ...newZealand, timestamp: now - 12 * 60 * 60_000 };
  assert.equal(plausibleLocationTransition(previous, { ...chile, timestamp: now }, now), true);
});

test('normal local movement remains valid', () => {
  const aucklandNearby = { ...newZealand, lat: -36.8509, lng: 174.7645, timestamp: now + 30_000 };
  assert.equal(plausibleLocationTransition(newZealand, aucklandNearby, now + 30_000), true);
});

test('a real user gesture may open geolocation even when the caller did not set allowPrompt', () => {
  assert.equal(atlasLocationMayPrompt(false, true), true);
});

test('passive page work cannot open the geolocation prompt', () => {
  assert.equal(atlasLocationMayPrompt(false, false), false);
});

test('explicit location requests remain allowed outside transient user activation', () => {
  assert.equal(atlasLocationMayPrompt(true, false), true);
});
