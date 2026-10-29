import assert from 'node:assert/strict';
import test from 'node:test';
import { isExploreNearbyLabel } from '../components/NearbyLocationTruthGate';

test('recognizes the Explore Nearby action label', () => {
  assert.equal(isExploreNearbyLabel('Explore Nearby'), true);
  assert.equal(isExploreNearbyLabel('  Explore   Nearby  '), true);
});

test('does not gate intentional global discovery actions', () => {
  assert.equal(isExploreNearbyLabel('Wander'), false);
  assert.equal(isExploreNearbyLabel('Teleport'), false);
  assert.equal(isExploreNearbyLabel('Search'), false);
});
