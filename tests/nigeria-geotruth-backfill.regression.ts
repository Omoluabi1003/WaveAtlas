import assert from 'node:assert/strict';
import { nigeriaGeoTruth } from '../lib/stations/nigeriaGeoTruth';

assert.ok(nigeriaGeoTruth.length >= 18, 'GeoTruth baseline should cover the initial authoritative Nigeria batch');

for (const record of nigeriaGeoTruth) {
  assert.ok(record.station.trim(), 'station is required');
  assert.ok(record.city.trim(), `${record.station}: city is required`);
  assert.ok(record.state.trim(), `${record.station}: state is required`);
  assert.ok(Number.isFinite(record.latitude) && record.latitude >= 4 && record.latitude <= 14, `${record.station}: latitude must be plausible for Nigeria`);
  assert.ok(Number.isFinite(record.longitude) && record.longitude >= 2 && record.longitude <= 15, `${record.station}: longitude must be plausible for Nigeria`);
  assert.ok(record.confidence >= 0.8, `${record.station}: confidence must satisfy WaveAtlas admission policy`);
  assert.ok(record.precision === 'station' || record.precision === 'city', `${record.station}: precision must be explicit`);
  assert.ok(record.source.trim(), `${record.station}: source provenance is required`);
}

const unique = new Set(nigeriaGeoTruth.map((record) => `${record.station}|${record.city}|${record.state}`.toLowerCase()));
assert.equal(unique.size, nigeriaGeoTruth.length, 'GeoTruth baseline must not contain duplicate station/location records');

console.log(`Nigeria GeoTruth baseline OK: ${nigeriaGeoTruth.length} authoritative location records.`);
