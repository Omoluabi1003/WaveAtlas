import generatedSnapshot from '../lib/stations/stationHealthSnapshot.json';
import { calculateStationReliabilityIndex } from '../lib/atlas-intelligence-engine';
import { healthMemoryBoost } from '../lib/station-health';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { request } from 'node:http';
import { audioSampleKind, isPublicAddress, probeStream } from '../lib/agents/stream-probe';
import { healthEvidenceKey, HEALTH_EVIDENCE_TTL_MS, scheduledHealthBoost, selectHealthBatch, type HealthSnapshot } from '../lib/agents/station-health-policy';
import { ariyoSeedStations, mergeSeedStations, rankStations, fallbackStations } from '../lib/stations';
import { existingStationKeys, isDuplicateCandidate, normalizeUrl, rejectReason } from '../lib/radio-discovery';

async function main() {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
  const audio = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(60)]);
  assert.equal(audioSampleKind(audio), 'ogg');
  assert.equal(audioSampleKind(Buffer.from('<html><body>blocked stream</body></html>')), undefined);
  assert.equal(audioSampleKind(Buffer.from('#EXTM3U\nhttps://example.com/live')), undefined);
  assert.equal(audioSampleKind(Buffer.from([0xff, 0xfb, 0x90, 0x64, ...Array(60).fill(0)])), 'mpeg');
  assert.equal(audioSampleKind(Buffer.from([0xff, 0xf1, 0x50, 0x80, ...Array(60).fill(0)])), 'aac');

  let destroyed = 0;
  function fakeRequest(status: number, bytes: Buffer, location?: string, stall = false) {
    return ((_url: unknown, options: { signal: AbortSignal }, callback: (res: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & { end(): void };
      req.end = () => {
        const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: object; destroy(): void };
        res.statusCode = status; res.headers = location ? { location } : { 'content-type': 'audio/mpeg' };
        res.destroy = () => { destroyed++; };
        options.signal.addEventListener('abort', () => req.emit('error', new Error('aborted')), { once: true });
        callback(res);
        if (!stall && !location) queueMicrotask(() => { res.emit('data', bytes); res.emit('end'); });
      };
      return req;
    }) as unknown as typeof request;
  }
  const resolve = async () => [{ address: '8.8.8.8', family: 4 }];
  const good = await probeStream('https://example.com/audio', 100, { resolve, request: fakeRequest(206, audio) });
  assert.equal(good.ok, true); assert.equal(good.bytesSampled, audio.length); assert(destroyed > 0);
  assert.equal((await probeStream('https://example.com/blocked', 100, { resolve, request: fakeRequest(403, audio) })).ok, false);
  const html = await probeStream('https://example.com/html', 100, { resolve, request: fakeRequest(200, Buffer.alloc(8000, 65)) });
  assert.equal(html.ok, false); assert.equal(html.bytesSampled, 4096);
  const redirect = await probeStream('https://example.com/redirect', 100, { resolve: async (host) => [{ address: host === '127.0.0.1' ? host : '8.8.8.8', family: 4 }], request: fakeRequest(302, audio, 'http://127.0.0.1/private') });
  assert.equal(redirect.reason, 'non-public-address');
  assert.equal((await probeStream('https://example.com/slow', 20, { resolve, request: fakeRequest(200, audio, undefined, true) })).reason, 'timeout');
  assert.equal((await probeStream('file:///etc/passwd')).reason, 'unsafe-url');

  const stations = [...ariyoSeedStations, ...fallbackStations];
  const before = JSON.stringify(stations);
  const first = selectHealthBatch(stations, 0, 3);
  const second = selectHealthBatch(stations, first.cursor, 3);
  assert.equal(first.stations.length, 3);
  assert(!second.stations.some((s) => first.stations.some((a) => healthEvidenceKey(a) === healthEvidenceKey(s))));
  const now = Date.now(), station = first.stations[0], key = healthEvidenceKey(station);
  const evidence: HealthSnapshot = { generatedAt: new Date(now).toISOString(), cursor: 0, records: { [key]: { stationId: station.station_uuid, url: key, checkedAt: new Date(now).toISOString(), status: 'healthy', reason: 'audio-ogg', consecutiveFailures: 0, bytesSampled: 64, responseTimeMs: 5 } } };
  assert.equal(scheduledHealthBoost(station, now, evidence), 8);
  evidence.records[key].status = 'degraded'; evidence.records[key].consecutiveFailures = 1;
  assert.equal(scheduledHealthBoost(station, now, evidence), 0);
  evidence.records[key].consecutiveFailures = 3;
  assert.equal(scheduledHealthBoost(station, now, evidence), -12);
  assert.equal(scheduledHealthBoost(station, now + HEALTH_EVIDENCE_TTL_MS, evidence), 0);
  assert.equal(scheduledHealthBoost({ ...station, url: 'https://different.example/audio', url_resolved: '' }, now, evidence), 0);
  assert.equal(scheduledHealthBoost({ ...station, sourceType: 'geoaudio' }, now, evidence), 0);
  assert.equal(mergeSeedStations([{ ...station, curation_tier: 'radio_browser', curation_source: 'radio-browser', country_code: 'ZZ', url: 'https://different.example/live', url_resolved: '' }], [station]).length, 2);
  assert.equal(rankStations(stations).length, stations.length);
  assert.equal(JSON.stringify(stations), before);
  const runtimeSnapshot = generatedSnapshot as HealthSnapshot;
  const healthy = { ...station, id: 'healthy-fixture', station_uuid: 'healthy-fixture', health_score: 70, url: 'https://healthy.example/live', url_resolved: '' };
  const unchecked = { ...healthy, id: 'unchecked-fixture', station_uuid: 'unchecked-fixture', url: 'https://unchecked.example/live' };
  const record = { ...evidence.records[key], url: healthy.url, checkedAt: new Date(Date.now()).toISOString(), status: 'healthy' as const, consecutiveFailures: 0 };
  runtimeSnapshot.records[healthy.url] = record;
  try {
    assert.equal(rankStations([unchecked, healthy])[0].id, healthy.id);
    assert(healthMemoryBoost(healthy) > healthMemoryBoost(unchecked));
    assert(calculateStationReliabilityIndex(healthy).inputs.streamHealth > calculateStationReliabilityIndex(unchecked).inputs.streamHealth);
  } finally { delete runtimeSnapshot.records[healthy.url]; }

  assert.notEqual(normalizeUrl('https://example.com/Live'), normalizeUrl('https://example.com/live'));
  const duplicateKeys = existingStationKeys([station]);
  assert.equal(isDuplicateCandidate({ name: station.name, countrycode: 'ZZ', url: 'https://other.example/live', stationuuid: 'distinct' }, duplicateKeys), false);
  assert.equal(rejectReason({ name: 'Valid Station', url: 'file:///tmp/audio', countrycode: 'NG', lastcheckok: 1, bitrate: 128 }, 64, false), 'missing_or_invalid_stream_url');
  assert.equal(rejectReason({ name: 'Valid Station', url: 'https://example.com/audio', lastcheckok: 1, bitrate: 128 }, 64, false), 'missing_country_code');
  console.log('Background agents: audio evidence, bounded cancellation, redirect safety, timeout, rotation, ranking freshness, and catalog preservation passed');
}
main().catch((error) => { console.error(error); process.exit(1); });
