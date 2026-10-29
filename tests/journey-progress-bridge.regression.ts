import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeJourneyProgress, progressToControlValue } from '../lib/journey-progress-bridge';

test('Journey timeline progress is clamped to the authoritative 0..1 domain', () => {
  assert.equal(normalizeJourneyProgress(-0.4), 0);
  assert.equal(normalizeJourneyProgress(0.42), 0.42);
  assert.equal(normalizeJourneyProgress(1.7), 1);
  assert.equal(normalizeJourneyProgress(Number.NaN), 0);
});

test('timeline progress maps exactly onto the existing 0..1000 Journey control', () => {
  assert.equal(progressToControlValue(0), '0');
  assert.equal(progressToControlValue(0.5), '500');
  assert.equal(progressToControlValue(0.9996), '1000');
  assert.equal(progressToControlValue(2), '1000');
});
