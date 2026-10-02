import assert from 'node:assert/strict';
import { classifyStationTrust, getStationStreamUrl } from '../lib/fast-connect-engine';
import { ariyoSeedStations } from '../lib/stations/ariyoSeedStations';
import { isVerifiedNigerianStation, mergeSeedStations, rankStations } from '../lib/stations';

const premier = ariyoSeedStations.find((station) => station.id === 'ariyo-ai-premier-935-fm-ibadan');
assert.ok(premier, 'Premier FM must be present in the Ariyo curated catalog');
const transport = 'https://centova57.instainternet.com/proxy/premier?mp=/stream';
assert.equal(premier.url, transport);
assert.equal(premier.url_resolved, transport);
assert.equal(premier.verification_status, 'verified');
assert.equal(premier.validation_status, 'verified');
assert.equal(premier.is_active, true);
assert.equal(premier.last_check_ok, true);
assert.equal(premier.codec, 'AAC');
assert.equal(premier.bitrate, 48);
assert.equal(getStationStreamUrl(premier), transport);
assert.equal(isVerifiedNigerianStation(premier), true);
assert.equal(classifyStationTrust(premier), 'verified_nigerian_station');

const catalog = mergeSeedStations([], ariyoSeedStations);
assert.ok(catalog.some((station) => station.id === premier.id), 'runtime-verified Premier transport remains discoverable');
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
