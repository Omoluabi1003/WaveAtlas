import assert from 'node:assert/strict';
import { ATLAS_AGENT_CONTRACTS, atlasConfidenceGate, planAtlasAgency } from '../lib/agents/atlas-intelligence-agency';

assert.deepEqual(planAtlasAgency({ kind: 'brief', needsPublication: true }), ['world-events', 'geo-intelligence', 'reality-checker', 'brief-editor']);
assert.deepEqual(planAtlasAgency({ kind: 'station' }), ['station-intelligence', 'geo-intelligence', 'signal-reliability', 'reality-checker']);
assert.equal(planAtlasAgency({ kind: 'audio' }).at(-1), 'reality-checker');
assert.equal(atlasConfidenceGate({ confidence: 0.9, provenanceCount: 2, conflicts: 0, locationVerified: true }), 'publish');
assert.equal(atlasConfidenceGate({ confidence: 0.9, provenanceCount: 0, conflicts: 0 }), 'reject');
assert.equal(atlasConfidenceGate({ confidence: 0.8, provenanceCount: 2, conflicts: 1 }), 'hold');
assert.equal(atlasConfidenceGate({ confidence: 0.71, provenanceCount: 3, conflicts: 0 }), 'hold');
assert.match(ATLAS_AGENT_CONTRACTS['reality-checker'].mission, /Gate claims/);
console.log('Atlas Intelligence Agency regression checks passed.');
