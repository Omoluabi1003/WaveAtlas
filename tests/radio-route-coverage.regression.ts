import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/stations/search/route';
import { fetchRadioDirectory } from '../lib/radio-browser-client';
import { attachRadioStream, releaseRadioStream, isHlsStream } from '../lib/radio-stream-player';
import { middleEastStations } from '../lib/stations/middleEastStations';
import { BRAND } from '../lib/branding';

async function main() {
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => { calls++; return new Response('[]', { headers: { 'content-type': 'application/json' } }); };
for (const [name, slug] of [['Amuludun', 'amuludun'], ['Gold FM', 'gold']]) {
  const response = await GET(new NextRequest(`http://localhost/api/stations/search?q=${encodeURIComponent(name)}`));
  const result = await response.json();
  assert.equal(result.source, 'curated-direct-stream');
  assert(result.stations.some((station: { url: string; country_code: string }) => station.url === `https://centova57.instainternet.com/proxy/${slug}?mp=/stream` && station.country_code === 'NG'));
}
assert.equal(calls, 0, 'Named curated stations return without directory/geocoder delay');
for (const name of ['Dubai Eye', 'Virgin Radio Dubai']) {
  const response = await GET(new NextRequest(`http://localhost/api/stations/search?q=${encodeURIComponent(name)}`));
  const result = await response.json(); assert(result.stations.length);
  assert(result.stations.every((station: { url: string; country_code: string; is_active: boolean }) => station.country_code === 'AE' && station.url.includes('radiojar.com') && !station.is_active), 'Restricted UAE signals keep correct identity instead of playing UK stations');
}
const response = await GET(new NextRequest('http://localhost/api/stations/search?q=Middle%20East'));
const regional = await response.json();
assert.equal(regional.intent, 'region');
for (const code of ['AE', 'SA', 'QA', 'OM', 'JO', 'LB']) assert(regional.stations.some((station: { country_code: string }) => station.country_code === code), `Middle East results include ${code}`);
assert(middleEastStations.filter(station => station.is_active).every(station => station.url.startsWith('https://')));
assert(BRAND.description.includes('live radio worldwide') && BRAND.description.includes('Atlas Journey'));

const aborted: string[] = [];
globalThis.fetch = async (url, options) => {
  const host = new URL(String(url)).hostname;
  options?.signal?.addEventListener('abort', () => aborted.push(host));
  if (host.startsWith('de1')) await new Promise(resolve => setTimeout(resolve, 1300));
  return new Response(JSON.stringify([{ host }]), { headers: { 'content-type': 'application/json' } });
};
const start = Date.now(); const directory = await fetchRadioDirectory<{ host: string }[]>('/stations/search?name=test');
assert(directory[0].host.startsWith('nl1'), 'A stalled primary directory does not block healthy mirror');
assert(Date.now() - start < 1200); assert(aborted.includes('de1.api.radio-browser.info'));
globalThis.fetch = originalFetch;

let loads = 0;
const media = { src: '', error: null, load: () => loads++, canPlayType: () => 'probably' } as unknown as HTMLMediaElement;
await attachRadioStream(media, 'https://example.org/live.mp3', () => assert.fail('Unexpected fatal error'));
await attachRadioStream(media, 'https://example.org/live.mp3', () => assert.fail('Unexpected fatal error'));
assert.equal(loads, 1, 'Volume/status changes reuse the existing stream instead of reconnecting');
await attachRadioStream(media, 'https://example.org/live.m3u8', () => assert.fail('Unexpected fatal error'));
assert.equal(loads, 2, 'A station change reconnects');
releaseRadioStream(media);
await attachRadioStream(media, 'https://example.org/live.m3u8', () => assert.fail('Unexpected fatal error'));
assert.equal(loads, 3);
assert(isHlsStream('https://example.org/live.m3u8?token=public'));
assert(!isHlsStream('https://example.org/live.mp3'));
console.log('Radio coverage: direct Amuludun/Gold discovery, correct UAE identities, six-country regional coverage, hedged directory lookup, native HLS and connection reuse passed');

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
