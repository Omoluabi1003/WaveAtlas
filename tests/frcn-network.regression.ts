import assert from 'node:assert/strict';
import { frcnNetwork } from '../lib/stations/frcnNetwork';
import { nigeriaGeoTruth } from '../lib/stations/nigeriaGeoTruth';

assert.equal(frcnNetwork.length, nigeriaGeoTruth.length, 'Every FRCN GeoTruth outlet must exist in the stream-discovery registry');
assert.ok(frcnNetwork.length >= 48, `Expected complete FRCN baseline, found ${frcnNetwork.length}`);

const names = new Set<string>();
for (const record of frcnNetwork) {
  assert.ok(record.station.trim(), 'FRCN record must have a station identity');
  assert.ok(!names.has(record.station.toLowerCase()), `Duplicate FRCN station: ${record.station}`);
  names.add(record.station.toLowerCase());
  assert.ok(record.discoveryHints.length >= 3, `${record.station} needs multiple discovery hints`);
  if (record.streamStatus === 'verified') {
    assert.ok(record.streamUrl?.startsWith('https://'), `${record.station} verified playback requires HTTPS stream URL`);
  }
  if (record.streamUrl) {
    assert.ok(record.streamUrl.startsWith('https://'), `${record.station} candidate URL must use HTTPS`);
  }
}

console.log(`FRCN network regression passed for ${frcnNetwork.length} outlets.`);
