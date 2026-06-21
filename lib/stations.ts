import { culturalAtlasScore } from './cultural-atlas';
import { ariyoSeedStations } from './stations/ariyoSeedStations';

export type Station = { id:string; station_uuid:string; name:string; normalized_name?:string; url:string; url_resolved?:string; homepage?:string; favicon?:string; country:string; country_code:string; state?:string; city?:string; language:string; tags:string[]; codec:string; bitrate:number; latitude?:number; longitude?:number; votes:number; click_count:number; health_score:number; is_active:boolean; last_check_ok?:boolean; last_checked_at:string; failure_count:number; response_time_ms:number; curation_source?: string; curation_tier?: 'curated_atlas' | 'radio_browser' | 'community_signal'; validation_status?: 'candidate' | 'needs_review' | 'verified' | 'rejected' | 'curated' | 'failed' | 'unknown'; validation_reason?: string; };

export type CountryResult = { name:string; code:string; flag:string; centroid:{ lat:number; lng:number }; station_count:number };

type RadioBrowserStation = Partial<Record<'stationuuid'|'name'|'url_resolved'|'url'|'homepage'|'favicon'|'country'|'countrycode'|'state'|'language'|'tags'|'codec', string>> & { bitrate?: number; geo_lat?: number; geo_long?: number; votes?: number; clickcount?: number; lastcheckok?: number; lastchecktime_iso8601?: string; clicktrend?: number };
type RadioBrowserCountry = { name?: string; iso_3166_1?: string; stationcount?: number };

const API_BASE = process.env.RADIO_BROWSER_API_BASE ?? 'https://de1.api.radio-browser.info/json';
const UA = 'WaveAtlas/1.0 (global-radio-discovery)';
const cache = new Map<string, { expires:number; value: unknown }>();

const countryCentroids: Record<string, { lat:number; lng:number }> = {
  NG:{lat:9.082,lng:8.6753}, DE:{lat:51.1657,lng:10.4515}, GH:{lat:7.9465,lng:-1.0232}, FR:{lat:46.2276,lng:2.2137}, AE:{lat:23.4241,lng:53.8478}, US:{lat:39.8283,lng:-98.5795}, BR:{lat:-14.235,lng:-51.9253}, GB:{lat:55.3781,lng:-3.436}, JP:{lat:36.2048,lng:138.2529}, ZA:{lat:-30.5595,lng:22.9375}, CA:{lat:56.1304,lng:-106.3468}, IN:{lat:20.5937,lng:78.9629}, AU:{lat:-25.2744,lng:133.7751}, MX:{lat:23.6345,lng:-102.5528}, ES:{lat:40.4637,lng:-3.7492}, IT:{lat:41.8719,lng:12.5674}, CN:{lat:35.8617,lng:104.1954}, KR:{lat:35.9078,lng:127.7669}, ID:{lat:-0.7893,lng:113.9213}, PH:{lat:12.8797,lng:121.774}, TH:{lat:15.87,lng:100.9925}, MY:{lat:4.2105,lng:101.9758}, SG:{lat:1.3521,lng:103.8198}, SA:{lat:23.8859,lng:45.0792}, QA:{lat:25.3548,lng:51.1839}, IL:{lat:31.0461,lng:34.8516}, TR:{lat:38.9637,lng:35.2433}, NZ:{lat:-40.9006,lng:174.886}, FJ:{lat:-17.7134,lng:178.065}, PG:{lat:-6.315,lng:143.9555}, KE:{lat:-0.0236,lng:37.9062}, EG:{lat:26.8206,lng:30.8025}, MA:{lat:31.7917,lng:-7.0926}, TZ:{lat:-6.369,lng:34.8888}, UG:{lat:1.3733,lng:32.2903}, CM:{lat:7.3697,lng:12.3547}, SN:{lat:14.4974,lng:-14.4524}, NL:{lat:52.1326,lng:5.2913}, SE:{lat:60.1282,lng:18.6435}, NO:{lat:60.472,lng:8.4689}, IE:{lat:53.1424,lng:-7.6921}, CH:{lat:46.8182,lng:8.2275}, BE:{lat:50.5039,lng:4.4699}, PT:{lat:39.3999,lng:-8.2245}, AR:{lat:-38.4161,lng:-63.6167}, CL:{lat:-35.6751,lng:-71.543}, CO:{lat:4.5709,lng:-74.2973}, PE:{lat:-9.19,lng:-75.0152}
};
export const countryAliases: Record<string, string> = { dubai:'AE', uae:'AE', 'united arab emirates':'AE', emirates:'AE', america:'US', usa:'US', 'united states':'US', uk:'GB', britain:'GB', england:'GB', 'united kingdom':'GB', germany:'DE', nigeria:'NG', ghana:'GH', france:'FR', brazil:'BR', japan:'JP', china:'CN', india:'IN', korea:'KR', 'south korea':'KR', indonesia:'ID', philippines:'PH', thailand:'TH', malaysia:'MY', singapore:'SG', 'saudi arabia':'SA', israel:'IL', australia:'AU', 'new zealand':'NZ', fiji:'FJ', 'papua new guinea':'PG', canada:'CA', mexico:'MX', italy:'IT', spain:'ES', netherlands:'NL', sweden:'SE', norway:'NO', ireland:'IE', switzerland:'CH', kenya:'KE', egypt:'EG', morocco:'MA', tanzania:'TZ', uganda:'UG', cameroon:'CM', senegal:'SN', argentina:'AR', chile:'CL', colombia:'CO', peru:'PE' };

function cleanStationName(name = 'Unknown station', country = '') {
  const cleaned = name
    .replace(/[\s_-]+/g, ' ')
    .replace(/([•|/\\~])+$/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Unknown station';
  const withoutDuplicateCountry = country
    ? cleaned.replace(new RegExp(`\\s*(?:-|–|—|,|\\|)?\\s*${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim()
    : cleaned;
  return withoutDuplicateCountry || cleaned;
}

function normalizedStationName(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

const fallbackStations: Station[] = [
  { id:'bbc-world-service', station_uuid:'bbc-world-service', name:'BBC World Service', url:'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', homepage:'https://www.bbc.co.uk/worldserviceradio', favicon:'', country:'United Kingdom', country_code:'GB', state:'London', language:'English', tags:['news','talk','international'], codec:'MP3', bitrate:96, latitude:51.5072, longitude:-0.1276, votes:42000, click_count:120000, health_score:96, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:160 },
  { id:'npr-news', station_uuid:'npr-news', name:'NPR News', url:'https://npr-ice.streamguys1.com/live.mp3', homepage:'https://www.npr.org', favicon:'', country:'United States', country_code:'US', state:'Washington', language:'English', tags:['news','public radio','talk'], codec:'MP3', bitrate:128, latitude:38.9072, longitude:-77.0369, votes:39000, click_count:110000, health_score:94, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:190 },
  { id:'france-info', station_uuid:'france-info', name:'France Info', url:'https://icecast.radiofrance.fr/franceinfo-midfi.mp3', homepage:'https://www.francetvinfo.fr', favicon:'', country:'France', country_code:'FR', state:'Paris', language:'French', tags:['news','talk'], codec:'MP3', bitrate:128, latitude:48.8566, longitude:2.3522, votes:36000, click_count:98000, health_score:95, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:175 },
  { id:'cool-fm-lagos', station_uuid:'cool-fm-lagos', name:'Cool FM Lagos', url:'https://stream.coolwazobiainfo.com/coolfm-lagos', homepage:'https://www.coolfm.ng', favicon:'', country:'Nigeria', country_code:'NG', state:'Lagos', language:'English', tags:['music','afrobeats','talk'], codec:'MP3', bitrate:96, latitude:6.5244, longitude:3.3792, votes:22000, click_count:76000, health_score:90, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:240 },
  { id:'wazobia-fm-lagos', station_uuid:'wazobia-fm-lagos', name:'Wazobia FM Lagos', url:'https://stream.coolwazobiainfo.com/wazobia-lagos', homepage:'https://www.wazobiafm.com', favicon:'', country:'Nigeria', country_code:'NG', state:'Lagos', language:'Pidgin', tags:['talk','local','afrobeats'], codec:'MP3', bitrate:96, latitude:6.5244, longitude:3.3792, votes:21000, click_count:72000, health_score:89, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:245 },
  { id:'arise-news-radio', station_uuid:'arise-news-radio', name:'Arise News Radio', url:'https://stream.zeno.fm/arisenews', homepage:'https://www.arise.tv', favicon:'', country:'Nigeria', country_code:'NG', state:'Lagos', language:'English', tags:['news','business','africa'], codec:'MP3', bitrate:96, latitude:6.5244, longitude:3.3792, votes:18000, click_count:62000, health_score:88, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:260 },
  { id:'mangoradio', station_uuid:'mangoradio', name:'MANGORADIO', url:'https://stream.zeno.fm/mangoradio', homepage:'', favicon:'', country:'Global', country_code:'US', state:'New York', language:'English', tags:['music','global','pop'], codec:'MP3', bitrate:128, latitude:40.7128, longitude:-74.006, votes:12000, click_count:43000, health_score:86, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:220 },
  { id:'fip-paris', station_uuid:'fip-paris', name:'FIP', url:'https://icecast.radiofrance.fr/fip-midfi.mp3', homepage:'https://www.radiofrance.fr/fip', favicon:'', country:'France', country_code:'FR', state:'Paris', language:'French', tags:['jazz','world','eclectic'], codec:'MP3', bitrate:128, latitude:48.8566, longitude:2.3522, votes:26000, click_count:82000, health_score:96, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:180 },
  { id:'tokyo-fm', station_uuid:'tokyo-fm', name:'Tokyo FM', url:'https://playerservices.streamtheworld.com/api/livestream-redirect/TOKYOFM.mp3', homepage:'https://www.tfm.co.jp', favicon:'', country:'Japan', country_code:'JP', state:'Tokyo', language:'Japanese', tags:['j-pop','talk','local'], codec:'MP3', bitrate:128, latitude:35.6762, longitude:139.6503, votes:24000, click_count:70000, health_score:90, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:210 },
  { id:'abc-radio-sydney', station_uuid:'abc-radio-sydney', name:'ABC Radio Sydney', url:'https://live-radio01.mediahubaustralia.com/2LRW/mp3/', homepage:'https://www.abc.net.au/sydney', favicon:'', country:'Australia', country_code:'AU', state:'Sydney', language:'English', tags:['news','talk','local'], codec:'MP3', bitrate:96, latitude:-33.8688, longitude:151.2093, votes:23000, click_count:69000, health_score:91, is_active:true, last_checked_at:new Date().toISOString(), failure_count:0, response_time_ms:220 }
];

export function flagFor(code = '') { return code.length === 2 ? String.fromCodePoint(...code.toUpperCase().split('').map((c)=>127397+c.charCodeAt(0))) : '🌐'; }
async function cached<T>(key:string, ttlMs:number, fn:()=>Promise<T>): Promise<T> { const hit=cache.get(key); if(hit && hit.expires>Date.now()) return hit.value as T; const value=await fn(); cache.set(key,{value,expires:Date.now()+ttlMs}); return value; }
function normalize(s: RadioBrowserStation): Station { const ok = s.lastcheckok !== 0; const bitrate = s.bitrate ?? 0; const votes = s.votes ?? 0; const click_count = s.clickcount ?? 0; const health_score = Math.min(99, Math.max(35, (ok ? 72 : 42) + Math.min(18, bitrate/16) + Math.min(9, votes/1200))); const name = cleanStationName(s.name, s.country); return { id:s.stationuuid ?? crypto.randomUUID(), station_uuid:s.stationuuid ?? '', name, normalized_name: normalizedStationName(name), url:s.url_resolved || s.url || '', url_resolved:s.url_resolved, homepage:s.homepage, favicon:s.favicon, country:s.country ?? 'Global', country_code:(s.countrycode ?? 'UN').toUpperCase(), state:s.state, language:s.language ?? 'Unknown', tags:(s.tags ?? '').split(',').map(t=>t.trim()).filter(Boolean).slice(0,8), codec:s.codec ?? 'Unknown', bitrate, latitude:s.geo_lat, longitude:s.geo_long, votes, click_count, health_score:Math.round(health_score), is_active:ok, last_checked_at:s.lastchecktime_iso8601 ?? new Date().toISOString(), failure_count:ok ? 0 : 1, response_time_ms:180 + Math.round(Math.random()*420), last_check_ok: ok }; }
export function sortStations(a:Station,b:Station){ return Number(b.is_active)-Number(a.is_active) || b.votes-a.votes || b.click_count-a.click_count || b.bitrate-a.bitrate; }
export function isCuratedStation(station: Station) { return station.curation_tier === 'curated_atlas' || station.tags.some((tag) => ['ariyo-ai-seed', 'waveatlas-curated', 'curators-picks'].includes(tag.toLowerCase())); }
function isAriyoSeed(station: Station) { return station.tags.some((tag) => tag.toLowerCase() === 'ariyo-ai-seed'); }
function stationUrlKey(station: Station) { return (station.url_resolved || station.url || '').trim().toLowerCase(); }
function stationNameKey(station: Station) { return normalizedStationName(station.name); }
export function isStationAvailable(station: Station) { return Boolean(station.url && (/^https?:\/\//i.test(station.url) || isCuratedStation(station)) && (isCuratedStation(station) || (station.is_active && station.failure_count < 3))); }
export function logCuratedStationDiagnostic(station: Station, reason: string, context = 'curated-atlas') { if (isCuratedStation(station) && process.env.NODE_ENV !== 'production') console.info(`[WaveAtlas curated diagnostic] ${context}: ${station.name} (${station.url || 'missing-url'}) [${station.curation_source ?? 'curated'}] -> ${reason}`); }
function matchesAriyoPriorityIntent(station: Station, rawQuery = '') { const haystack = `${station.name} ${station.country} ${station.country_code} ${station.city ?? ''} ${station.state ?? ''} ${station.language} ${station.tags.join(' ')}`.toLowerCase(); const q = rawQuery.trim().toLowerCase(); if (!isAriyoSeed(station)) return false; if (!q) return false; return ['nigeria','nigerian','nigerian radio','lagos','ibadan','jos','oyo','plateau','yoruba','africa','african','afrobeats','pidgin','gospel','talk','news','agidigbo','jay'].some((term) => q.includes(term) || haystack.includes(q) && haystack.includes(term)); }
export function mergeSeedStations(stations: Station[], seeds: Station[] = ariyoSeedStations) { const merged: Station[] = []; const seenUrls = new Set<string>(); const seenNames = new Set<string>(); for (const station of [...seeds, ...stations]) { const urlKey = stationUrlKey(station); const nameKey = stationNameKey(station); if (!urlKey) { logCuratedStationDiagnostic(station, 'excluded: missing stream URL', 'mergeSeedStations'); continue; } if (seenUrls.has(urlKey) || seenNames.has(nameKey)) { logCuratedStationDiagnostic(station, 'excluded: duplicate suppressed; curated metadata wins when duplicate is Radio Browser', 'mergeSeedStations'); continue; } seenUrls.add(urlKey); seenNames.add(nameKey); merged.push(isCuratedStation(station) ? { ...station, is_active: true, failure_count: 0, last_check_ok: station.last_check_ok ?? true, validation_status: station.validation_status === 'failed' ? 'needs_review' : station.validation_status } : station); } return merged; }
function rankStation(station: Station, rawQuery = '') { const q = rawQuery.trim().toLowerCase(); const name = station.name.toLowerCase(); let score = 0; if (q) { const tokens = q.split(/\s+/).filter((token) => token.length > 2); if (name === q) score += 10000; else if (name.startsWith(q)) score += 7000; else if (name.includes(q)) score += 4500; score += tokens.filter((token) => name.includes(token)).length * 2200; if (tokens[0] && name.includes(tokens[0])) score += 5000; if (`${station.country} ${station.country_code} ${station.language} ${station.tags.join(' ')}`.toLowerCase().includes(q)) score += 900; score += culturalAtlasScore(station, rawQuery); } score += station.is_active ? 1800 : -2000; score += Math.min(1400, station.votes * 1.5); score += Math.min(1200, station.click_count / 4); score += station.bitrate > 0 ? Math.min(800, station.bitrate * 2) : 0; score += station.codec && station.codec !== 'Unknown' ? 350 : 0; score += station.url ? 250 : 0; if (isCuratedStation(station)) score += 1800; if (station.country_code === 'NG' && isCuratedStation(station)) score += 2600; if (matchesAriyoPriorityIntent(station, rawQuery)) score += 9000; return score; }
export function rankStations(stations: Station[], q = '') { return [...stations].sort((a,b)=>rankStation(b,q)-rankStation(a,q) || sortStations(a,b)); }

const candidateContinentSeeds = [
  { continent: 'Africa', codes: ['NG', 'GH', 'ZA', 'KE', 'EG', 'MA', 'SN'] },
  { continent: 'Europe', codes: ['GB', 'FR', 'DE', 'NL', 'ES', 'IT', 'SE'] },
  { continent: 'Asia', codes: ['JP', 'IN', 'SG', 'KR', 'ID', 'PH', 'AE'] },
  { continent: 'Oceania', codes: ['AU', 'NZ', 'FJ', 'PG'] },
  { continent: 'North America', codes: ['US', 'CA', 'MX'] },
  { continent: 'South America', codes: ['BR', 'AR', 'CL', 'CO', 'PE'] },
];

export async function fetchGlobalCandidateStations(limitPerContinent = 4): Promise<Station[]> {
  const groups = await Promise.all(candidateContinentSeeds.map(async (group) => {
    const stations = (await Promise.all(group.codes.map((countryCode) => fetchStationsByCountry({ countryCode, limit: String(limitPerContinent * 3) }).catch(() => [])))).flat();
    const fallback = fallbackStations.filter((station) => group.codes.includes(station.country_code));
    const seeded = ariyoSeedStations.filter((station) => group.codes.includes(station.country_code));
    return { continent: group.continent, stations: rankStations(mergeSeedStations([...stations, ...fallback], seeded), group.continent).slice(0, limitPerContinent) };
  }));
  const seen = new Set<string>();
  const interleaved: Station[] = [];
  for (let i = 0; i < limitPerContinent; i += 1) {
    for (const group of groups) {
      const station = group.stations[i];
      const key = station?.station_uuid || station?.id;
      if (station?.url && key && !seen.has(key)) {
        seen.add(key);
        interleaved.push(station);
      }
    }
  }
  return interleaved;
}

function seedMatchesParams(station: Station, params: Record<string,string|undefined> = {}) { const query = (params.name || params.q || '').trim().toLowerCase(); const countryCode = params.countryCode?.toUpperCase(); const country = params.country?.trim().toLowerCase(); const language = params.language?.trim().toLowerCase(); const tag = params.tag?.trim().toLowerCase(); const haystack = `${station.name} ${station.country} ${station.country_code} ${station.city ?? ''} ${station.state ?? ''} ${station.language} ${station.tags.join(' ')}`.toLowerCase(); if (countryCode && station.country_code !== countryCode) return false; if (country && station.country.toLowerCase() !== country && station.country_code.toLowerCase() !== country && !haystack.includes(country)) return false; if (language && !station.language.toLowerCase().includes(language)) return false; if (tag && !station.tags.some((item) => item.toLowerCase().includes(tag) || tag.includes(item.toLowerCase()))) return false; return !query || haystack.includes(query) || query.split(/\s+/).some((token) => token.length > 2 && haystack.includes(token)); }
export async function fetchStations(params: Record<string,string|undefined> = {}): Promise<Station[]> { const limit=params.limit ?? '50'; const offset=params.offset ?? '0'; const allowFallback = params.allowFallback === 'true'; const query = new URLSearchParams({ hidebroken:'true', limit, offset, order: params.order ?? 'votes', reverse:'true' }); if(params.country) query.set('country', params.country); if(params.countryCode) query.set('countrycode', params.countryCode.toUpperCase()); if(params.language) query.set('language', params.language); if(params.tag) query.set('tag', params.tag); if(params.name || params.q) query.set('name', params.name || params.q || ''); return cached(`stations:${query.toString()}`, 5*60_000, async()=>{ try { const res = await fetch(`${API_BASE}/stations/search?${query}`, { headers:{ 'User-Agent': UA }, next:{ revalidate: 300 } }); if(!res.ok) throw new Error(`Radio Browser ${res.status}`); const data = await res.json() as RadioBrowserStation[]; const stations = data.map(normalize).filter(s=>s.url && /^https?:\/\//i.test(s.url)).sort(sortStations); const seeded = ariyoSeedStations.filter((station) => seedMatchesParams(station, params)); const merged = mergeSeedStations(stations, seeded); return merged.length ? rankStations(merged, params.name || params.q || params.tag || params.country || params.countryCode) : (allowFallback ? rankStations(mergeSeedStations(fallbackStations, seeded), params.name || params.q) : []); } catch { const seeded = ariyoSeedStations.filter((station) => seedMatchesParams(station, params)); return allowFallback || seeded.length ? rankStations(mergeSeedStations(allowFallback ? fallbackStations : [], seeded), params.name || params.q || params.tag || params.country || params.countryCode) : []; } }); }

export async function fetchStationsByCountry(params: Record<string,string|undefined> = {}) { const code=params.countryCode?.toUpperCase() || countryAliases[(params.country || '').toLowerCase()]; const limit=params.limit ?? '50'; const offset=params.offset ?? '0'; const base = code ? `/stations/bycountrycodeexact/${encodeURIComponent(code)}` : `/stations/bycountry/${encodeURIComponent(params.country ?? '')}`; const query = new URLSearchParams({ hidebroken:'true', limit, offset, order:'votes', reverse:'true' }); if(params.tag) query.set('tag', params.tag); if(params.language) query.set('language', params.language); return cached(`country:${base}:${query.toString()}`, 5*60_000, async()=>{ try { const res=await fetch(`${API_BASE}${base}?${query}`, { headers:{ 'User-Agent': UA }, next:{ revalidate: 300 } }); if(!res.ok) throw new Error(`Radio Browser ${res.status}`); const data=await res.json() as RadioBrowserStation[]; const stations = data.map(normalize).filter(s=>s.url && /^https?:\/\//i.test(s.url) && (!code || s.country_code === code)).sort(sortStations); const seeded = ariyoSeedStations.filter((station) => seedMatchesParams(station, { ...params, countryCode: code })); return rankStations(mergeSeedStations(stations, seeded), params.tag || params.language || params.country || params.countryCode); } catch { return rankStations(ariyoSeedStations.filter((station) => seedMatchesParams(station, { ...params, countryCode: code })), params.tag || params.language || params.country || params.countryCode); } }); }

export async function searchCountries(q = ''): Promise<CountryResult[]> { const query=q.trim().toLowerCase(); return cached(`countries:${query}`, 60*60_000, async()=>{ try { const res=await fetch(`${API_BASE}/countries`, { headers:{ 'User-Agent': UA }, next:{ revalidate: 3600 } }); if(!res.ok) throw new Error(`Radio Browser ${res.status}`); const data=await res.json() as RadioBrowserCountry[]; return data.filter(c=>c.name && c.iso_3166_1).map(c=>({ name:c.name!, code:c.iso_3166_1!.toUpperCase(), flag:flagFor(c.iso_3166_1), centroid:countryCentroids[c.iso_3166_1!.toUpperCase()] ?? {lat:20,lng:0}, station_count:c.stationcount ?? 0 })).filter(c=>!query || c.name.toLowerCase().includes(query) || c.code.toLowerCase()===query || countryAliases[query]===c.code).sort((a,b)=>b.station_count-a.station_count).slice(0,12); } catch { return Object.entries(countryAliases).filter(([name])=>!query || name.includes(query)).map(([name,code])=>({ name:name.replace(/\b\w/g,m=>m.toUpperCase()), code, flag:flagFor(code), centroid:countryCentroids[code] ?? {lat:20,lng:0}, station_count:0 })).slice(0,8); } }); }


export async function resolveCountryIntent(raw = '') {
  const q = raw.trim().toLowerCase();
  if (!q) return undefined;
  if (/^[a-z]{2}$/i.test(q)) {
    const countries = await searchCountries(q);
    return countries.find((c) => c.code.toLowerCase() === q);
  }
  const alias = countryAliases[q];
  if (alias) {
    const countries = await searchCountries(alias);
    return countries.find((c) => c.code === alias) ?? { name: q.replace(/\b\w/g, (m) => m.toUpperCase()), code: alias, flag: flagFor(alias), centroid: countryCentroids[alias] ?? { lat:20, lng:0 }, station_count:0 };
  }
  const countries = await searchCountries(q);
  return countries.find((c) => c.name.toLowerCase() === q || c.code.toLowerCase() === q);
}

export async function fetchStationsForCountryIntent(countryName: string, countryCode: string, params: Record<string,string|undefined> = {}) {
  const limit = params.limit ?? '50';
  const offset = params.offset ?? '0';
  const code = countryCode.toUpperCase();
  const primary = await fetchStationsByCountry({ ...params, country: countryName, countryCode: code, limit, offset });
  return rankStations(primary.filter((station) => station.country_code === code), params.name || params.q || params.tag || params.language || countryName || code);
}

export async function validateStream(url: string, options: { curated?: boolean } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), options.curated ? 16000 : 8000);
  const uncertain = (reason: string, contentType = 'unknown') => ({ is_active: Boolean(options.curated), health_score: options.curated ? 55 : 10, response_time_ms: Date.now()-started, failure_count: options.curated ? 0 : 1, content_type: contentType, last_checked_at:new Date().toISOString(), validation_status: options.curated ? 'needs_review' as const : 'failed' as const, validation_reason: reason });
  try {
    if(!/^https?:\/\//i.test(url)) throw new Error('Unsafe stream URL');
    let res: Response | undefined;
    let headError: unknown;
    try { res = await fetch(url, { method:'HEAD', signal:controller.signal, redirect:'follow' }); } catch (error) { headError = error; }
    if (!res?.ok) {
      try { res = await fetch(url, { method:'GET', signal:controller.signal, redirect:'follow', headers: { Range: 'bytes=0-2048' } }); } catch (error) { if (!options.curated) throw error; return uncertain(`HEAD failed${headError ? ' and GET retry failed' : ''}`); }
    }
    const type = res.headers.get('content-type') ?? '';
    const extensionPlayable = /\.(mp3|aac|ogg|m3u8?|pls)(?:[?#]|$)/i.test(url);
    const typePlayable = /(audio|mpeg|ogg|aac|mp3|mpegurl|x-mpegurl|x-scpls|octet-stream)/i.test(type);
    const playable = Boolean(res.ok && (typePlayable || extensionPlayable || (options.curated && !type)));
    if (!playable && options.curated) return uncertain(`Uncertain content-type: ${type || 'missing'}`, type);
    return { is_active: playable, health_score: playable ? 90 : 35, response_time_ms: Date.now()-started, failure_count: playable ? 0 : 1, content_type:type, last_checked_at:new Date().toISOString(), validation_status: playable ? 'verified' as const : 'failed' as const, validation_reason: playable ? 'Stream accepted by validation.' : `Unsupported content-type: ${type || 'missing'}` };
  } catch (error) {
    return uncertain(error instanceof Error ? error.message : 'Validation failed');
  } finally { clearTimeout(timer); }
}


function supabaseReadConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url: url.replace(/\/$/, ''), key } : undefined;
}

function stationFromDatabase(row: Record<string, unknown>): Station {
  const name = cleanStationName(String(row.name ?? 'Unknown station'), String(row.country ?? 'Global'));
  const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
  return {
    id: String(row.id ?? row.station_uuid),
    station_uuid: String(row.station_uuid),
    name,
    normalized_name: String(row.normalized_name ?? normalizedStationName(name)),
    url: String(row.url_resolved || row.url || ''),
    url_resolved: row.url_resolved ? String(row.url_resolved) : undefined,
    homepage: row.homepage ? String(row.homepage) : undefined,
    favicon: row.favicon ? String(row.favicon) : undefined,
    country: String(row.country ?? 'Global'),
    country_code: String(row.country_code ?? 'UN').toUpperCase(),
    state: row.state ? String(row.state) : undefined,
    city: row.city ? String(row.city) : undefined,
    language: String(row.language ?? 'Unknown'),
    tags,
    codec: String(row.codec ?? 'Unknown'),
    bitrate: Number(row.bitrate ?? 0),
    latitude: row.latitude == null ? undefined : Number(row.latitude),
    longitude: row.longitude == null ? undefined : Number(row.longitude),
    votes: Number(row.votes ?? 0),
    click_count: Number(row.click_count ?? 0),
    health_score: Number(row.health_score ?? 0),
    is_active: Boolean(row.is_active ?? true),
    last_check_ok: Boolean(row.last_check_ok ?? row.is_active ?? true),
    last_checked_at: String(row.last_checked_at ?? new Date().toISOString()),
    failure_count: Number(row.failure_count ?? 0),
    response_time_ms: Number(row.response_time_ms ?? 0),
  };
}

export async function fetchStationByUuid(stationUuid: string): Promise<Station | null> {
  const uuid = stationUuid.trim();
  if (!uuid) return null;
  const config = supabaseReadConfig();
  if (config) {
    const select = 'id,station_uuid,name,normalized_name,url,url_resolved,homepage,favicon,country,country_code,city,state,language,tags,codec,bitrate,latitude,longitude,votes,click_count,health_score,is_active,last_check_ok,last_checked_at,failure_count,response_time_ms';
    const res = await fetch(`${config.url}/rest/v1/stations?select=${select}&station_uuid=eq.${encodeURIComponent(uuid)}&limit=1`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, next: { revalidate: 60 } });
    if (res.ok) {
      const rows = (await res.json()) as Record<string, unknown>[];
      if (rows[0]) return stationFromDatabase(rows[0]);
    }
  }
  try {
    const rb = await fetch(`${API_BASE}/stations/byuuid/${encodeURIComponent(uuid)}`, { headers: { 'User-Agent': UA }, next: { revalidate: 300 } });
    if (rb.ok) {
      const rows = (await rb.json()) as RadioBrowserStation[];
      const exact = rows.find((row) => row.stationuuid === uuid);
      if (exact) return normalize(exact);
    }
  } catch {
    // Deep links must fail closed instead of substituting a different station.
  }
  return ariyoSeedStations.find((station) => station.station_uuid === uuid) ?? fallbackStations.find((station) => station.station_uuid === uuid) ?? null;
}

export { ariyoSeedStations, fallbackStations };
export function discoverIntent(query: string) { const q = query.toLowerCase(); const tags = ['gospel','jazz','news','talk','afrobeats','classical','reggae','sports','local','music']; return { country: Object.keys(countryAliases).find(c=>q.includes(c)), countryCode: Object.entries(countryAliases).find(([name])=>q.includes(name))?.[1], tag: tags.find(t=>q.includes(t)), language: q.includes('french')?'french':q.includes('english')?'english':undefined } as Record<string,string|undefined>; }
