import assert from 'node:assert/strict';
import { FRCN_EXPECTED_STATION_COUNT, nigeriaGeoTruth } from '../lib/stations/nigeriaGeoTruth';

assert.equal(FRCN_EXPECTED_STATION_COUNT, 48, 'FRCN official directory baseline should contain 48 entries');
assert.equal(nigeriaGeoTruth.length, FRCN_EXPECTED_STATION_COUNT, 'Every FRCN directory station must have a GeoTruth record');

const normalizedNames = new Set<string>();
for (const station of nigeriaGeoTruth) {
  assert.ok(station.station.trim(), 'station name is required');
  assert.ok(station.city.trim(), `${station.station}: city is required`);
  assert.ok(station.state.trim(), `${station.station}: state/FCT is required`);
  assert.ok(Number.isFinite(station.latitude) && Number.isFinite(station.longitude), `${station.station}: coordinates are required`);
  assert.ok(station.latitude >= 4 && station.latitude <= 14.5, `${station.station}: latitude must be inside Nigeria envelope`);
  assert.ok(station.longitude >= 2.5 && station.longitude <= 15, `${station.station}: longitude must be inside Nigeria envelope`);
  assert.ok(station.confidence >= 0.8, `${station.station}: location confidence must meet admission threshold`);
  assert.ok(station.source.trim(), `${station.station}: provenance is required`);
  assert.ok(station.precision === 'city' || station.precision === 'station', `${station.station}: coordinate precision is required`);

  const key = station.station.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  assert.ok(!normalizedNames.has(key), `${station.station}: duplicate FRCN GeoTruth identity`);
  normalizedNames.add(key);
}

for (const required of [
  'ClickNaija Radio', 'Kapital FM 92.9', 'Power FM Bida 100.5',
  'Radio One Lagos 103.5', 'Premier FM Ibadan 93.5', 'Hausa Service Kaduna 594 AM',
  'Wetland FM Gashua 90.5', 'Canaan City FM', 'Paradise FM Calabar 104.5'
]) {
  assert.ok(nigeriaGeoTruth.some((s) => s.station === required), `Missing required FRCN outlet: ${required}`);
}

const canaan = nigeriaGeoTruth.find((s) => s.station === 'Canaan City FM');
assert.equal(canaan?.city, 'Calabar', 'Canaan City FM must follow FRCN South South evidence, not the central-directory Port Harcourt mismatch');

const ogoIlu = nigeriaGeoTruth.find((s) => s.station === 'Ogo Ilu FM Oko 89.3');
assert.equal(ogoIlu?.city, 'Oko', 'Ogo Ilu FM must remain in Oko, Oyo State');
assert.equal(ogoIlu?.state, 'Oyo', 'Ogo Ilu FM state must be Oyo');

console.log(`FRCN complete-network GeoTruth regression passed (${nigeriaGeoTruth.length} stations).`);
