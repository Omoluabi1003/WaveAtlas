// ISO identifiers belong to stations. GDELT uses FIPS identifiers or country
// names, so never pass an ISO code directly to sourcecountry (ES means El Salvador).
const ISO_CODES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK').split(' ');
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const countryNames = new Map(ISO_CODES.map((code) => [code, names.of(code) || code]));
countryNames.set('CG', 'Republic of the Congo');
countryNames.set('CD', 'Democratic Republic of the Congo');
const localizedNames = ['es', 'fr', 'pt', 'ja', 'zh', 'ar', 'de', 'it', 'ru', 'hi', 'ko', 'nl', 'tr', 'sw', 'id', 'ur'].map((locale) => new Intl.DisplayNames([locale], { type: 'region' }));

export function normalizeEditorialText(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
}
const countryNameIndex = new Map<string, string | undefined>();
for (const [code, name] of countryNames) {
  for (const label of [name, code, ...localizedNames.map((display) => display.of(code) || '')]) {
    const text = normalizeEditorialText(label);
    if (!text) continue;
    if (countryNameIndex.has(text) && countryNameIndex.get(text) !== code) countryNameIndex.set(text, undefined);
    else countryNameIndex.set(text, code);
  }
}
const countryTermsCache = new Map<string, string[]>();

const ALIASES: Record<string, string[]> = {
  ES: ['Spain', 'España', 'Spanish', 'español', 'española', 'Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Cataluña'],
  CA: ['Canada', 'Canadian', 'canadien', 'canadienne', 'Toronto', 'Ottawa', 'Montreal', 'Montréal', 'Vancouver', 'Québec', 'Ontario', 'Alberta'],
  NG: ['Nigeria', 'Nigerian', 'Lagos', 'Abuja', 'Ibadan', 'Kano', 'Port Harcourt'],
  CG: ['Republic of Congo', 'Republic of the Congo', 'Congo-Brazzaville', 'République du Congo', 'Brazzaville', 'Pointe-Noire'],
  CD: ['Democratic Republic of Congo', 'Democratic Republic of the Congo', 'Congo-Kinshasa', 'République démocratique du Congo', 'DR Congo', 'DRC', 'RDC', 'Kinshasa', 'Lubumbashi'],
  BR: ['Brazil', 'Brasil', 'Brazilian', 'brasileiro', 'brasileira', 'Brasília', 'São Paulo', 'Rio de Janeiro'],
  JP: ['Japan', 'Japanese', '日本', 'Tokyo', '東京', 'Osaka', '大阪', 'Kyoto', '京都'],
  IN: ['India', 'Indian', 'भारत', 'New Delhi', 'Mumbai', 'Delhi', 'Bengaluru'],
  US: ['United States', 'United States of America', 'U.S.', 'USA', 'American', 'Washington', 'New York', 'California'],
  GB: ['United Kingdom', 'Britain', 'British', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'UK'],
  AU: ['Australia', 'Australian', 'Sydney', 'Canberra', 'Melbourne'],
  FR: ['France', 'French', 'français', 'française', 'Paris', 'Marseille', 'Lyon'],
  DE: ['Germany', 'German', 'Deutschland', 'deutsch', 'deutsche', 'deutschen', 'Berlin', 'Munich', 'München', 'Münchner', 'Hamburg', 'Cologne', 'Köln', 'Frankfurt', 'Bayern', 'Bavaria', 'Bundesliga'],
  KR: ['South Korea', 'Republic of Korea'], KP: ['North Korea'],
  CI: ["Côte d'Ivoire", 'Ivory Coast'], TR: ['Turkey', 'Türkiye'],
};
// Explicit ambiguous-name overrides use the documented FIPS lookup.
const GDELT_COUNTRIES: Record<string, string> = {
  CG: 'CF', CD: 'CG', CZ: 'czechrepublic', KR: 'southkorea', KP: 'northkorea',
  CI: 'IV', TR: 'turkey', MM: 'myanmar', SZ: 'WZ', CV: 'capeverde',
  BS: 'bahamas', GM: 'gambia', VA: 'vaticancity', VN: 'VM', PS: 'WE',
};

export function resolveBriefCountry(input: { country?: string; country_code?: string }) {
  const code = input.country_code?.trim().toUpperCase().replace(/^UK$/, 'GB');
  if (code && countryNames.has(code)) return { code, name: countryNames.get(code)! };
  const text = normalizeEditorialText(input.country || '');
  if (!text || ['global', 'world', 'live radio'].includes(text)) return undefined;
  // Only country names, never cities or demonyms, can resolve a missing code.
  const indexed = countryNameIndex.get(text);
  if (indexed) return { code: indexed, name: countryNames.get(indexed)! };
  const alternateNames: Record<string, string> = { spain: 'ES', espana: 'ES', brasil: 'BR', congo: 'CG', 'republic of congo': 'CG', 'congo brazzaville': 'CG', 'dr congo': 'CD', 'drc': 'CD', 'congo kinshasa': 'CD', 'united states of america': 'US', usa: 'US', uk: 'GB', britain: 'GB', turkey: 'TR', 'ivory coast': 'CI', 'south korea': 'KR', 'north korea': 'KP' };
  const alternate = alternateNames[text];
  return alternate ? { code: alternate, name: countryNames.get(alternate)! } : undefined;
}

export function briefCountryTerms(input: { country?: string; country_code?: string }) {
  const country = resolveBriefCountry(input);
  if (!country) return [];
  const cached = countryTermsCache.get(country.code);
  if (cached) return cached;
  const localized = localizedNames.map((display) => display.of(country.code) || '').filter(Boolean);
  // Some locale tables call both Congos simply Congo. That is not evidence.
  const unambiguous = ['CG', 'CD'].includes(country.code) ? localized.filter((name) => {
    const text = normalizeEditorialText(name);
    const other = country.code === 'CG' ? 'CD' : 'CG';
    return text !== 'congo' && !localizedNames.some((display) => normalizeEditorialText(display.of(other) || '') === text);
  }) : localized;
  const terms = [...new Set([country.name, ...(ALIASES[country.code] || []), ...unambiguous])];
  countryTermsCache.set(country.code, terms);
  return terms;
}

export function gdeltSourceCountry(input: { country?: string; country_code?: string }) {
  const country = resolveBriefCountry(input);
  return country ? GDELT_COUNTRIES[country.code] || normalizeEditorialText(country.name).replace(/ /g, '') : undefined;
}

export function briefLanguage(value?: string) {
  const languages: Record<string, string> = { en: 'english', eng: 'english', es: 'spanish', spa: 'spanish', fr: 'french', fra: 'french', fre: 'french', pt: 'portuguese', por: 'portuguese', ja: 'japanese', jpn: 'japanese', de: 'german', deu: 'german', ger: 'german', hi: 'hindi', hin: 'hindi', zh: 'chinese', zho: 'chinese', ar: 'arabic', ara: 'arabic', ru: 'russian', rus: 'russian', it: 'italian', ita: 'italian', nl: 'dutch', nld: 'dutch', ko: 'korean', kor: 'korean' };
  const primary = value?.split(/[;,/]/)[0]?.trim().toLowerCase().split('-')[0];
  return primary && (languages[primary] || Object.values(languages).find((name) => name === primary));
}

const CITY_ALIASES: Record<string, string[][]> = {
  DE: [['Munich', 'München', 'Muenchen', 'Múnich', 'Münchner', 'Münchens'], ['Cologne', 'Köln', 'Koeln'], ['Nuremberg', 'Nürnberg', 'Nuernberg']],
  AT: [['Vienna', 'Wien']], IT: [['Rome', 'Roma'], ['Milan', 'Milano'], ['Florence', 'Firenze'], ['Turin', 'Torino']],
  ES: [['Seville', 'Sevilla']], PT: [['Lisbon', 'Lisboa']],
  JP: [['Tokyo', '東京'], ['Osaka', '大阪'], ['Kyoto', '京都']], CN: [['Beijing', '北京', 'Peking'], ['Shanghai', '上海']],
};

export function briefCityTerms(input: { city?: string; country?: string; country_code?: string }) {
  const city = input.city?.trim();
  if (!city) return [];
  const normalized = normalizeEditorialText(city);
  const country = resolveBriefCountry(input);
  const variants = CITY_ALIASES[country?.code || '']?.find((aliases) => aliases.some((alias) => normalizeEditorialText(alias) === normalized));
  return [...new Set([city, ...(variants || [])])];
}
