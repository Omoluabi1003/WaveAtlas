import countries from './country-metadata-data.json';

type CountryFields = { countryCode?: string; country_code?: string; isoCountryCode?: string; country?: string; countryName?: string };
export type CountryMetadata = { code: string; name: string; flagPath: string };
const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
const normalize = (value: string) => value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const byCode = new Map(countries.map(country => [country.code, country]));
const byName = new Map<string, string>();
for (const country of countries) {
  for (const name of [...country.names, displayNames.of(country.code) || '', country.alpha3]) byName.set(normalize(name), country.code);
}
for (const [name, code] of Object.entries({ 'Republic of Congo': 'CG', 'Republic of the Congo': 'CG', 'Congo Brazzaville': 'CG', 'Congo Kinshasa': 'CD', 'DR Congo': 'CD', 'UK': 'GB', 'United States of America': 'US', 'South Korea': 'KR', 'North Korea': 'KP', 'Ivory Coast': 'CI', 'Russia': 'RU', 'Vietnam': 'VN', 'Taiwan': 'TW' })) byName.set(normalize(name), code);

export function countryMetadata(fields: CountryFields): CountryMetadata | null {
  for (const value of [fields.countryCode, fields.country_code, fields.isoCountryCode, fields.country, fields.countryName]) {
    if (!value?.trim()) continue;
    const upper = value.trim().toUpperCase();
    const code = byCode.has(upper) ? upper : byName.get(normalize(value));
    if (code) return { code, name: displayNames.of(code) || byCode.get(code)!.names[0], flagPath: `/flags/${code.toLowerCase()}.svg` };
  }
  return null;
}
