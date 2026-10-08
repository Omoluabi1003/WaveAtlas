import type { BriefCategory, BriefRequest, Headline } from './news-agent';
import type { NewsFeedScope } from './news-source-registry';
import { briefCityTerms, briefCountryTerms, normalizeEditorialText, resolveBriefCountry } from './brief-geography';

const TOPICS: Record<Exclude<BriefCategory, 'front-page'>, RegExp> = {
  'local-pulse': /\b(?:local|community|communities|councils?|municipal|neighbou?rhoods?|residents?|transport|traffic|schools?|housing|hospitals?|police|roads?|floods?|business(?:es)?|elections?)\b/i,
  culture: /\b(?:culture|cultural|music|musicians?|films?|cinema|arts?|artists?|festivals?|heritage|food|cuisine|fashion|theatre|theater|entertainment|museums?|exhibitions?|literature|books?|dance|opera)\b/i,
  sports: /\b(?:sports?|football|soccer|basketball|athletics|tennis|cricket|rugby|baseball|volleyball|olympics?|paralympics?|athletes?|tournaments?|world cup)\b/i,
  // AM/FM, media, presenter, and station alone do not establish radio relevance.
  'radio-signal': /\b(?:radio|airwaves|podcasts?|podcasting|radio-frequency|fm radio|am radio)\b/i,
};
const LOCALIZED_TOPICS: Record<Exclude<BriefCategory, 'front-page'>, RegExp> = {
  'local-pulse': /\b(?:municipal|conseil|communaute|logement|ecoles?|routes?|inondations?|vivienda|vecinos|ayuntamiento|transporte|escuelas?|moradia|transito|escolas?|enchentes?)\b|住宅|交通|学校|洪水|नगर|सड़क/i,
  culture: /\b(?:musique|cinema|festival(?:es|s)?|patrimoine|musee|musica|pelicula|cultura|arte|artes|livros?|danse|danca)\b|文化|音楽|映画|祭り|संगीत|संस्कृति/i,
  sports: /\b(?:futbol|deportes?|baloncesto|futebol|esportes?|olimpiadas?|athletisme|championnat|tenis|torneio)\b|スポーツ|サッカー|野球|खेल|क्रिकेट/i,
  'radio-signal': /\b(?:radiodiffusion|webradio|radiophonique|emisora|radiodifusao)\b|ラジオ|रेडियो/i,
};
const GERMAN_TOPICS: Record<Exclude<BriefCategory, 'front-page'>, RegExp> = {
  'local-pulse': /\b(?:stadt|stadtrat|rathaus|burger|verkehr|wohnen|wohnung|schulen?|polizei|gemeinde|kommunal|nachbarschaft)\b/i,
  culture: /\b(?:kultur\w*|musik\w*|konzert\w*|theater|oper|opern\w*|museum|museen|ausstellung\w*|literatur|kunst\w*|kino|ballett|orchester)\b/i,
  sports: /\b(?:sport\w*|fu(?:ss|ß)ball|bundesliga|handball|eishockey|leichtathletik|weltmeisterschaft|meisterschaft|dfb|fc bayern|borussia|nationalmannschaft)\b/i,
  'radio-signal': /\b(?:radio\w*|rundfunk\w*|horfunk|hoerfunk|sendefrequenz\w*|radioprogramm\w*|podcast\w*)\b/i,
};
export function hasEditorialPhrase(text: string, phrase: string) {
  const normalized = normalizeEditorialText(phrase);
  // Scripts without word spaces require substring matching.
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalized)) return normalizeEditorialText(text).includes(normalized);
  return Boolean(normalized && ` ${normalizeEditorialText(text)} `.includes(` ${normalized} `));
}
export type BriefGeographicEvidence = { domesticCountryCode?: string; feedCity?: string; topics?: BriefCategory[] };

export function headlineMatchesCity(headline: Headline, input: BriefRequest) {
  return Boolean(briefCity(input) && briefCityTerms(input).some((city) => hasEditorialPhrase(`${headline.title} ${headline.summary || ''}`, city)));
}

export function briefCity(input: BriefRequest) {
  const city = input.city?.trim();
  const normalized = normalizeEditorialText(city || '');
  const country = resolveBriefCountry(input);
  return city && !['world', 'global', 'live radio', 'congo', country?.code.toLowerCase(), normalizeEditorialText(input.country || ''), normalizeEditorialText(country?.name || '')].includes(normalized) ? city : undefined;
}

export function headlineMatchesBrief(headline: Headline, input: BriefRequest, scope?: NewsFeedScope, evidence?: BriefGeographicEvidence): boolean {
  const category = input.category ?? 'front-page';
  const text = `${headline.title} ${headline.summary ?? ''}`;
  const normalizedText = normalizeEditorialText(text);
  const stationName = input.station_name?.trim() ?? '';
  const city = briefCity(input);
  const topicMatches = category === 'front-page' || (category === 'local-pulse' && Boolean(city)) || evidence?.topics?.includes(category) || TOPICS[category].test(normalizedText) || LOCALIZED_TOPICS[category].test(normalizedText) || GERMAN_TOPICS[category].test(normalizedText) || (category === 'radio-signal' && stationName.length >= 4 && hasEditorialPhrase(text, stationName));
  if (!topicMatches) return false;
  // Publisher location and request-context fields do not establish article geography.
  // Only explicitly domestic RSS sections can establish implicit domestic relevance.
  const country = resolveBriefCountry(input);
  if (!country) return false;
  const cityTerms = city ? briefCityTerms(input) : [];
  if (scope === 'city' && city && evidence?.domesticCountryCode === country.code && evidence.feedCity && cityTerms.some((term) => hasEditorialPhrase(evidence.feedCity!, term))) return true;
  if (category === 'local-pulse' && city) return cityTerms.some((term) => hasEditorialPhrase(scope === 'global' ? headline.title : text, term));
  if (scope === 'country' && evidence?.domesticCountryCode === country.code) return true;
  // A passing reference in a world-feed summary should not turn an unrelated
  // international headline into a destination story.
  const geographicText = scope === 'global' || scope === 'regional' ? headline.title : text;
  return [...cityTerms, ...briefCountryTerms(input)].some((place) => hasEditorialPhrase(geographicText, place));
}
