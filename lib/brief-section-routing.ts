import type { BriefCategory, BriefRequest } from './news-agent';
import type { NewsSourceRegistryEntry } from './news-source-registry';
import { briefCity } from './brief-editorial';
import { briefCityTerms, briefCountryTerms, briefLanguage, normalizeEditorialText, resolveBriefCountry } from './brief-geography';

const TERMS: Record<string, Partial<Record<BriefCategory, string[]>>> = {
  english: { culture: ['culture', 'music', 'arts', 'film', 'festival', 'museum'], sports: ['sports', 'football', 'soccer', 'basketball', 'tennis', 'cricket'], 'radio-signal': ['radio', 'broadcasting', 'podcast', 'airwaves'] },
  german: { culture: ['Kultur', 'Musik', 'Kunst', 'Kino', 'Oper', 'Ausstellung'], sports: ['Sport', 'Fußball', 'Bundesliga', 'Handball', 'Eishockey'], 'radio-signal': ['Radio', 'Rundfunk', 'Hörfunk', 'Radiosender'] },
  french: { culture: ['culture', 'musique', 'cinéma', 'arts', 'festival'], sports: ['sport', 'football', 'athlétisme', 'tennis'], 'radio-signal': ['radio', 'radiodiffusion', 'podcast'] },
  spanish: { culture: ['cultura', 'música', 'cine', 'arte', 'festival'], sports: ['deportes', 'fútbol', 'baloncesto', 'tenis'], 'radio-signal': ['radio', 'emisora', 'radiodifusión'] },
  portuguese: { culture: ['cultura', 'música', 'cinema', 'arte'], sports: ['esportes', 'futebol', 'basquete', 'tênis'], 'radio-signal': ['rádio', 'radiodifusão', 'podcast'] },
  japanese: { culture: ['文化', '音楽', '映画', '美術'], sports: ['スポーツ', 'サッカー', '野球'], 'radio-signal': ['ラジオ', '放送', 'ポッドキャスト'] },
};

// Sanitized quoted phrases preserve native spelling for RSS search, and prevent
// a city or station label from injecting search operators.
function quote(value: string) { return `"${value.replace(/["\\\r\n]/g, ' ').trim().slice(0, 100)}"`; }
function any(terms: string[]) {
  const unique = [...new Map(terms.filter(Boolean).map((term) => [normalizeEditorialText(term), term])).values()];
  return unique.length > 1 ? `(${unique.map(quote).join(' OR ')})` : unique[0] ? quote(unique[0]) : '';
}

export function briefTopicQuery(input: BriefRequest, nativeLanguage?: string) {
  const category = input.category || 'front-page';
  if (category === 'front-page') return '';
  // City relevance defines Local Pulse; a local headline need not say "local".
  if (category === 'local-pulse') return briefCity(input) ? '' : '(community OR council OR housing OR transport OR schools)';
  const language = briefLanguage(nativeLanguage || input.language);
  const station = category === 'radio-signal' && input.station_name ? [input.station_name] : [];
  return any([...(TERMS.english[category] || []), ...(TERMS[language || '']?.[category] || []), ...station]);
}

export function briefPlaceQuery(input: BriefRequest) {
  const city = briefCity(input);
  if (input.category === 'local-pulse' && city) return any(briefCityTerms(input));
  return any([...briefCountryTerms(input).slice(0, 9), ...(city ? briefCityTerms(input) : [])]);
}

// Google News RSS provides a keyless category/destination fallback. Countries
// without a supported local edition use an edition whose language is supported;
// the explicit geographic query and response filtering still control relevance.
const EDITIONS: Record<string, [string, string]> = {
  DE: ['DE', 'de'], AT: ['AT', 'de'], CH: ['CH', 'de'], ES: ['ES', 'es'], MX: ['MX', 'es'],
  FR: ['FR', 'fr'], CA: ['CA', 'en'], US: ['US', 'en'], GB: ['GB', 'en'], AU: ['AU', 'en'],
  NG: ['NG', 'en'], IN: ['IN', 'en'], BR: ['BR', 'pt-BR'], JP: ['JP', 'ja'], IT: ['IT', 'it'],
  NL: ['NL', 'nl'], PT: ['PT', 'pt-PT'], ZA: ['ZA', 'en'], KE: ['KE', 'en'], NZ: ['NZ', 'en'],
};
export function sectionSearchSource(input: BriefRequest, nativeLanguage?: string): NewsSourceRegistryEntry | undefined {
  const country = resolveBriefCountry(input);
  if (!country || !input.category || input.category === 'front-page') return undefined;
  const language = briefLanguage(nativeLanguage || input.language);
  const [region, locale] = EDITIONS[country.code] || (language === 'french' ? ['FR', 'fr'] : language === 'spanish' ? ['ES', 'es'] : ['US', 'en']);
  const query = [briefPlaceQuery(input), briefTopicQuery(input, nativeLanguage), 'when:7d'].filter(Boolean).join(' ');
  const params = new URLSearchParams({ q: query, hl: locale, gl: region, ceid: `${region}:${locale}` });
  return { country_code: 'GLOBAL', country: 'Global', language: language || 'English', feeds: [{
    name: 'Google News', url: `https://news.google.com/rss/search?${params}`, scope: 'global', trusted: false, aggregated: true, includeImages: false,
  }] };
}
