import assert from 'node:assert/strict';
import { ATLAS_AGENT_CONTRACTS, atlasConfidenceGate, planAtlasAgency, planAtlasAgencyExecution } from '../lib/agents/atlas-intelligence-agency';

assert.deepEqual(planAtlasAgency({ kind: 'brief', needsPublication: true }), ['world-events', 'geo-intelligence', 'reality-checker', 'brief-editor']);
assert.deepEqual(planAtlasAgency({ kind: 'station' }), ['station-intelligence', 'geo-intelligence', 'signal-reliability', 'reality-checker']);
assert.equal(planAtlasAgency({ kind: 'audio' }).at(-1), 'reality-checker');

const stationExecution = planAtlasAgencyExecution({ kind: 'station' });
assert.equal(stationExecution.strategy, 'plan-parallel-verify');
assert.equal(stationExecution.providerCalls, 0);
assert.deepEqual(stationExecution.steps.map(step => step.agent), planAtlasAgency({ kind: 'station' }));
assert.equal(stationExecution.steps.at(-1)?.agent, 'reality-checker');
assert.equal(stationExecution.steps.at(-1)?.tier, 'verification-gate');
assert.equal(stationExecution.steps.at(-1)?.phase, 'verify');

const briefExecution = planAtlasAgencyExecution({ kind: 'brief', needsPublication: true });
const realityIndex = briefExecution.steps.findIndex(step => step.agent === 'reality-checker');
const editorIndex = briefExecution.steps.findIndex(step => step.agent === 'brief-editor');
assert.ok(realityIndex >= 0 && editorIndex > realityIndex);
assert.equal(briefExecution.steps[editorIndex]?.phase, 'publish');

assert.equal(atlasConfidenceGate({ confidence: 0.9, provenanceCount: 2, conflicts: 0, locationVerified: true }), 'publish');
assert.equal(atlasConfidenceGate({ confidence: 0.9, provenanceCount: 0, conflicts: 0 }), 'reject');
assert.equal(atlasConfidenceGate({ confidence: 0.8, provenanceCount: 2, conflicts: 1 }), 'hold');
assert.equal(atlasConfidenceGate({ confidence: 0.71, provenanceCount: 3, conflicts: 0 }), 'hold');
assert.match(ATLAS_AGENT_CONTRACTS['reality-checker'].mission, /Gate claims/);
console.log('Atlas Intelligence Agency regression checks passed.');
