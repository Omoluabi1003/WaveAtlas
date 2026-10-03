import type { BriefCategory, BriefRequest, Headline } from './news-agent';
import type { NewsFeedScope } from './news-source-registry';

const TOPICS: Record<Exclude<BriefCategory, 'front-page'>, RegExp> = {
  'local-pulse': /\b(?:local|community|communities|councils?|municipal|neighbou?rhoods?|residents?|transport|traffic|schools?|housing|hospitals?|police|roads?|floods?|business(?:es)?|elections?)\b/i,
  culture: /\b(?:culture|cultural|music|musicians?|films?|cinema|arts?|artists?|festivals?|heritage|food|cuisine|fashion|theatre|theater|entertainment|museums?|exhibitions?|literature|books?|dance|opera)\b/i,
  sports: /\b(?:sports?|football|soccer|basketball|athletics|tennis|cricket|rugby|baseball|volleyball|olympics?|paralympics?|athletes?|tournaments?|world cup)\b/i,
  // AM/FM, media, presenter, and station alone do not establish radio relevance.
  'radio-signal': /\b(?:radio|airwaves|podcasts?|podcasting|radio-frequency|fm radio|am radio)\b/i,
};
const PLACE_ALIASES: Record<string, string[]> = {
  NG: ['Nigeria', 'Nigerian'], GB: ['United Kingdom', 'Britain', 'British', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'UK'],
  US: ['United States', 'American'], FR: ['France', 'French'], CA: ['Canada', 'Canadian'], AU: ['Australia', 'Australian'], IN: ['India', 'Indian'],
};
function normalize(value: string) { return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase(); }
export function hasEditorialPhrase(text: string, phrase: string) {
  const normalized = normalize(phrase);
  return Boolean(normalized && ` ${normalize(text)} `.includes(` ${normalized} `));
}
export function headlineMatchesBrief(headline: Headline, input: BriefRequest, scope?: NewsFeedScope): boolean {
  const category = input.category ?? 'front-page';
  if (category === 'front-page') return true;
  const text = `${headline.title} ${headline.summary ?? ''}`;
  const normalizedText = normalize(text);
  const stationName = input.station_name?.trim() ?? '';
  const topicMatches = TOPICS[category].test(normalizedText) || (category === 'radio-signal' && stationName.length >= 4 && hasEditorialPhrase(text, stationName));
  if (!topicMatches) return false;
  // Request-context city/country fields are not evidence about the article itself.
  const city = input.city?.trim();
  const country = input.country?.trim();
  const hasCity = city && city.toLowerCase() !== country?.toLowerCase() && !['world', 'global'].includes(city.toLowerCase());
  if (scope === 'city' && hasCity) return true;
  if (category === 'local-pulse' && hasCity) return hasEditorialPhrase(text, city);
  const places = [hasCity ? city : undefined, country, ...(PLACE_ALIASES[input.country_code?.toUpperCase() ?? ''] ?? [])].filter((value): value is string => Boolean(value && !['world', 'global'].includes(value.toLowerCase())));
  return places.some((place) => hasEditorialPhrase(text, place));
}
