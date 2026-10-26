import assert from 'node:assert/strict';
import { normalizeOicSignal, type WaveAtlasIntelligenceSignal } from '../lib/oic-intelligence';

const base: WaveAtlasIntelligenceSignal = {
  id: 'signal-1',
  kind: 'world-event',
  title: 'Observed event',
  summary: 'External observation awaiting spatial verification.',
  observedAt: new Date(0).toISOString(),
  provenance: [{ channel: 'web', retrievedAt: new Date(0).toISOString() }],
  spatialAuthority: 'unverified',
  degraded: false,
};

const unverified = normalizeOicSignal(base);
assert.equal(unverified.spatialAuthority, 'unverified');
assert.equal(unverified.degraded, true);

const verified = normalizeOicSignal({
  ...base,
  geoVerification: { verified: true, source: 'GeoAware-Core', confidence: 96 },
});
assert.equal(verified.spatialAuthority, 'GeoAware-Core');
assert.equal(verified.degraded, false);

console.log('OIC intelligence regression passed');
