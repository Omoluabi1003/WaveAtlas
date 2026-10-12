import { stationCardVisualText } from '../lib/station-card-text';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { countryMetadata } from '../lib/country-metadata';
import countries from '../lib/country-metadata-data.json';
import { cardNameLines, stationCardDetails, stationSocialMetadata } from '../lib/station-social-metadata';
import { stationShareMessage, stationSharePayload } from '../lib/station-deep-link';
import { fallbackStations } from '../lib/stations';
import StationImage from '../app/station/[stationId]/opengraph-image';

async function main() {
  for (const country of countries) {
    const metadata = countryMetadata({ country_code: country.code.toLowerCase() });
    assert.equal(metadata?.code, country.code);
    assert.ok(existsSync(`public${metadata!.flagPath}`));
  }
  for (const [fields, code] of [[{ countryCode: 'JP' }, 'JP'], [{ countryName: 'Nigeria' }, 'NG'], [{ country: 'Republic of Congo' }, 'CG'], [{ country: 'Congo, The Democratic Republic of the' }, 'CD'], [{ country: 'Côte d’Ivoire' }, 'CI'], [{ isoCountryCode: 'jpn' }, 'JP']] as const) assert.equal(countryMetadata(fields)?.code, code);
  assert.equal(countryMetadata({ country_code: 'ZZ', country: 'Global' }), null);
  assert.equal(countryMetadata({ countryCode: 'JP', country: 'Nigeria' })?.code, 'JP');
  const station = { ...fallbackStations[0], id: 'jp-id', station_uuid: 'jp-id', name: '羊飼いラジオ Hitsujikai Radio', country_code: 'JP', country: 'Japan', city: undefined, state: undefined };
  const message = `Listen to ${station.name} on WaveAtlas.\n\nhttps://wave-atlas.vercel.app/station/jp-id`;
  assert.equal(stationShareMessage(station), message);
  assert.equal(stationSharePayload(station).text, message);
  const metadata = stationSocialMetadata(station);
  assert.deepEqual(metadata.title, { absolute: `${station.name} | WaveAtlas` });
  assert.equal(metadata.description, `Listen to ${station.name} from Japan on WaveAtlas. Explore humanity through sound.`);
  assert.equal(metadata.alternates?.canonical, 'https://wave-atlas.vercel.app/station/jp-id');
  assert.equal(stationCardDetails(station).frequency, undefined);
  assert.equal(stationCardDetails({ ...station, name: 'Radio 93.5 FM' }).frequency, '93.5 FM');
  for (const name of ['A long station name '.repeat(30), '羊飼いラジオ'.repeat(40), 'Ọ̀yọ́ & L’Écho', 'راديو القاهرة']) {
    const size = stationCardDetails({ ...station, name }).fontSize;
    assert.ok(cardNameLines(name, size).length <= 4);
  }
  const neutral = stationSocialMetadata({ ...station, country: '', country_code: '' });
  assert.equal(neutral.description, `Listen to ${station.name} on WaveAtlas. Explore humanity through sound.`);
  // Direct image rendering exercises bundled fonts and the actual server response.
  const response = await StationImage({ params: Promise.resolve({ stationId: 'ariyo-ai-premier-935-fm-ibadan' }) });
  assert.equal(response.headers.get('content-type'), 'image/png');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
  assert.equal(stationCardVisualText(station.name), station.name);
  assert.notEqual(stationCardVisualText('راديو القاهرة'), 'راديو القاهرة');
  assert.deepEqual(cardNameLines('羊飼いラジオ Hitsujikai Radio', 64), ['羊飼いラジオ', 'Hitsujikai Radio']);
  const realFetch = globalThis.fetch;
  try {
    for (const [id, name, country, code] of [
      ['jp', station.name, 'Japan', 'JP'],
      ['ng', 'Ọ̀yọ́ & L’Écho — Radio Yorùbá 93.5 FM', 'Nigeria', 'NG'],
      ['cg', 'Radio Liberté Brazzaville', 'Republic of Congo', 'CG'],
      ['ar', 'راديو القاهرة — صوت العالم', 'Egypt', 'EG'],
      ['long', 'International Community Radio for Arts Culture Independent Music and Stories from Every Corner of the World — Écoutez Ensemble', 'France', 'FR'],
      ['neutral', 'The Global Listening Room', '', ''],
    ]) {
      globalThis.fetch = async (input, options) => !String(input).includes('/stations/byuuid/') ? realFetch(input, options) : Response.json([{ stationuuid: `preview-${id}`, name, country, countrycode: code, url: 'https://radio.test/live', state: '', tags: '', language: 'English', lastcheckok: 1 }]);
      const card = await StationImage({ params: Promise.resolve({ stationId: `preview-${id}` }) });
      const png = Buffer.from(await card.arrayBuffer());
      assert.equal(png.readUInt32BE(16), 1200);
      assert.equal(png.readUInt32BE(20), 630);
    }
  } finally { globalThis.fetch = realFetch; }
  console.log('Station social preview: all 249 ISO countries, flags, Unicode messages, metadata, long names, neutral fallback and 1200x630 rendering passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
