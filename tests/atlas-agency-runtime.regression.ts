import assert from 'node:assert/strict';
import { agencyTaskFromOperationalSignal, runAtlasAgencyRuntime } from '../lib/agents/atlas-agency-runtime';

const verifiedStation = runAtlasAgencyRuntime({
  task: agencyTaskFromOperationalSignal('station-discovery'),
  evidence: [
    { source: 'source-oracle', confidence: 0.92, coordinates: { lat: 6.5244, lng: 3.3792 }, streamVerified: true },
    { source: 'truth-mesh', confidence: 0.88, coordinates: { lat: 6.5244, lng: 3.3792 } },
  ],
});
assert.equal(verifiedStation.decision, 'publish');
assert.equal(verifiedStation.publishable, true);
assert.ok(verifiedStation.route.includes('reality-checker'));
assert.ok(verifiedStation.route.includes('signal-reliability'));
assert.equal(verifiedStation.execution.strategy, 'plan-parallel-verify');
assert.equal(verifiedStation.execution.providerCalls, 0);
assert.deepEqual(verifiedStation.execution.steps.map(step => step.agent), verifiedStation.route);

const unsupportedBrief = runAtlasAgencyRuntime({ task: agencyTaskFromOperationalSignal('brief'), evidence: [] });
assert.equal(unsupportedBrief.decision, 'reject');
assert.equal(unsupportedBrief.publishable, false);
assert.ok(unsupportedBrief.route.indexOf('reality-checker') < unsupportedBrief.route.indexOf('brief-editor'));
assert.equal(unsupportedBrief.execution.steps.find(step => step.agent === 'brief-editor')?.phase, 'publish');

const geographicConflict = runAtlasAgencyRuntime({
  task: agencyTaskFromOperationalSignal('world-event'),
  evidence: [
    { source: 'feed-a', confidence: 0.91, coordinates: { lat: 9.08, lng: 8.67 }, conflicts: ['location mismatch'] },
    { source: 'feed-b', confidence: 0.9, coordinates: { lat: 7.38, lng: 3.93 } },
  ],
});
assert.equal(geographicConflict.decision, 'hold');
assert.equal(geographicConflict.publishable, false);

const noLocation = runAtlasAgencyRuntime({
  task: agencyTaskFromOperationalSignal('geo-truth'),
  evidence: [{ source: 'candidate', confidence: 0.95 }],
});
assert.equal(noLocation.locationVerified, false);
assert.equal(noLocation.decision, 'hold');

const degradedSignal = runAtlasAgencyRuntime({
  task: agencyTaskFromOperationalSignal('stream-health'),
  evidence: [{ source: 'stream-probe', confidence: 0.61, streamVerified: false }],
});
assert.equal(degradedSignal.decision, 'hold');

console.log('Atlas Agency runtime regression checks passed.');
