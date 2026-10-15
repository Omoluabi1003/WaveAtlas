import type { RadioBrowserCandidate } from '../radio-discovery';

export const EXPANSION_TARGET = 350;
export const NIGERIA_PRIORITY = 'NG';
export function candidateNameKey(name: string) {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function roundRobinCandidates(groups: RadioBrowserCandidate[][]): RadioBrowserCandidate[] {
  const result: RadioBrowserCandidate[] = [];
  for (let index = 0; index < Math.max(0, ...groups.map(group => group.length)); index++) {
    for (const group of groups) if (group[index]) result.push(group[index]);
  }
  return result;
}
export function countryOrder(countries: string[], coverage: Map<string, number>): string[] {
  const africa = ['NG','GH','KE','ZA','UG','TZ','RW','CM','SN','CI','CG','CD','BJ','TG','ZM','ZW','MW','BW','NA','ET','MA','DZ','TN','EG','AO','MZ','MG','MU'];
  return [...new Set([...africa.filter(code => countries.includes(code)), ...countries.sort((a,b) => (coverage.get(a)??0)-(coverage.get(b)??0)||a.localeCompare(b))])];
}
export function expansionAdmission(input: { country: string; target: number; added: number; countryAdded: number; endpoint: string; sourceUuid: string; hasHomepage: boolean; browserDecoded: boolean }): string | undefined {
  if (input.added >= input.target) return 'target_reached';
  if (input.countryAdded >= (input.country === NIGERIA_PRIORITY ? 120 : 20)) return 'country_cap';
  if (!/^[A-Z]{2}$/.test(input.country)) return 'country_unknown';
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(input.sourceUuid)) return 'missing_source_identity';
  try {
    const url = new URL(input.endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) return 'https_required';
  } catch { return 'invalid_endpoint'; }
  if (!input.hasHomepage) return 'missing_broadcaster_homepage';
  if (!input.browserDecoded) return 'browser_decoder_unverified';
}
