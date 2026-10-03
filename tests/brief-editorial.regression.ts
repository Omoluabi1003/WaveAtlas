import assert from 'node:assert/strict';
import { headlineMatchesBrief } from '../lib/brief-editorial';
import { getBriefHeadlines, type BriefCategory, type Headline } from '../lib/news-agent';

async function main() {
  const place = { city: 'Ibadan', country: 'Nigeria', country_code: 'NG', station_name: 'Premier FM' };
  const article = (title: string): Headline => ({ title, source: 'AM FM Radio Sports Culture Media', url: 'https://publisher.example/article' });
  for (const category of ['culture', 'sports', 'radio-signal', 'local-pulse'] as BriefCategory[]) {
    assert.equal(headlineMatchesBrief(article('Nigeria parliament demands a fresh start'), { ...place, category }), false, category);
  }
  assert.equal(headlineMatchesBrief(article('Nigeria party wins parliamentary election'), { ...place, category: 'culture' }), false);
  assert.equal(headlineMatchesBrief(article('Ibadan train station opens'), { ...place, category: 'radio-signal' }), false);
  assert.equal(headlineMatchesBrief(article('Ibadan radio transmitter upgraded'), { ...place, category: 'radio-signal' }), true);
  assert.equal(headlineMatchesBrief(article('Premier FM opens an Ibadan studio'), { ...place, category: 'radio-signal' }), true);
  assert.equal(headlineMatchesBrief(article('Nigeria football team reaches final'), { ...place, category: 'sports' }), true);
  assert.equal(headlineMatchesBrief(article('Toronto football team reaches final'), { ...place, category: 'sports' }), false);
  assert.equal(headlineMatchesBrief(article('Ibadan council repairs neighborhood roads'), { ...place, category: 'local-pulse' }), true);
  assert.equal(headlineMatchesBrief(article('Lagos council repairs neighborhood roads'), { ...place, category: 'local-pulse' }, 'country'), false);
  assert.equal(headlineMatchesBrief(article('Nigeria film festival celebrates heritage'), { ...place, category: 'culture' }), true);
  assert.equal(headlineMatchesBrief(article('Nigerian artists stage an exhibition'), { ...place, category: 'culture' }), true);

  const fixtures = [
    ['Ibadan council repairs neighborhood roads', 'local'],
    ['Nigeria film festival celebrates heritage', 'culture'],
    ['Nigeria football team reaches final', 'sports'],
    ['Ibadan radio transmitter upgraded', 'radio'],
    ['Nigeria parliament demands a fresh start', 'general'],
  ];
  const originalFetch = global.fetch;
  global.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes('gdeltproject')) return new Response(JSON.stringify({ articles: [
      { title: 'Nigeria parliament demands a fresh start', url: 'https://publisher.example/general', domain: 'publisher.example' },
      { title: 'Toronto football team reaches final', url: 'https://publisher.example/toronto', domain: 'publisher.example' },
    ] }));
    return new Response(`<rss><channel>${fixtures.map(([title, id]) => `<item><title>${title}</title><link>https://publisher.example/${id}</link><description>${title}</description></item>`).join('')}</channel></rss>`);
  }) as typeof fetch;
  try {
    const sections: Record<string, string[]> = {};
    for (const category of ['front-page', 'local-pulse', 'culture', 'sports', 'radio-signal'] as BriefCategory[]) {
      sections[category] = (await getBriefHeadlines({ ...place, category })).map((item) => item.title);
    }
    assert.equal(sections['front-page'].length, 5);
    assert.deepEqual(sections['local-pulse'], [fixtures[0][0]]);
    assert.deepEqual(sections.culture, [fixtures[1][0]]);
    assert.deepEqual(sections.sports, [fixtures[2][0]]);
    assert.deepEqual(sections['radio-signal'], [fixtures[3][0]]);
    global.fetch = (async () => { throw new Error('Provider unavailable'); }) as typeof fetch;
    assert.deepEqual(await getBriefHeadlines({ ...place, city: 'Osogbo', category: 'sports' }), []);
    assert.deepEqual((await getBriefHeadlines({ ...place, category: 'sports' })).map((item) => item.title), sections.sports);
  } finally { global.fetch = originalFetch; }
  console.log('Brief editorial: category boundaries, destination matching, GDELT filtering, independent caches, and honest empty sections passed');
}
main().catch((error) => { console.error(error); process.exit(1); });
