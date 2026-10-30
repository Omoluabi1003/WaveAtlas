export type AtlasAgentId =
  | 'station-intelligence'
  | 'geo-intelligence'
  | 'brief-editor'
  | 'signal-reliability'
  | 'world-events'
  | 'audio-intelligence'
  | 'reality-checker';

export type AtlasAgencyTask = {
  kind: 'station' | 'geo' | 'brief' | 'signal' | 'world-event' | 'audio' | 'mixed';
  sourceCount?: number;
  hasCoordinates?: boolean;
  hasStream?: boolean;
  needsPublication?: boolean;
};

export type AtlasAgentContract = {
  id: AtlasAgentId;
  mission: string;
  must: readonly string[];
  mustNot: readonly string[];
};

export const ATLAS_AGENT_CONTRACTS: Record<AtlasAgentId, AtlasAgentContract> = {
  'station-intelligence': { id: 'station-intelligence', mission: 'Resolve station identity, metadata and source evidence.', must: ['prefer corroborated station evidence', 'preserve source provenance'], mustNot: ['invent station metadata', 'promote an unverified candidate as truth'] },
  'geo-intelligence': { id: 'geo-intelligence', mission: 'Validate coordinates, locality, country and spatial context.', must: ['treat coordinates as evidence', 'surface geographic conflicts'], mustNot: ['guess missing coordinates', 'silently override verified geography'] },
  'brief-editor': { id: 'brief-editor', mission: 'Turn verified intelligence into concise premium Atlas Brief copy.', must: ['retain source attribution', 'separate fact from uncertainty'], mustNot: ['publish raw feed dumps', 'amplify unsupported claims'] },
  'signal-reliability': { id: 'signal-reliability', mission: 'Assess stream playability, redirects, latency and health.', must: ['use observed stream evidence', 'report degraded confidence'], mustNot: ['mark a stream live without evidence', 'replace station identity from stream behavior alone'] },
  'world-events': { id: 'world-events', mission: 'Relate public events to geographic context and user relevance.', must: ['preserve event time and place', 'prefer authoritative or corroborated sources'], mustNot: ['turn weak signals into breaking news', 'infer casualties or outcomes'] },
  'audio-intelligence': { id: 'audio-intelligence', mission: 'Reconcile now-playing and track metadata with confidence.', must: ['distinguish observed from inferred metadata', 'deduplicate conflicting track labels'], mustNot: ['claim track identity without sufficient evidence', 'interrupt radio playback to speculate'] },
  'reality-checker': { id: 'reality-checker', mission: 'Gate claims before Atlas Intelligence reaches users.', must: ['reject unsupported assertions', 'preserve uncertainty', 'require provenance for publishable claims'], mustNot: ['manufacture corroboration', 'upgrade confidence because copy sounds plausible'] },
};

const ROUTES: Record<AtlasAgencyTask['kind'], AtlasAgentId[]> = {
  station: ['station-intelligence', 'geo-intelligence', 'signal-reliability', 'reality-checker'],
  geo: ['geo-intelligence', 'reality-checker'],
  brief: ['world-events', 'geo-intelligence', 'reality-checker', 'brief-editor'],
  signal: ['signal-reliability', 'station-intelligence', 'reality-checker'],
  'world-event': ['world-events', 'geo-intelligence', 'reality-checker', 'brief-editor'],
  audio: ['audio-intelligence', 'station-intelligence', 'reality-checker'],
  mixed: ['station-intelligence', 'geo-intelligence', 'signal-reliability', 'world-events', 'audio-intelligence', 'reality-checker'],
};

export function planAtlasAgency(task: AtlasAgencyTask): AtlasAgentId[] {
  const route = [...ROUTES[task.kind]];
  if (task.needsPublication && !route.includes('brief-editor')) route.push('brief-editor');
  return route;
}

export type ConfidenceGateInput = {
  confidence: number;
  provenanceCount: number;
  conflicts: number;
  locationVerified?: boolean;
};

export type ConfidenceGateDecision = 'publish' | 'hold' | 'reject';

export function atlasConfidenceGate(input: ConfidenceGateInput): ConfidenceGateDecision {
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) return 'reject';
  if (input.provenanceCount < 1) return 'reject';
  if (input.conflicts > 0 || input.locationVerified === false || input.confidence < 0.72) return 'hold';
  return 'publish';
}
