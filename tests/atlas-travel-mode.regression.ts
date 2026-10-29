import assert from 'node:assert/strict';
import test from 'node:test';
import { atlasTravelProgress, corridorStationQueue, greatCircleTravelPoints, type AtlasTravelModeSession } from '../lib/atlas-travel-mode';

const route = {
  from: { label: 'Jacksonville, United States', lat: 30.3322, lng: -81.6557, countryCode: 'US' },
  to: { label: 'Tallahassee, United States', lat: 30.4383, lng: -84.2807, countryCode: 'US' },
};

test('great-circle travel points preserve journey endpoints', () => {
  const points = greatCircleTravelPoints(route, 40);
  assert.ok(points.length >= 25);
  assert.ok(Math.abs(points[0].lat - route.from.lat) < 0.001);
  assert.ok(Math.abs(points[0].lon - route.from.lng) < 0.001);
  const last = points.at(-1)!;
  assert.ok(Math.abs(last.lat - route.to.lat) < 0.001);
  assert.ok(Math.abs(last.lon - route.to.lng) < 0.001);
});

test('travel progress advances through ordered corridor stations', () => {
  const points = Array.from({ length: 11 }, (_, index) => ({ lat: 30, lon: -81 - index * 0.1 }));
  const session: AtlasTravelModeSession = {
    profile: 'flight',
    source: 'great-circle',
    route,
    points,
    generatedAt: new Date().toISOString(),
    corridor: {
      points,
      generatedAt: new Date().toISOString(),
      stations: [
        { id: 'a', name: 'A', lat: 30, lon: -81.2, distanceKm: 1, routeIndex: 2 },
        { id: 'b', name: 'B', lat: 30, lon: -81.5, distanceKm: 1, routeIndex: 5 },
        { id: 'c', name: 'C', lat: 30, lon: -81.8, distanceKm: 1, routeIndex: 8 },
      ],
    },
  };

  const state = atlasTravelProgress(session, 0.5);
  assert.equal(state.routeIndex, 5);
  assert.equal(state.currentStationId, 'b');
  assert.deepEqual(state.passedStationIds, ['a']);
  assert.deepEqual(state.nextStationIds, ['c']);
  assert.deepEqual(corridorStationQueue(session, 0.5).map((station) => station.id), ['b', 'c']);
});

test('travel progress clamps invalid progress safely', () => {
  const points = [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }];
  const session: AtlasTravelModeSession = {
    profile: 'flight', source: 'great-circle', route, points, generatedAt: new Date().toISOString(),
    corridor: { points, stations: [], generatedAt: new Date().toISOString() },
  };
  assert.equal(atlasTravelProgress(session, Number.NaN).progress, 0);
  assert.equal(atlasTravelProgress(session, 2).progress, 1);
});
