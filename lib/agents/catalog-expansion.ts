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

export function completedExpansionIsReusable(result: unknown, stations: Array<{station_uuid:string;url:string;url_resolved?:string}>, now = Date.now()): boolean {
  if (!result || typeof result !== 'object') return false;
  const report = result as {targetMet?:unknown;target?:unknown;added?:unknown;evidence?:unknown};
  if (report.targetMet !== true || report.target !== EXPANSION_TARGET || typeof report.added !== 'number' || report.added < EXPANSION_TARGET || !Array.isArray(report.evidence) || report.evidence.length !== report.added) return false;
  const identities = new Map(stations.map(station=>[station.station_uuid,station.url_resolved||station.url]));
  const seenIds = new Set<string>(),seenEndpoints = new Set<string>();
  return report.evidence.every(row=>{
    if (!row || typeof row.stationId !== 'string' || typeof row.resolvedUrl !== 'string' || identities.get(row.stationId) !== row.resolvedUrl || !row.resolvedUrl.startsWith('https://') || temporaryStreamUrl(row.resolvedUrl) || seenIds.has(row.stationId) || seenEndpoints.has(row.resolvedUrl)) return false;
    const age = now - Date.parse(row.checkedAt);
    if (!Number.isFinite(age) || age < -300000 || age > 48*3600000 || row.browserDecoder?.ok !== true || !(row.browserDecoder.seconds >= 0.15) || !(row.bytesSampled > 0)) return false;
    seenIds.add(row.stationId);seenEndpoints.add(row.resolvedUrl);return true;
  });
}

const TEMPORARY_PARAMETERS = /^(zt|token|access_token|auth|expires?|exp|signature|policy|hdnts|hdnea|x-amz-.+|x-goog-.+)$/i;
export function temporaryStreamUrl(value: string) {
  try { return [...new URL(value).searchParams.keys()].some(key=>TEMPORARY_PARAMETERS.test(key)); } catch { return true; }
}
export function stableStreamEndpoint(input: string, resolved: string): string | undefined {
  try {
    if(new URL(input).protocol!=='https:'||new URL(resolved).protocol!=='https:'||temporaryStreamUrl(input))return;
    return temporaryStreamUrl(resolved)?input:resolved;
  }catch{return;}
}
export function endpointIdentity(value: string): string {
  try {
    const url=new URL(value);url.hash='';
    for(const key of [...url.searchParams.keys()])if(TEMPORARY_PARAMETERS.test(key)||/^\d{10,}$/.test(key)||/^(utm_.+|cachebust|_)$/i.test(key))url.searchParams.delete(key);
    if(/^(stream(?:-\d+)?\.(?:zeno\.fm|zenolive\.com|surfernetwork\.com))$/i.test(url.hostname))url.hostname='stream.zeno.fm';
    if(url.hostname==='go.webgateready.com')url.pathname=url.pathname.replace(/\/radio\.mp3$/,'');
    return url.href.replace(/\/$/,'');
  }catch{return '';}
}
export function stationAliasKeys(country: string, name: string) {
  const semantic=(value:string)=>candidateNameKey(value).replace(/\b(fm|am|radio|station|sports|live|online)\b/g,' ').replace(/\s+/g,' ').trim();
  const frequency=/\b(\d{2,3}[.,]\d{1,2})\b/.exec(name);
  const full=`${country}:name:${semantic(name)}`;
  const brand=semantic(frequency?name.slice(0,frequency.index):name);
  const brandKey=`${country}:brand:${brand}`;
  const broadcast=frequency&&brand?`${country}:broadcast:${brand}:${frequency[1].replace(',','.')}`:undefined;
  return { match:[full,...(broadcast?[broadcast]:brand?[brandKey]:[])], record:[full,...(broadcast?[broadcast]:[]),...(brand?[brandKey]:[])] };
}
export function directoryGeographyConflict(country:string, name:string, homepage?:string) {
  // These directory categories have produced fictional/unrelated locations; require separate official review.
  if(['AQ','CC','CX','AS'].includes(country))return true;
  if(country==='NG'&&/\b(uganda|kenya|ghana|south africa|london|jamaica)\b/i.test(name))return true;
  try {
    const suffix=new URL(homepage||'').hostname.split('.').at(-1)?.toUpperCase();
    const explicit=['NG','UG','KE','GH','ZA','ZW','ZM','TZ','RW','ET','EG','DZ','TN','MA','AO','MZ','SN','CM'];
    if(suffix&&explicit.includes(suffix)&&suffix!==country)return true;
  }catch{/* Homepage admission handles malformed values. */}
  return false;
}
