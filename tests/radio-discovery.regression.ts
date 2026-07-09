import assert from 'node:assert/strict';
import { candidateToStation, existingStationKeys, hasValidCoordinates, isDuplicateCandidate, normalizeStationName, normalizeUrl, qualityScore, rejectReason } from '../lib/radio-discovery';

const base = { stationuuid: 'abc-123', name: ' Rádio Viva FM ', url: 'https://example.com/live.mp3', url_resolved: 'https://example.com/live.mp3', country: 'Brazil', countrycode: 'BR', language: 'Portuguese', tags: 'news,music', codec: 'MP3', bitrate: 128, geo_lat: -23.55, geo_long: -46.63, votes: 1000, clickcount: 5000, clicktrend: 3, lastcheckok: 1 };

assert.equal(normalizeStationName(' Rádio--Viva_FM '), 'radio viva fm');
assert.equal(normalizeUrl('HTTPS://Example.com/live.mp3#frag'), 'https://example.com/live.mp3');
assert.equal(hasValidCoordinates(-23.55, -46.63), true);
assert.equal(hasValidCoordinates(0, 0), false);
assert.equal(rejectReason(base), undefined);
assert.equal(rejectReason({ ...base, bitrate: 64 }), 'low_bitrate');
assert.equal(rejectReason({ ...base, name: 'casino spam fm' }), 'suspicious_name');
assert.ok(qualityScore(base) >= 80);
const station = candidateToStation(base, '2026-07-09T00:00:00.000Z');
assert.equal(station.country_code, 'BR');
assert.equal(station.validation_status, 'verified');
const keys = existingStationKeys([station]);
assert.equal(isDuplicateCandidate({ ...base, stationuuid: station.station_uuid }, keys), true);
assert.equal(isDuplicateCandidate({ ...base, stationuuid: 'other', name: 'Different', url: 'https://example.org/a.mp3', url_resolved: 'https://example.org/a.mp3' }, keys), false);
console.log('radio discovery regression checks passed');
