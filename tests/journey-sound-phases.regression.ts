import assert from 'node:assert/strict';
import { journeySoundPhase, journeySoundPhaseLabel, journeySoundPhaseQueue } from '../lib/journey-sound-phases';
import type { AtlasTravelModeSession } from '../lib/atlas-travel-mode';

assert.equal(journeySoundPhase(0), 'departure');
assert.equal(journeySoundPhase(0.149), 'departure');
assert.equal(journeySoundPhase(0.15), 'corridor');
assert.equal(journeySoundPhase(0.81), 'corridor');
assert.equal(journeySoundPhase(0.82), 'arrival');
assert.equal(journeySoundPhase(1), 'arrival');
assert.equal(journeySoundPhaseLabel('departure'), 'Departure sound');
assert.equal(journeySoundPhaseLabel('corridor'), 'Corridor sound');
assert.equal(journeySoundPhaseLabel('arrival'), 'Arrival sound');

const points = Array.from({ length: 101 }, (_, index) => ({ lat: 0, lon: index / 10 }));
const session: AtlasTravelModeSession = {
  profile: 'flight',
  source: 'great-circle',
  route: {
    from: { label: 'AAA', lat: 0, lng: 0, countryCode: 'AA' },
    to: { label: 'BBB', lat: 0, lng: 10, countryCode: 'BB' },
  },
  points,
  corridor: {
    points,
    stations: [
      { id: 'origin', name: 'Origin', lat: 0, lon: 0.5, routeIndex: 5, distanceKm: 3 },
      { id: 'middle', name: 'Middle', lat: 0, lon: 5, routeIndex: 50, distanceKm: 4 },
      { id: 'arrival', name: 'Arrival', lat: 0, lon: 9.5, routeIndex: 95, distanceKm: 2 },
    ],
    generatedAt: new Date(0).toISOString(),
  },
  generatedAt: new Date(0).toISOString(),
};

assert.equal(journeySoundPhaseQueue(session, 0.03, 3)[0]?.id, 'origin');
assert.equal(journeySoundPhaseQueue(session, 0.5, 3)[0]?.id, 'middle');
assert.equal(journeySoundPhaseQueue(session, 0.9, 3)[0]?.id, 'arrival');
