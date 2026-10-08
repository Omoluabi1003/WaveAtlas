import assert from 'node:assert/strict';
import { briefLanguage, gdeltSourceCountry, resolveBriefCountry } from '../lib/brief-geography';
import { headlineMatchesBrief } from '../lib/brief-editorial';
import { getBriefHeadlines, type BriefCategory, type Headline } from '../lib/news-agent';
import { newsSourceRegistry } from '../lib/news-source-registry';
import { GET } from '../app/api/brief/route';

const places = [
  { country_code: 'ES', country: 'Spain', city: 'Madrid', language: 'Spanish' },
  { country_code: 'CA', country: 'Canada', city: 'Toronto', language: 'English' },
  { country_code: 'NG', country: 'Nigeria', city: 'Ibadan', language: 'English' },
  { country_code: 'CG', country: 'Republic of the Congo', city: 'Brazzaville', language: 'French' },
  { country_code: 'BR', country: 'Brazil', city: 'Brasília', language: 'Portuguese' },
  { country_code: 'JP', country: 'Japan', city: 'Tokyo', language: 'Japanese' },
  { country_code: 'IN', country: 'India', city: 'Mumbai', language: 'Hindi' },
  { country_code: 'US', country: 'United States', city: 'Washington', language: 'English' },
];
const article = (title: string, extra: Partial<Headline> = {}): Headline => ({ title, url: 'https://example.com/story', source: 'Example', ...extra });
const spanish = places[0];
assert.equal(resolveBriefCountry({ country: 'Canada', country_code: ' es ' })?.name, 'Spain');
assert.equal(resolveBriefCountry({ country: 'Spain' })?.code, 'ES');
assert.equal(resolveBriefCountry({ country: 'Global' }), undefined);
assert.equal(gdeltSourceCountry(spanish), 'spain');
assert.equal(gdeltSourceCountry({ country_code: 'CG' }), 'CF');
assert.equal(gdeltSourceCountry({ country_code: 'CD' }), 'CG');
assert.equal(briefLanguage('es-ES; English'), 'spanish');
assert.equal(briefLanguage('unknown'), undefined);
assert.equal(headlineMatchesBrief(article('Toronto council announces budget', { city: 'Madrid', country: 'Spain', country_code: 'ES', sourceCountry: 'Spain' }), spanish, 'country'), false, 'Neither request stamping nor publisher origin establishes story relevance');
assert.equal(headlineMatchesBrief(article('España presenta un nuevo plan'), spanish, 'global'), true);
assert.equal(headlineMatchesBrief(article('Ireland opens a new exhibition', { summary: 'It follows exhibitions in Spain.' }), spanish, 'global'), false, 'Passing summary references must not leak world stories into a country edition');
assert.equal(headlineMatchesBrief(article('Madrid celebra un festival de música'), { ...spanish, category: 'culture' }), true);
assert.equal(headlineMatchesBrief(article('Madrid abre un estadio de fútbol'), { ...spanish, category: 'sports' }), true);
assert.equal(headlineMatchesBrief(article('日本の音楽祭が開幕'), { ...places[5], category: 'culture' }), true);
assert.equal(headlineMatchesBrief(article('Kinshasa announces new schools'), places[3]), false);
assert.equal(headlineMatchesBrief(article('Brazzaville ouvre un festival de musique'), { ...places[3], category: 'culture' }), true);
assert.equal(headlineMatchesBrief(article('Congo announces a policy'), { ...places[3], city: 'Congo' }), false, 'Ambiguous Congo alone must not assign a country');
assert.equal(headlineMatchesBrief(article('Parliament announces a new budget'), spanish, 'country', { domesticCountryCode: 'ES' }), true);
assert.equal(headlineMatchesBrief(article('Parliament announces a new budget'), spanish, 'country', { domesticCountryCode: 'CA' }), false);
assert.equal(headlineMatchesBrief(article('Spain housing plan'), { ...spanish, category: 'local-pulse' }, 'country', { domesticCountryCode: 'ES' }), false, 'Local Pulse still requires the selected city');

async function main() {
  const originalFetch = global.fetch;
  const queries: string[] = [];
  const fixtures = places.flatMap((place) => [
    { title: `${place.country} parliament approves a budget`, url: `https://national-${place.country_code}.example/national`, domain: `national-${place.country_code}.example`, sourcecountry: place.country, language: place.language, seendate: '20261008T120000Z' },
    { title: `${place.city} council repairs roads`, url: `https://local-${place.country_code}.example/local`, domain: `local-${place.country_code}.example`, sourcecountry: place.country, language: place.language },
    { title: `${place.country} businesses expand`, url: `https://business-${place.country_code}.example/business`, domain: `business-${place.country_code}.example`, sourcecountry: place.country, language: place.language },
    { title: `${place.country} signs an international treaty`, url: `https://foreign.example/${place.country_code}`, domain: 'foreign.example', sourcecountry: 'France', language: 'English' },
    { title: 'Unrelated event on Mars', url: `https://national-${place.country_code}.example/mars`, domain: `national-${place.country_code}.example`, sourcecountry: place.country, language: place.language },
  ]);
  global.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes('gdeltproject')) {
      queries.push(new URL(String(url)).searchParams.get('query')!);
      // Deliberately return every country for every query. The implementation
      // must filter actual response content, rather than trusting the query.
      return new Response(JSON.stringify({ articles: [...fixtures, { ...fixtures[0], url: `${fixtures[0].url}?utm_source=duplicate` }, { ...fixtures[1], title: 'Alternate wire headline', url: `${fixtures[1].url}?fbclid=duplicate` }] }));
    }
    return new Response('<rss><channel></channel></rss>');
  }) as typeof fetch;
  try {
    const editions: string[][] = [];
    for (const place of places) {
      const edition = await getBriefHeadlines({ ...place, station_name: 'Geography regression' });
      assert.equal(edition.length, 4, place.country);
      assert(edition.every((headline) => headline.title.includes(place.country) || headline.title.includes(place.city)));
      assert(edition.every((headline) => headline.country_code === place.country_code));
      assert.equal(edition.filter((headline) => headline.sourceCountry === place.country).length, 3);
      assert(edition.some((headline) => headline.source === 'foreign.example'));
      assert(edition.every((headline) => !headline.title.includes('Mars') && headline.title !== 'Alternate wire headline'));
      editions.push(edition.map((headline) => headline.title));
    }
    assert.equal(new Set(editions.map((edition) => edition.join('|'))).size, 8, 'Eight distinct country editions');
    assert(queries.some((query) => query.includes('sourcecountry:spain') && query.includes('sourcelang:spanish')));
    assert(queries.some((query) => query.includes('sourcecountry:CF') && query.includes('sourcelang:french')));
    assert(queries.every((query) => !query.includes('sourcecountry:ES')));
    const api = await GET(new Request('https://waveatlas.example/api/brief?country_code=ES&country=Canada&city=Madrid&station_name=API-regression&category=invalid'));
    const payload = await api.json();
    assert.equal(payload.country, 'Spain');
    assert.equal(payload.country_code, 'ES');
    assert.equal(payload.category, 'front-page');
    assert.equal(payload.headlines.length, 4);
    assert(api.headers.get('Cache-Control')?.includes('s-maxage=900'));
    assert.equal(payload.headlines.find((item: Headline) => item.publishedAt)?.publishedAt, '2026-10-08T12:00:00Z');
    assert.equal((await getBriefHeadlines({ country_code: 'ES', country: 'Canada', city: 'Madrid', language: 'Spanish', station_name: 'Geography regression' }))[0].country, 'Spain');
    const requestCount = queries.length;
    await getBriefHeadlines({ country: 'Spain', city: 'Madrid', language: 'Spanish', station_name: 'Geography regression' });
    assert.equal(queries.length, requestCount, 'Name-only and code-based requests reuse the normalized country cache');
    assert.deepEqual(await getBriefHeadlines({ country: 'Global', city: 'World' }), []);
    const sections: Record<BriefCategory, string> = {
      'front-page': 'España presenta un nuevo plan', 'local-pulse': 'Madrid mejora el transporte y las escuelas',
      culture: 'Madrid celebra un festival de música', sports: 'España celebra un torneo de fútbol', 'radio-signal': 'Madrid anuncia una nueva emisora de radio',
    };
    global.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes('gdeltproject')) return new Response('Provider temporarily unavailable', { status: 503 });
      const feed = newsSourceRegistry.find((entry) => entry.country_code === 'ES')!.feeds[0].url;
      if (String(url) !== feed) return new Response('<rss/>');
      return new Response(`<rss><channel>${Object.entries(sections).map(([id, title]) => `<item><title>${title}</title><link>https://spanish.example/${id}</link></item>`).join('')}</channel></rss>`);
    }) as typeof fetch;
    for (const category of ['local-pulse', 'culture', 'sports', 'radio-signal'] as BriefCategory[]) {
      const edition = await getBriefHeadlines({ ...spanish, station_name: 'Multilingual regression', category });
      assert.deepEqual(edition.map((item) => item.title), category === 'local-pulse' ? [sections['local-pulse'], sections.culture, sections['radio-signal']] : [sections[category]], category);
    }
    // A dedicated domestic section may omit the country in its headline.
    global.fetch = (async (url: string | URL | Request) => String(url).includes('globalnews.ca/canada/feed')
      ? new Response('<rss><channel><item><title>Parliament announces a new budget</title><link>https://canadian.example/budget</link></item></channel></rss>')
      : new Response('', { status: 503 })) as typeof fetch;
    assert.equal((await getBriefHeadlines({ ...places[1], station_name: 'Domestic implicit regression' }))[0].sourceCountry, 'Canada');
    global.fetch = (async () => { throw new Error('Provider offline'); }) as typeof fetch;
    assert.deepEqual(await getBriefHeadlines({ ...spanish, station_name: 'Failure regression' }), []);
    const emptyApi = await GET(new Request('https://waveatlas.example/api/brief?country_code=CG&city=Brazzaville&station_name=empty-API-regression'));
    assert.deepEqual((await emptyApi.json()).headlines, []);
    assert(emptyApi.headers.get('Cache-Control')?.includes('s-maxage=60'));
    assert.equal((await getBriefHeadlines({ ...spanish, station_name: 'Geography regression' })).length, 4, 'An unrelated provider failure cannot erase another edition cache');
    // Empty editions retry quickly after recovery instead of staying empty for 15 minutes.
    const realNow = Date.now;
    const startedAt = realNow();
    global.fetch = (async () => new Response(JSON.stringify({ articles: fixtures }))) as typeof fetch;
    try {
      Date.now = () => startedAt + 30_000;
      assert.deepEqual(await getBriefHeadlines({ ...spanish, station_name: 'Failure regression' }), []);
      Date.now = () => startedAt + 61_000;
      assert.equal((await getBriefHeadlines({ ...spanish, station_name: 'Failure regression' })).length, 4);
    } finally { Date.now = realNow; }
    console.log('GeoBrief: eight country editions, authoritative ISO routing, Congo separation, multilingual topics, domestic provenance, strict global filtering, query operators, duplicate removal, normalized caches, and provider failures passed');
  } finally { global.fetch = originalFetch; }
}
main().catch((error) => { console.error(error); process.exit(1); });
