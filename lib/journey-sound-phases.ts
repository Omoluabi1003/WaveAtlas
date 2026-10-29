import type { AtlasTravelModeSession } from './atlas-travel-mode';
import type { CorridorStationHit } from './atlas-corridor-intelligence';

export type JourneySoundPhase = 'departure' | 'corridor' | 'arrival';

export function journeySoundPhase(rawProgress: number): JourneySoundPhase {
  const progress = Math.max(0, Math.min(1, Number.isFinite(rawProgress) ? rawProgress : 0));
  if (progress < 0.15) return 'departure';
  if (progress >= 0.82) return 'arrival';
  return 'corridor';
}

export function journeySoundPhaseLabel(phase: JourneySoundPhase) {
  if (phase === 'departure') return 'Departure sound';
  if (phase === 'arrival') return 'Arrival sound';
  return 'Corridor sound';
}

function uniqueById(stations: CorridorStationHit[]) {
  const seen = new Set<string>();
  return stations.filter((station) => {
    if (seen.has(station.id)) return false;
    seen.add(station.id);
    return true;
  });
}

export function journeySoundPhaseQueue(session: AtlasTravelModeSession, rawProgress: number, limit = 5) {
  const progress = Math.max(0, Math.min(1, Number.isFinite(rawProgress) ? rawProgress : 0));
  const phase = journeySoundPhase(progress);
  const finalIndex = Math.max(1, session.points.length - 1);
  const routeIndex = Math.round(progress * finalIndex);
  const ordered = session.corridor.stations;

  let candidates: CorridorStationHit[];
  if (phase === 'departure') {
    const departureBand = Math.max(3, Math.round(finalIndex * 0.18));
    candidates = ordered
      .filter((station) => station.routeIndex <= departureBand)
      .sort((a, b) => a.routeIndex - b.routeIndex || a.distanceKm - b.distanceKm);
  } else if (phase === 'arrival') {
    const arrivalBand = Math.round(finalIndex * 0.78);
    candidates = ordered
      .filter((station) => station.routeIndex >= Math.max(arrivalBand, routeIndex - Math.round(finalIndex * 0.05)))
      .sort((a, b) => Math.abs(a.routeIndex - routeIndex) - Math.abs(b.routeIndex - routeIndex) || a.distanceKm - b.distanceKm);
  } else {
    candidates = ordered
      .filter((station) => station.routeIndex >= Math.max(0, routeIndex - 1))
      .sort((a, b) => Math.abs(a.routeIndex - routeIndex) - Math.abs(b.routeIndex - routeIndex) || a.distanceKm - b.distanceKm);
  }

  return uniqueById(candidates).slice(0, Math.max(1, limit));
}
