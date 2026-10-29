import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAtlasCorridor, haversineKm, matchStationsToCorridor } from '../lib/atlas-corridor-intelligence';
import { decodePolyline6 } from '../lib/valhalla-routing';

test('haversine returns realistic distance', () => {
  const distance = haversineKm({ lat: 30.3322, lon: -81.6557 }, { lat: 30.4383, lon: -84.2807 });
  assert.ok(distance > 240 && distance < 270);
});

test('corridor matcher orders stations along route and excludes distant stations', () => {
  const route = [
    { lat: 30.3322, lon: -81.6557 },
    { lat: 30.4383, lon: -84.2807 },
    { lat: 30.6954, lon: -88.0399 },
  ];

  const stations = [
    { id: 'jax', name: 'Jacksonville', lat: 30.33, lon: -81.66 },
    { id: 'tally', name: 'Tallahassee', lat: 30.44, lon: -84.28 },
    { id: 'mobile', name: 'Mobile', lat: 30.69, lon: -88.04 },
    { id: 'miami', name: 'Miami', lat: 25.7617, lon: -80.1918 },
  ];

  const hits = matchStationsToCorridor(route, stations, 50);
  assert.deepEqual(hits.map((station) => station.id), ['jax', 'tally', 'mobile']);
  assert.ok(hits.every((station) => station.distanceKm <= 50));
});

test('corridor builder returns route and timestamp', () => {
  const corridor = buildAtlasCorridor([{ lat: 1, lon: 2 }], [{ id: 'a', name: 'A', lat: 1, lon: 2 }]);
  assert.equal(corridor.points.length, 1);
  assert.equal(corridor.stations.length, 1);
  assert.ok(Number.isFinite(Date.parse(corridor.generatedAt)));
});

test('polyline6 decoder returns geographic points', () => {
  const points = decodePolyline6('_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI');
  assert.ok(points.length >= 2);
  assert.ok(points.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)));
});
