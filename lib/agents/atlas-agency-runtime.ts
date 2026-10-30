import { atlasConfidenceGate, planAtlasAgency, type AtlasAgencyTask, type AtlasAgentId, type ConfidenceGateDecision } from './atlas-intelligence-agency';

export type AtlasEvidence = {
  source: string;
  confidence: number;
  observedAt?: string;
  coordinates?: { lat: number; lng: number };
  streamVerified?: boolean;
  conflicts?: string[];
};

export type AtlasAgencyRuntimeInput = {
  task: AtlasAgencyTask;
  evidence: AtlasEvidence[];
};

export type AtlasAgencyRuntimeResult = {
  route: AtlasAgentId[];
  decision: ConfidenceGateDecision;
  confidence: number;
  provenance: string[];
  conflicts: string[];
  locationVerified: boolean | undefined;
  publishable: boolean;
};

function validConfidence(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function runAtlasAgencyRuntime(input: AtlasAgencyRuntimeInput): AtlasAgencyRuntimeResult {
  const route = planAtlasAgency(input.task);
  const evidence = input.evidence.filter(item => item.source.trim().length > 0 && validConfidence(item.confidence));
  const provenance = [...new Set(evidence.map(item => item.source.trim()))];
  const conflicts = [...new Set(evidence.flatMap(item => item.conflicts ?? []).filter(Boolean))];
  const confidence = evidence.length === 0
    ? 0
    : evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length;

  const coordinateEvidence = evidence.filter(item => item.coordinates);
  const locationVerified = input.task.kind === 'geo' || input.task.kind === 'station' || input.task.kind === 'world-event' || input.task.kind === 'brief'
    ? coordinateEvidence.length > 0
    : undefined;

  const decision = atlasConfidenceGate({
    confidence,
    provenanceCount: provenance.length,
    conflicts: conflicts.length,
    locationVerified,
  });

  return {
    route,
    decision,
    confidence,
    provenance,
    conflicts,
    locationVerified,
    publishable: decision === 'publish',
  };
}

export function agencyTaskFromOperationalSignal(signal: 'station-discovery' | 'stream-health' | 'geo-truth' | 'brief' | 'world-event' | 'audio'): AtlasAgencyTask {
  switch (signal) {
    case 'station-discovery': return { kind: 'station', needsPublication: false };
    case 'stream-health': return { kind: 'signal', needsPublication: false };
    case 'geo-truth': return { kind: 'geo', needsPublication: false };
    case 'brief': return { kind: 'brief', needsPublication: true };
    case 'world-event': return { kind: 'world-event', needsPublication: true };
    case 'audio': return { kind: 'audio', needsPublication: false };
  }
}
