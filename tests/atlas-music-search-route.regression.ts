import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/stations/search/route';
import { answerAtlasIntelligently } from '../lib/atlas-intelligence';
import { atlasStationSearchParams } from '../lib/atlas-music-search';
import { stationMatchesMusicGenres } from '../lib/atlas-music-intent';

async function main() {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const raw = (id: string, name: string, tags: string) => ({ stationuuid: id, name, tags, url: `https://example.test/${id}`, url_resolved: `https://example.test/${id}`, country: 'United States', countrycode: 'US', language: 'English', lastcheckok: 1, votes: 100, clickcount: 100, codec: 'MP3', bitrate: 128 });
  globalThis.fetch = (async (url: string | URL | Request) => {
    const address = String(url); requests.push(address);
    assert.match(address, /stations\/search/);
    return Response.json([raw('name-only', 'Blues FM', 'pop,rock'), raw('jazz-only', 'Jazz FM', 'jazz'), raw('true-match', 'Evening Radio', 'jazz,blues')]);
  }) as typeof fetch;
  try {
    const intent = answerAtlasIntelligently('Search for Jazz Blues genre');
    assert.ok(intent.action?.type === 'search');
    const request = new NextRequest(`http://waveatlas.test/api/stations/search?${atlasStationSearchParams(intent.action.query, intent.action.music)}`);
    const response = await GET(request);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.intent, 'genre');
    assert.ok(data.stations.some((item: { station_uuid: string }) => item.station_uuid === 'true-match'));
    assert.ok(!data.stations.some((item: { station_uuid: string }) => ['name-only', 'jazz-only'].includes(item.station_uuid)));
    assert.ok(data.stations.every((item: { tags: string[] }) => stationMatchesMusicGenres(item.tags, intent.action!.type === 'search' ? intent.action!.music! : { genres: [], match: 'all' })));
    assert.ok(requests.some(url => new URL(url).searchParams.get('tag') === 'jazz'));
    assert.ok(requests.some(url => new URL(url).searchParams.get('tag') === 'blues'));
    const bad = await GET(new NextRequest('http://waveatlas.test/api/stations/search?genres=not-a-genre'));
    assert.equal(bad.status, 400);
    console.log('Music search route: spoken Jazz Blues intent queries genre tags and rejects misleading station names and partial genre matches.');
  } finally { globalThis.fetch = originalFetch; }
}
void main();
