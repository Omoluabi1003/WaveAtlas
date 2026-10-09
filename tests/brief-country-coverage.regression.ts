import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getBriefHeadlines } from '../lib/news-agent';
import { resolveBriefCountry } from '../lib/brief-geography';
import { sectionSearchSource } from '../lib/brief-section-routing';

// Exercise every registered country/territory, including those without domestic
// feeds, with all publishers/GDELT unavailable and only search RSS responding.
const geography = readFileSync(new URL('../lib/brief-geography.ts', import.meta.url), 'utf8');
const codes = geography.match(/const ISO_CODES = \('([^']+)'/)![1].split(' ');
const xml = (title: string, id: string) => `<rss><channel><item><title>${title} - Independent Publisher</title><link>https://news.google.com/rss/articles/${id}</link><source>Independent Publisher</source><pubDate>Wed, 07 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
async function main() {
  const originalFetch = global.fetch;
  try {
    for (const code of codes) {
      const country = resolveBriefCountry({ country_code: code })!;
      assert(country, code);
      const context = { country_code: code, country: country.name, category: 'front-page' as const, station_name: 'All-country coverage test' };
      const source = sectionSearchSource(context)!;
      assert(source, `Search fallback for ${code}`);
      assert(source.feeds[0].url.startsWith("https://news.google.com/rss/search?"));
      let requested = false;
      global.fetch = (async (url: string | URL | Request) => {
        if (String(url).includes('news.google.com') && new URL(String(url)).searchParams.get('q')!.includes('when:7d')) { requested = true; return new Response(xml(`${country.name} announces a public initiative`, code)); }
        return new Response('', { status: 503 });
      }) as typeof fetch;
      const headlines = await getBriefHeadlines(context);
      assert(requested, code);
      assert.equal(headlines.length, 1, code);
      assert.equal(headlines[0].country_code, code);
      assert.equal(headlines[0].source, 'Independent Publisher');
      assert.equal(headlines[0].publishedAt, 'Wed, 07 Oct 2026 10:00:00 GMT');
    }
    global.fetch = (async (url: string | URL | Request) => {
      if (!String(url).includes('bing.com')) return new Response('', { status: 503 });
      return new Response('<rss><channel><item><title>Tuvalu prepares new climate projects</title><link>http://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fpublisher.example%2Ftuvalu</link><News:Source>Pacific Publisher</News:Source></item><item><title>Canada prepares new climate projects</title><link>https://publisher.example/canada</link><News:Source>Pacific Publisher</News:Source></item><item><title>Tuvalu archive report</title><link>https://publisher.example/archive</link><pubDate>Mon, 01 Jan 2001 00:00:00 GMT</pubDate></item></channel></rss>');
    }) as typeof fetch;
    const independent = await getBriefHeadlines({ country_code: 'TV', category: 'front-page', station_name: 'Independent search fallback' });
    assert.equal(independent.length, 1, 'Bing recovers when Google and all other providers fail');
    assert.equal(independent[0].source, 'Pacific Publisher');
    assert.equal(independent[0].url, 'https://publisher.example/tuvalu');
    const periods: string[] = [];
    global.fetch = (async (url: string | URL | Request) => {
      const value = String(url);
      if (!value.includes('news.google.com')) return new Response('', { status: 503 });
      const q = new URL(value).searchParams.get('q')!;
      const period = q.match(/when:(\d+)d/)![1]; periods.push(period);
      return new Response(xml(period === '90' ? 'Tuvalu announces new public services' : 'Canada announces new public services', period));
    }) as typeof fetch;
    const sparse = await getBriefHeadlines({ country_code: 'TV', city: 'Funafuti', category: 'front-page', station_name: 'Sparse edition test' });
    assert.deepEqual(periods, ['7', '30', '90']);
    assert.equal(sparse.length, 1);
    assert(sparse[0].title.startsWith('Tuvalu'), 'Unrelated countries must be rejected during every search expansion');
    global.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
    const originalNow = Date.now;
    const initialTime = Date.now();
    try {
      Date.now = () => initialTime + 16 * 60_000;
      assert.deepEqual(await getBriefHeadlines({ country_code: 'TV', city: 'Funafuti', category: 'front-page', station_name: 'Sparse edition test' }), sparse, 'A temporary outage retains verified reports');
      Date.now = () => initialTime + 26 * 3_600_000;
      assert.deepEqual(await getBriefHeadlines({ country_code: 'TV', city: 'Funafuti', category: 'front-page', station_name: 'Sparse edition test' }), [], 'Serving stale reports must not extend their retention indefinitely');
    } finally { Date.now = originalNow; }
    assert.deepEqual(await getBriefHeadlines({ country_code: 'NR', category: 'front-page', station_name: 'Total provider outage' }), []);
    assert.deepEqual(await getBriefHeadlines({ country: 'Unresolved place', station_name: 'Invalid destination' }), []);
    console.log(`Brief country coverage: all ${codes.length} registered countries/territories have Front Page search fallback; sparse 7/30/90-day recovery, publisher attribution, dates, geography isolation and total outage behavior passed`);
  } finally { global.fetch = originalFetch; }
}
main().catch((error) => { console.error(error); process.exit(1); });
