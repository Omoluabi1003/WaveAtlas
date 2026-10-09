import assert from 'node:assert/strict';
import { headlineMatchesBrief } from '../lib/brief-editorial';
import { briefCityTerms } from '../lib/brief-geography';
import { briefPlaceQuery, briefTopicQuery, sectionSearchSource } from '../lib/brief-section-routing';
import { getNewsSources, newsSourceRegistry } from '../lib/news-source-registry';
import { getBriefHeadlines, type BriefCategory, type Headline } from '../lib/news-agent';

const munich = { city: 'Munich', country: 'Germany', country_code: 'DE', language: 'German', station_name: 'Radio Gong 96.3' };
const article = (title: string, extra: Partial<Headline> = {}): Headline => ({ title, source: 'Example', url: 'https://example.com/article', ...extra });
assert(briefCityTerms(munich).includes('München'));
assert.equal(getNewsSources({ city: 'München', countryCode: 'DE' }).citySources[0]?.city, 'Munich');
assert.equal(getNewsSources({ city: 'Munich', countryCode: 'US' }).citySources.length, 0);
assert.equal(headlineMatchesBrief(article('Münchner Stadtrat beschließt neue Regelung'), { ...munich, category: 'local-pulse' }), true);
assert.equal(headlineMatchesBrief(article('München bekommt einen neuen Treffpunkt'), { ...munich, category: 'local-pulse' }), true, 'Local stories do not require literal civic/topic keywords');
assert.equal(headlineMatchesBrief(article('Berlin bekommt einen neuen Treffpunkt'), { ...munich, category: 'local-pulse' }), false);
assert.equal(headlineMatchesBrief(article('Deutschland beschließt ein Gesetz'), { ...munich, category: 'local-pulse' }), false);
assert.equal(headlineMatchesBrief(article('Ein neuer Treffpunkt'), { ...munich, category: 'local-pulse' }, 'city', { domesticCountryCode: 'DE', feedCity: 'Munich' }), true);
assert.equal(headlineMatchesBrief(article('Ein neuer Treffpunkt'), { ...munich, category: 'local-pulse' }, 'city', { domesticCountryCode: 'DE', feedCity: 'Berlin' }), false);
assert.equal(headlineMatchesBrief(article('München eröffnet eine Kunstausstellung'), { ...munich, category: 'culture' }), true);
assert.equal(headlineMatchesBrief(article('München gewinnt im Fußball'), { ...munich, category: 'sports' }), true);
assert.equal(headlineMatchesBrief(article('München erweitert den Hörfunk'), { ...munich, category: 'radio-signal' }), true);
for (const category of ['culture', 'sports', 'radio-signal'] as BriefCategory[]) {
  assert.equal(headlineMatchesBrief(article('München beschließt einen neuen Haushalt'), { ...munich, category }), false, category);
}
assert.equal(headlineMatchesBrief(article('Berlin präsentiert neue Perspektiven'), { ...munich, category: 'culture' }, 'country', { topics: ['culture'] }), true, 'Verified publisher section metadata can establish the topic');
assert.equal(headlineMatchesBrief(article('Paris präsentiert neue Perspektiven'), { ...munich, category: 'culture' }, 'country', { topics: ['culture'] }), false, 'Section metadata alone cannot establish Germany');
assert.equal(headlineMatchesBrief(article('München beschließt einen Haushalt'), { ...munich, category: 'sports' }, 'country', { topics: ['culture'] }), false);
assert(briefPlaceQuery({ ...munich, category: 'local-pulse' }).includes('München'));
assert.equal(briefTopicQuery({ ...munich, category: 'local-pulse' }), '');
assert(briefTopicQuery({ ...munich, category: 'sports' }).includes('Fußball'));
assert(sectionSearchSource({ ...munich, category: 'front-page' }), 'Front Page must have the universal fallback');

async function main() {
  const originalFetch = global.fetch;
  const urls: string[] = [];
  const cityFeed = getNewsSources({ city: 'Munich', countryCode: 'DE' }).citySources[0].feeds[0].url;
  const german = newsSourceRegistry.find((entry) => entry.country_code === 'DE' && !entry.city)!;
  const sportFeed = german.feeds.find((feed) => feed.categories?.includes('sports'))!.url;
  const cultureFeed = german.feeds.find((feed) => feed.categories?.includes('culture'))!.url;
  const radioFeed = german.feeds.find((feed) => feed.categories?.includes('radio-signal'))!.url;
  const items: Record<string, Array<[string, string, string]>> = {
    [cityFeed]: [['Ein neuer Treffpunkt', 'https://city.example/civic', 'Neue Angebote für alle.']],
    [sportFeed]: [['München gewinnt wichtige Partie', 'https://sport.example/match', 'Ein guter Tag.']],
    [cultureFeed]: [['Berlin zeigt neue Perspektiven', 'https://culture.example/exhibition', 'Ein besonderer Abend.']],
    [radioFeed]: [['Neues Radioprogramm für Deutschland', 'https://radio.example/schedule', 'Neu auf Sendung.']],
  };
  const xml = (rows: Array<[string, string, string]>) => `<rss><channel>${rows.map(([title, url, summary]) => `<item><title>${title}</title><link>${url}</link><description>${summary}</description><media:thumbnail url="https://images.example/picture.jpg"/></item>`).join('')}</channel></rss>`;
  global.fetch = (async (url: string | URL | Request) => {
    const value = String(url); urls.push(value);
    if (value.includes('gdeltproject')) throw new Error('GDELT offline');
    if (value.includes('news.google.com')) return new Response('', { status: 503 });
    return new Response(xml(items[value] || []));
  }) as typeof fetch;
  try {
    const editions = new Map<string, Headline[]>();
    for (const category of ['local-pulse', 'culture', 'sports', 'radio-signal'] as BriefCategory[]) {
      const before = urls.length;
      const headlines = await getBriefHeadlines({ ...munich, category });
      editions.set(category, headlines);
      assert.equal(headlines.length, 1, category);
      const requested = urls.slice(before);
      if (category === 'sports') { assert(requested.includes(sportFeed)); assert(!requested.includes(cultureFeed)); assert(!requested.includes(radioFeed)); }
      if (category === 'culture') { assert(requested.includes(cultureFeed)); assert(!requested.includes(sportFeed)); }
      if (category === 'radio-signal') { assert(requested.includes(radioFeed)); assert(!requested.includes(sportFeed)); }
    }
    assert.equal(new Set([...editions.values()].map((headlines) => headlines[0].title)).size, 4, 'Four populated, independently routed Munich tabs');
    assert.equal(editions.get('local-pulse')![0].source, 'SZ Munich');
    assert.equal(editions.get('sports')![0].source, 'SZ Sports');
    assert.equal(editions.get('culture')![0].source, 'SZ Culture');
    assert(editions.get('sports')![0].imageUrl === undefined, 'SZ feed image reuse stays disabled');
    const destinations = [
      { country_code: 'CA', country: 'Canada', city: 'Toronto', language: 'English' },
      { country_code: 'CG', country: 'Republic of the Congo', city: 'Brazzaville', language: 'French' },
      { country_code: 'BR', country: 'Brazil', city: 'Brasília', language: 'Portuguese' },
    ];
    for (const place of destinations) {
      const byCategory: Record<string, string[]> = {};
      global.fetch = (async (url: string | URL | Request) => {
        const value = String(url);
        if (!value.includes('news.google.com')) return new Response('', { status: 503 });
        const q = new URL(value).searchParams.get('q')!;
        const title = q.includes('broadcasting') ? `${place.country} radio stations expand their network`
          : q.includes('basketball') ? `${place.country} football team wins a tournament`
          : q.includes('festival') ? `${place.country} music festival opens`
          : `${place.city} opens a new public space`;
        // Publisher names must be attributed separately and must not leak into
        // the headline's topic classification (including a publisher named Radio).
        return new Response(`<rss><channel><item><title>${title} - Local Publisher</title><link>https://news.google.com/rss/articles/${place.country_code}-${title.includes('radio') ? 'radio' : title.includes('football') ? 'sports' : title.includes('music') ? 'culture' : 'local'}</link><source url="https://publisher.example">Local Publisher</source></item><item><title>Toronto approves a budget - Radio</title><link>https://news.google.com/rss/articles/wrong-topic</link><source>Radio</source></item></channel></rss>`);
      }) as typeof fetch;
      for (const category of ['local-pulse', 'culture', 'sports', 'radio-signal'] as BriefCategory[]) {
        const headlines = await getBriefHeadlines({ ...place, category, station_name: 'Universal fallback regression' });
        assert(headlines.length >= 1, `${place.country} ${category}`);
        assert(headlines.every((headline) => headline.source === 'Local Publisher' || (place.country_code === 'CA' && category === 'local-pulse' && headline.source === 'Radio')));
        assert(headlines.every((headline) => !headline.title.endsWith(' - Local Publisher')));
        if (category !== 'local-pulse') assert(headlines.every((headline) => !headline.title.includes('budget')));
        byCategory[category] = headlines.map((headline) => headline.title);
      }
      assert.equal(new Set(Object.values(byCategory).map((titles) => titles.join('|'))).size, 4);
    }
    console.log('Brief sections: native Munich city aliases, German topics, trusted section evidence, four distinct tabs, category feed isolation, no-GDELT fallback for multiple countries, publisher attribution, and image constraints passed');
  } finally { global.fetch = originalFetch; }
}
main().catch((error) => { console.error(error); process.exit(1); });
