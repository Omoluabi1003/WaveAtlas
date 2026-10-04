import assert from 'node:assert/strict';
import { republicCongoStations } from '../lib/stations/republicCongoStations';

assert.ok(republicCongoStations.length >= 2);
for (const station of republicCongoStations) {
  assert.equal(station.country_code, 'CG');
  assert.equal(station.country, 'Republic of the Congo');
  assert.equal(station.verification_status, 'verified');
  assert.equal(station.validation_status, 'verified');
  assert.equal(station.is_active, true);
  assert.ok(station.url.startsWith('https://'));
  assert.notEqual(station.country_code, 'CD');
}
assert.ok(republicCongoStations.some((station) => station.city === 'Brazzaville'));
assert.ok(republicCongoStations.some((station) => station.city === 'Pointe-Noire'));
console.log('Republic of Congo curated station checks passed');
