import type { Station } from '../stations';

export type CoordinatePrecision = 'station' | 'city' | 'unknown';
export type LocationEvidence = {
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  source: string;
  confidence: number;
  precision: CoordinatePrecision;
};

const finiteCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonEmpty = (value?: string) => Boolean(value?.trim());

export function hasAtlasLocation(station: Station) {
  return nonEmpty(station.city) && nonEmpty(station.state) && finiteCoordinate(station.latitude) && finiteCoordinate(station.longitude);
}

export function locationAdmission(station: Station, evidence?: LocationEvidence) {
  const complete = hasAtlasLocation(station);
  const evidenceComplete = Boolean(
    evidence && nonEmpty(evidence.city) && nonEmpty(evidence.state) &&
    finiteCoordinate(evidence.latitude) && finiteCoordinate(evidence.longitude)
  );
  const confidence = evidence?.confidence ?? 0;
  const precision = evidence?.precision ?? 'unknown';
  const admitted = complete || (evidenceComplete && confidence >= 0.8 && precision !== 'unknown');
  return {
    admitted,
    reason: admitted ? 'location-verified' : 'missing-or-unverified-location',
    precision,
    confidence,
  } as const;
}

export function applyLocationEvidence(station: Station, evidence: LocationEvidence): Station {
  const decision = locationAdmission(station, evidence);
  if (!decision.admitted || !evidence.city || !evidence.state || !finiteCoordinate(evidence.latitude) || !finiteCoordinate(evidence.longitude)) return station;
  return {
    ...station,
    city: evidence.city.trim(),
    state: evidence.state.trim(),
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    source_confidence: Math.max(station.source_confidence ?? 0, evidence.confidence),
    validation_reason: `${station.validation_reason ?? ''} Location verified from ${evidence.source}; precision=${evidence.precision}; confidence=${evidence.confidence.toFixed(2)}.`.trim(),
  };
}

export function nigeriaLocationAudit(stations: Station[]) {
  const nigeria = stations.filter((station) => station.country_code === 'NG');
  const complete = nigeria.filter(hasAtlasLocation);
  const pending = nigeria.filter((station) => !hasAtlasLocation(station));
  return {
    total: nigeria.length,
    locationComplete: complete.length,
    pendingLocation: pending.length,
    pending: pending.map((station) => ({
      stationId: station.station_uuid,
      name: station.name,
      city: station.city || null,
      state: station.state || null,
      latitude: finiteCoordinate(station.latitude) ? station.latitude : null,
      longitude: finiteCoordinate(station.longitude) ? station.longitude : null,
      action: 'research-authoritative-location-before-atlas-admission',
    })),
  };
}
