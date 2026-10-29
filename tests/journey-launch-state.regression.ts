import assert from 'node:assert/strict';
import test from 'node:test';
import { journeyLaunchModes, recommendedJourneyLaunchProfile } from '../lib/journey-launch-state';
import type { JourneyRoute } from '../lib/atlas-journey-contract';

const jacksonvilleToMiami: JourneyRoute = {
  from: { label: 'JAX · Jacksonville International Airport', lat: 30.4941, lng: -81.6879, countryCode: 'US' },
  to: { label: 'MIA · Miami International Airport', lat: 25.7959, lng: -80.287, countryCode: 'US' },
};

const londonToTokyo: JourneyRoute = {
  from: { label: 'LHR · Heathrow Airport', lat: 51.47, lng: -0.4543, countryCode: 'GB' },
  to: { label: 'HND · Tokyo Haneda Airport', lat: 35.5494, lng: 139.7798, countryCode: 'JP' },
};

const shortSameCountry: JourneyRoute = {
  from: { label: 'Airport A', lat: 40.7128, lng: -74.006, countryCode: 'US' },
  to: { label: 'Airport B', lat: 40.75, lng: -74.0, countryCode: 'US' },
};

test('regional same-country airport pairs can recommend Drive', () => {
  assert.equal(recommendedJourneyLaunchProfile(jacksonvilleToMiami), 'drive');
  const enabled = journeyLaunchModes(jacksonvilleToMiami).filter((mode) => mode.enabled).map((mode) => mode.profile);
  assert.ok(enabled.includes('flight'));
  assert.ok(enabled.includes('drive'));
  assert.ok(!enabled.includes('walk'));
});

test('intercontinental airport pairs stay flight-first', () => {
  assert.equal(recommendedJourneyLaunchProfile(londonToTokyo), 'flight');
  const enabled = journeyLaunchModes(londonToTokyo).filter((mode) => mode.enabled).map((mode) => mode.profile);
  assert.deepEqual(enabled, ['flight']);
});

test('very short same-country airport pairs can expose local modes', () => {
  const enabled = journeyLaunchModes(shortSameCountry).filter((mode) => mode.enabled).map((mode) => mode.profile);
  assert.ok(enabled.includes('walk'));
  assert.ok(enabled.includes('bicycle'));
  assert.ok(enabled.includes('drive'));
});
