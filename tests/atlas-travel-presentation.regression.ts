import assert from 'node:assert/strict';
import test from 'node:test';
import { atlasTravelDurationLabel, atlasTravelPresentation } from '../lib/atlas-travel-presentation';

test('travel modes never reuse aircraft follow language on ground', () => {
  assert.equal(atlasTravelPresentation('flight').followLabel, 'Follow aircraft');
  assert.equal(atlasTravelPresentation('drive').followLabel, 'Follow route');
  assert.equal(atlasTravelPresentation('bicycle').followLabel, 'Follow ride');
  assert.equal(atlasTravelPresentation('walk').followLabel, 'Follow walk');
});

test('time labels are mode aware', () => {
  assert.equal(atlasTravelPresentation('flight').timeLabel, 'Flight time remaining');
  assert.equal(atlasTravelPresentation('drive').timeLabel, 'Drive time remaining');
  assert.equal(atlasTravelPresentation('bicycle').timeLabel, 'Ride time remaining');
  assert.equal(atlasTravelPresentation('walk').timeLabel, 'Walk time remaining');
});

test('route duration formatting remains compact for Journey cards', () => {
  assert.equal(atlasTravelDurationLabel(12 * 60), '12 min');
  assert.equal(atlasTravelDurationLabel(90 * 60), '1h 30m');
  assert.equal(atlasTravelDurationLabel(2 * 60 * 60), '2h');
});
