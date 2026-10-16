import assert from 'node:assert/strict';
import { frcnNetwork } from '../lib/stations/frcnNetwork';

assert.ok(frcnNetwork.length >= 48, 'FRCN probe workflow must cover the complete registry');
const candidates = frcnNetwork.filter((record) => record.streamUrl);
for (const candidate of candidates) {
  assert.equal(candidate.streamStatus, 'candidate', `${candidate.station} must remain candidate before runtime probe verification`);
  assert.ok(candidate.streamUrl?.startsWith('https://'), `${candidate.station} must use an HTTPS candidate endpoint`);
}
assert.ok(candidates.some((record) => record.station === 'Kapital FM 92.9'), 'Kapital FM candidate should be present');
console.log(`FRCN targeted probe guard passed: ${frcnNetwork.length} outlets, ${candidates.length} direct candidates.`);
