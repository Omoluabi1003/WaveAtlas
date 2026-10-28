import type { Station } from './stations';

export type ReciprocalAtlasMode = 'ambient' | 'discovery' | 'focused' | 'resilience' | 'awareness';

export type ReciprocalAtlasSignal = {
  mode: ReciprocalAtlasMode;
  confidence: number;
  reliabilityBias: number;
  geographicBias: number;
  editorialBias: number;
  awarenessBias: number;
  reasons: string[];
};

export type ReciprocalAtlasInput = {
  playbackStatus?: string;
  localHour?: number;
  interactionCount?: number;
  consecutiveFailures?: number;
  locationAvailable?: boolean;
  weatherSeverity?: 'none' | 'advisory' | 'watch' | 'warning' | 'emergency';
  emergencyActive?: boolean;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

/**
 * Converts short-lived session context into a neutral intelligence signal.
 *
 * Guardrails:
 * - session context only; this module does not persist a behavioural profile;
 * - never starts playback or changes stations by itself;
 * - emergency/weather context may raise information priority, not seize control;
 * - callers remain responsible for presenting any recommendation to the listener.
 */
export function deriveReciprocalAtlasSignal(input: ReciprocalAtlasInput = {}): ReciprocalAtlasSignal {
  const failures = Math.max(0, input.consecutiveFailures || 0);
  const interactions = Math.max(0, input.interactionCount || 0);
  const hour = Number.isFinite(input.localHour) ? Number(input.localHour) : new Date().getHours();
  const severeWeather = input.emergencyActive || input.weatherSeverity === 'emergency' || input.weatherSeverity === 'warning';

  if (severeWeather) {
    return {
      mode: 'awareness',
      confidence: 96,
      reliabilityBias: 12,
      geographicBias: 10,
      editorialBias: 10,
      awarenessBias: 18,
      reasons: ['official-awareness', 'local-relevance', 'trusted-signal-priority'],
    };
  }

  if (failures >= 2 || /failed|offline|error|unavailable/i.test(input.playbackStatus || '')) {
    return {
      mode: 'resilience',
      confidence: clamp(72 + failures * 6),
      reliabilityBias: 16,
      geographicBias: 2,
      editorialBias: 4,
      awarenessBias: 0,
      reasons: ['playback-recovery', 'healthy-stream-priority'],
    };
  }

  if (interactions >= 4) {
    return {
      mode: 'focused',
      confidence: clamp(70 + interactions * 2),
      reliabilityBias: 7,
      geographicBias: input.locationAvailable ? 7 : 2,
      editorialBias: 6,
      awarenessBias: 0,
      reasons: ['active-session', 'context-continuity'],
    };
  }

  if (input.locationAvailable) {
    return {
      mode: 'discovery',
      confidence: 68,
      reliabilityBias: 5,
      geographicBias: 10,
      editorialBias: 3,
      awarenessBias: 0,
      reasons: ['location-aware-discovery'],
    };
  }

  const lateNight = hour >= 22 || hour < 6;
  return {
    mode: 'ambient',
    confidence: lateNight ? 58 : 54,
    reliabilityBias: 4,
    geographicBias: 0,
    editorialBias: lateNight ? 3 : 2,
    awarenessBias: 0,
    reasons: lateNight ? ['low-interruption-session', 'time-context'] : ['neutral-session-context'],
  };
}

function officialAwarenessStation(station: Station) {
  const searchable = `${station.name} ${(station.tags || []).join(' ')}`.toLowerCase();
  return /(weather|emergency|public|news|noaa|npr|bbc|alert|traffic|civil defence|civil defense)/.test(searchable);
}

/**
 * Produces a bounded station-ranking adjustment. This is deliberately small so
 * Reciprocal Intelligence can shape AIE without overriding trust, health, or
 * explicit listener intent.
 */
export function reciprocalStationAdjustment(station: Station, signal?: ReciprocalAtlasSignal) {
  if (!signal) return 0;

  const active = station.is_active && station.last_check_ok !== false;
  const verified = station.verification_status === 'verified' || station.validation_status === 'verified' || station.curation_tier === 'curated_atlas';
  const geoComplete = typeof station.latitude === 'number' && typeof station.longitude === 'number';
  const official = officialAwarenessStation(station);

  let adjustment = 0;
  if (active) adjustment += signal.reliabilityBias * 0.35;
  if (verified) adjustment += signal.editorialBias * 0.25;
  if (geoComplete) adjustment += signal.geographicBias * 0.25;
  if (signal.mode === 'awareness' && official) adjustment += signal.awarenessBias * 0.45;
  if (!active) adjustment -= Math.max(8, signal.reliabilityBias * 0.6);

  return Math.max(-12, Math.min(12, adjustment));
}

export const RECIPROCAL_ATLAS_PRINCIPLES = Object.freeze([
  'Listen to context, never seize listener control.',
  'Adapt presentation and ranking before changing behaviour.',
  'Prefer session-local signals over permanent behavioural profiling.',
  'Reliability and verified geography outrank novelty.',
  'Emergency awareness may surface trusted information but never force playback.',
  'Every reciprocal decision remains subordinate to the Atlas Intelligence Engine.',
]);
