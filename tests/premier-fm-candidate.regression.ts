import assert from 'node:assert/strict';
import { classifyStationTrust, getStationStreamUrl } from '../lib/fast-connect-engine';
import { ariyoSeedStations } from '../lib/stations/ariyoSeedStations';
import { isVerifiedNigerianStation, mergeSeedStations, rankStations } from '../lib/stations';

const premier = ariyoSeedStations.find((station) => station.id === 'ariyo-ai-premier-935-fm-ibadan');
assert.ok(premier, 'Premier FM must be present in the Ariyo curated catalog');
assert.equal(premier.url, '');
assert.equal(premier.url_resolved, '');
assert.equal(premier.verification_status, 'candidate');
assert.equal(premier.validation_status, 'needs_review');
assert.equal(premier.is_active, false);
assert.equal(premier.last_check_ok, false);
assert.equal(getStationStreamUrl(premier), '');
assert.equal(isVerifiedNigerianStation(premier), false);
assert.notEqual(classifyStationTrust(premier), 'verified_nigerian_station');

const catalog = mergeSeedStations([], ariyoSeedStations);
assert.ok(catalog.some((station) => station.id === premier.id), 'reference candidates without streams remain discoverable');
for (const query of ['Premier FM', 'Premier 93.5', 'Ibadan radio', 'Oyo radio', 'Yoruba radio', 'Radio Nigeria', 'FRCN', 'Nigeria radio']) {
  const ranked = rankStations(catalog.filter((station) => `${station.name} ${station.city} ${station.state} ${station.country} ${station.language} ${station.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase().split(' ')[0])), query);
  assert.ok(ranked.some((station) => station.id === premier.id), `Premier must surface for ${query}`);
}

assert.equal(premier.city, 'Ibadan');
assert.equal(premier.state, 'Oyo');
assert.equal(premier.country, 'Nigeria');
assert.equal(premier.latitude, 7.3775);
assert.equal(premier.longitude, 3.947);

console.log('Premier FM candidate regression passed');
