import { culturalAtlasScore } from './cultural-atlas';
import { ariyoSeedStations } from './stations/ariyoSeedStations';
import { campusAtlasDiagnostics, campusAtlasStations } from './stations/campusAtlasStations';
import { ariyoGeoAudioChannels } from './geoaudio';
import { ChannelType, liveRadioCapabilities, type Channel, type ChannelCapabilities } from './channel-framework';

export type Station = { id:string; station_uuid:string; name:string; normalized_name?:string; url:string; url_resolved?:string; homepage?:string; favicon?:string; country:string; country_code:string; state?:string; city?:string; language:string; tags:string[]; codec:string; bitrate:number; latitude?:number; longitude?:number; votes:number; click_count:number; health_score:number; is_active:boolean; last_check_ok?:boolean; last_checked_at:string; failure_count:number; response_time_ms:number; curation_source?: string; curation_tier?: 'curated_atlas' | 'radio_browser' | 'community_signal'; validation_status?: 'candidate' | 'needs_review' | 'verified' | 'rejected' | 'curated' | 'failed' | 'unknown'; validation_reason?: string; sourceType?: 'radio' | 'geoaudio'; channelType?: ChannelType; channel?: Channel; capabilities?: ChannelCapabilities; geoAudio?: { albumTitle: string; artist: string; provider: string; producer: string; studio: string; coverArtUrl?: string; trackCount?: number; queueId?: string; queueLabel?: string; highlightedQueueItemId?: string; currentJourneyId?: string; currentTrackId?: string; currentTrackTitle?: string; trackIndex?: number; nextTrackId?: string; queueLength?: number; tracks: { title: string; url: string; duration?: string }[] }; };

export type CountryResult = { name:string; code:string; flag:string; centroid:{ lat:number; lng:number }; station_count:number };

type RadioBrowserStation = Partial<Record<'stationuuid'|'name'|'url_resolved'|'url'|'homepage'|'favicon'|'country'|'countrycode'|'state'|'language'|'tags'|'codec', string>> & { bitrate?: number; geo_lat?: number; geo_long?: number; votes?: number; clickcount?: number; lastcheckok?: number; lastchecktime_iso8601?: string; clicktrend?: number; clicktimestamp_iso8601?: string };
type StationDiscoveryDiagnostics = { fetchedCount: number; curatedCount: number; filteredCount: number; returnedCount: number; filterReasons: Record<string, number> };

const RADIO_BROWSER_PAGE_SIZE = 500;
const GLOBAL_CACHED_PAGES = 6;
const COUNTRY_PAGE_SIZE = 500;
const STATION_CACHE_TTL_MS = 10 * 60_000;
type RadioBrowserCountry = { name?: string; iso_3166_1?: string; stationcount?: number };
export type StationInventoryStats = { globalCount: number; countryCounts: Record<string, number>; source: 'radio-browser' | 'curated-fallback'; updatedAt: string };
const INVENTORY_STATS_CACHE_TTL_MS = 6 * 60 * 60_000;

const API_BASE = process.env.RADIO_BROWSER_API_BASE ?? 'https://de1.api.radio-browser.info/json';
const UA = 'WaveAtlas/1.0 (global-radio-discovery)';
const cache = new Map<string, { expires:number; value: unknown }>();
function discoveryDiagnostics(label: string, diagnostics: StationDiscoveryDiagnostics) { if (process.env.NODE_ENV !== 'production') console.info(`[WaveAtlas station discovery] ${label}`, diagnostics); }
function campusAtlasDiscoveryDiagnostics() { if (process.env.NODE_ENV !== 'production') console.info('[WaveAtlas station discovery] campus-atlas import', campusAtlasDiagnostics); }
function incrementReason(reasons: Record<string, number>, reason: string) { reasons[reason] = (reasons[reason] ?? 0) + 1; }

const countryCentroids: Record<string, { lat:number; lng:number }> = {
  NG:{lat:9.082,lng:8.6753}, DE:{lat:51.1657,lng:10.4515}, GH:{lat:7.9465,lng:-1.0232}, FR:{lat:46.2276,lng:2.2137}, AE:{lat:23.4241,lng:53.8478}, US:{lat:39.8283,lng:-98.5795}, BR:{lat:-14.235,lng:-51.9253}, GB:{lat:55.3781,lng:-3.436}, JP:{lat:36.2048,lng:138.2529}, ZA:{lat:-30.5595,lng:22.9375}, CA:{lat:56.1304,lng:-106.3468}, IN:{lat:20.5937,lng:78.9629}, AU:{lat:-25.2744,lng:133.7751}, MX:{lat:23.6345,lng:-102.5528}, ES:{lat:40.4637,lng:-3.7492}, IT:{lat:41.8719,lng:12.5674}, CN:{lat:35.8617,lng:104.1954}, KR:{lat:35.9078,lng:127.7669}, ID:{lat:-0.7893,lng:113.9213}, PH:{lat:12.8797,lng:121.774}, TH:{lat:15.87,lng:100.9925}, MY:{lat:4.2105,lng:101.9758}, SG:{lat:1.3521,lng:103.8198}, SA:{lat:23.8859,lng:45.0792}, QA:{lat:25.3548,lng:51.1839}, IL:{lat:31.0461,lng:34.8516}, TR:{lat:38.9637,lng:35.2433}, NZ:{lat:-40.9006,lng:174.886}, FJ:{lat:-17.7134,lng:178.065}, PG:{lat:-6.315,lng:143.9555}, KE:{lat:-0.0236,lng:37.9062}, EG:{lat:26.8206,lng:30.8025}, MA:{lat:31.7917,lng:-7.0926}, TZ:{lat:-6.369,lng:34.8888}, UG:{lat:1.3733,lng:32.2903}, CM:{lat:7.3697,lng:12.3547}, SN:{lat:14.4974,lng:-14.4524}, NL:{lat:52.1326,lng:5.2913}, SE:{lat:60.1282,lng:18.6435}, NO:{lat:60.472,lng:8.4689}, IE:{lat:53.1424,lng:-7.6921}, CH:{lat:46.8182,lng:8.2275}, BE:{lat:50.5039,lng:4.4699}, PT:{lat:39.3999,lng:-8.2245}, AR:{lat:-38.4161,lng:-63.6167}, CL:{lat:-35.6751,lng:-71.543}, CO:{lat:4.5709,lng:-74.2973}, PE:{lat:-9.19,lng:-75.0152}
};
export const countryAliases: Record<string, string> = { 'united states of america':'US', 'u.s.':'US', 'u.s.a.':'US', 'us':'US', 'great britain':'GB', scotland:'GB', wales:'GB', 'northern ireland':'GB', 'cote d\'ivoire':'CI', 'côte d’ivoire':'CI', 'ivory coast':'CI', 'republic of korea':'KR', 'south korea':'KR', 'north korea':'KP', russia:'RU', 'russian federation':'RU', vietnam:'VN', 'viet nam':'VN', bolivia:'BO', 'cape verde':'CV', 'cabo verde':'CV', czechia:'CZ', 'czech republic':'CZ', dubai:'AE', uae:'AE', 'united arab emirates':'AE', emirates:'AE', america:'US', usa:'US', 'united states':'US', uk:'GB', britain:'GB', england:'GB', 'united kingdom':'GB', germany:'DE', nigeria:'NG', ghana:'GH', france:'FR', brazil:'BR', japan:'JP', china:'CN', india:'IN', korea:'KR', indonesia:'ID', philippines:'PH', thailand:'TH', malaysia:'MY', singapore:'SG', 'saudi arabia':'SA', israel:'IL', australia:'AU', 'new zealand':'NZ', fiji:'FJ', 'papua new guinea':'PG', canada:'CA', mexico:'MX', italy:'IT', spain:'ES', netherlands:'NL', sweden:'SE', norway:'NO', ireland:'IE', switzerland:'CH', kenya:'KE', egypt:'EG', morocco:'MA', tanzania:'TZ', uganda:'UG', cameroon:'CM', senegal:'SN', argentina:'AR', chile:'CL', colombia:'CO', peru:'PE' };

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


function curatedInventoryCountryCounts() {
  const counts: Record<string, number> = {};
  for (const station of mergeSeedStations(fallbackStations, [...ariyoSeedStations, ...campusAtlasStations])) {
    const code = station.country_code?.toUpperCase();
    if (!code || code === 'UN') continue;
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

export async function getStationInventoryStats(): Promise<StationInventoryStats> {
  return cached('station-inventory-stats:v1', INVENTORY_STATS_CACHE_TTL_MS, async () => {
    const fallbackCounts = curatedInventoryCountryCounts();
    try {
      const res = await fetch(`${API_BASE}/countries`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000), next: { revalidate: INVENTORY_STATS_CACHE_TTL_MS / 1000 } });
      if (!res.ok) throw new Error(`Radio Browser ${res.status}`);
      const data = await res.json() as RadioBrowserCountry[];
      const countryCounts = data.reduce<Record<string, number>>((counts, country) => {
        const code = country.iso_3166_1?.toUpperCase();
        const stationCount = Number(country.stationcount ?? 0);
        if (code && Number.isFinite(stationCount) && stationCount > 0) counts[code] = Math.max(stationCount, fallbackCounts[code] ?? 0);
        return counts;
      }, { ...fallbackCounts });
      const globalCount = Object.values(countryCounts).reduce((sum, count) => sum + count, 0);
      if (globalCount <= 0) throw new Error('Radio Browser returned no station inventory counts');
      return { globalCount, countryCounts, source: 'radio-browser', updatedAt: new Date().toISOString() };
    } catch {
      return { globalCount: Object.values(fallbackCounts).reduce((sum, count) => sum + count, 0), countryCounts: fallbackCounts, source: 'curated-fallback', updatedAt: new Date().toISOString() };
    }
  });
}

export async function getCountryStationCount(countryCode: string): Promise<number | undefined> {
  const code = countryCode.trim().toUpperCase();
  if (!code) return undefined;
  const stats = await getStationInventoryStats();
  return stats.countryCounts[code];
}

export function flagFor(code = '') { return code.length === 2 ? String.fromCodePoint(...code.toUpperCase().split('').map((c)=>127397+c.charCodeAt(0))) : '🌐'; }
async function cached<T>(key:string, ttlMs:number, fn:()=>Promise<T>): Promise<T> { const hit=cache.get(key); if(hit && hit.expires>Date.now()) return hit.value as T; const value=await fn(); cache.set(key,{value,expires:Date.now()+ttlMs}); return value; }
function normalize(s: RadioBrowserStation): Station { const ok = s.lastcheckok !== 0; const bitrate = s.bitrate ?? 0; const votes = s.votes ?? 0; const click_count = s.clickcount ?? 0; const health_score = Math.min(99, Math.max(35, (ok ? 72 : 42) + Math.min(18, bitrate/16) + Math.min(9, votes/1200))); const name = cleanStationName(s.name, s.country); return { id:s.stationuuid ?? crypto.randomUUID(), station_uuid:s.stationuuid ?? '', name, normalized_name: normalizedStationName(name), url:s.url_resolved || s.url || '', url_resolved:s.url_resolved, homepage:s.homepage, favicon:s.favicon, country:s.country ?? 'Global', country_code:(s.countrycode ?? 'UN').toUpperCase(), state:s.state, language:s.language ?? 'Unknown', tags:(s.tags ?? '').split(',').map(t=>t.trim()).filter(Boolean).slice(0,8), codec:s.codec ?? 'Unknown', bitrate, latitude:s.geo_lat, longitude:s.geo_long, votes, click_count, health_score:Math.round(health_score), is_active:ok, last_checked_at:s.lastchecktime_iso8601 ?? new Date().toISOString(), failure_count:ok ? 0 : 1, response_time_ms:180 + Math.round(Math.random()*420), last_check_ok: ok, sourceType: 'radio', channelType: ChannelType.LIVE_RADIO, capabilities: liveRadioCapabilities }; }
export function sortStations(a:Station,b:Station){ return Number(b.is_active)-Number(a.is_active) || b.votes-a.votes || b.click_count-a.click_count || b.bitrate-a.bitrate; }
export function isCuratedStation(station: Station) { return station.curation_tier === 'curated_atlas' || station.tags.some((tag) => ['ariyo-ai-seed', 'waveatlas-curated', 'curators-picks', 'campus atlas', 'geoaudio'].includes(tag.toLowerCase())); }
export function isVerifiedNigerianStation(station: Station) {
  const tags = station.tags.map((tag) => tag.toLowerCase());
  return station.country_code === 'NG' && (
    isCuratedStation(station) ||
    station.validation_status === 'verified' ||
    station.validation_status === 'curated' ||
    station.curation_tier === 'curated_atlas' ||
    tags.some((tag) => ['ariyo-ai-seed', 'waveatlas-curated', 'curators-picks', 'verified'].includes(tag))
  );
}
function isGeoAudioStation(station: Station) { return station.sourceType === 'geoaudio'; }
const staticGeoAudioIntentTerms = ['omoluabi productions', 'ariyo ai studio', 'geoaudio', 'geo audio'];
function geoAudioCatalogTerms() { return ariyoGeoAudioChannels.flatMap((channel) => [channel.geoAudio?.albumTitle, ...(channel.geoAudio?.tracks.map((track) => track.title) ?? [])]).filter((term): term is string => Boolean(term?.trim())).map((term) => term.toLowerCase()); }
export function matchesGeoAudioIntent(rawQuery = '') { const q = rawQuery.trim().toLowerCase(); if (!q) return false; return [...staticGeoAudioIntentTerms, ...geoAudioCatalogTerms()].some((term) => q.includes(term) || term.includes(q)); }
export function highlightGeoAudioSearchMatches(station: Station, rawQuery = '') { const q = rawQuery.trim().toLowerCase(); if (station.sourceType !== 'geoaudio' || !q || !station.geoAudio) return station; const match = station.geoAudio.tracks.find((track) => track.title.toLowerCase().includes(q) || q.includes(track.title.toLowerCase())); if (!match) return station; const index = station.geoAudio.tracks.indexOf(match); return { ...station, geoAudio: { ...station.geoAudio, highlightedQueueItemId: `${station.station_uuid}-track-${index + 1}` } }; }
function geoAudioSeedsForParams(params: Record<string,string|undefined> = {}) { const intent = params.includeGeoAudio === 'true' || matchesGeoAudioIntent(params.name || params.q || params.tag || ''); const query = params.name || params.q || params.tag || ''; return intent ? ariyoGeoAudioChannels.filter((station) => station.is_active && seedMatchesParams(station, params)).map((station) => highlightGeoAudioSearchMatches(station, query)) : []; }
function nonGeoAudioSeeds() { return [...ariyoSeedStations, ...campusAtlasStations]; }
function isAriyoSeed(station: Station) { return station.tags.some((tag) => tag.toLowerCase() === 'ariyo-ai-seed'); }
function isCampusAtlas(station: Station) { return station.curation_source === 'campus-atlas' || station.tags.some((tag) => tag.toLowerCase() === 'campus atlas'); }
function stationUrlKey(station: Station) { return station.sourceType === 'geoaudio' ? station.station_uuid : (station.url_resolved || station.url || '').trim().toLowerCase(); }
function stationNameKey(station: Station) { return normalizedStationName(station.name); }
export function isStationAvailable(station: Station) { return Boolean(station.url && (/^https?:\/\//i.test(station.url) || isCuratedStation(station))); }
export function logCuratedStationDiagnostic(station: Station, reason: string, context = 'curated-atlas') { if (isCuratedStation(station) && process.env.NODE_ENV !== 'production') console.info(`[WaveAtlas curated diagnostic] ${context}: ${station.name} (${station.url || 'missing-url'}) [${station.curation_source ?? 'curated'}] -> ${reason}`); }
function matchesCampusAtlasIntent(station: Station, rawQuery = '') { const haystack = `${station.name} ${station.country} ${station.country_code} ${station.city ?? ''} ${station.state ?? ''} ${station.language} ${station.tags.join(' ')}`.toLowerCase(); const q = rawQuery.trim().toLowerCase(); if (!isCampusAtlas(station) || !q) return false; return ['college','university','campus','student radio','public radio','jazz','indie','freeform','alternative','npr','california','new york','massachusetts','georgia','indiana','texas','missouri','oregon','minnesota','wisconsin','pennsylvania','ohio','vermont','louisiana'].some((term) => q.includes(term) || haystack.includes(q) && haystack.includes(term)); }
function matchesAriyoPriorityIntent(station: Station, rawQuery = '') { const haystack = `${station.name} ${station.country} ${station.country_code} ${station.city ?? ''} ${station.state ?? ''} ${station.language} ${station.tags.join(' ')}`.toLowerCase(); const q = rawQuery.trim().toLowerCase(); if (!isAriyoSeed(station)) return false; if (!q) return false; return ['nigeria','nigerian','nigerian radio','lagos','ibadan','jos','oyo','plateau','yoruba','africa','african','afrobeats','pidgin','gospel','talk','news','agidigbo','jay'].some((term) => q.includes(term) || haystack.includes(q) && haystack.includes(term)); }
export function mergeSeedStations(stations: Station[], seeds: Station[] = [...ariyoSeedStations, ...campusAtlasStations]) { const merged: Station[] = []; const seenUrls = new Set<string>(); const seenNames = new Set<string>(); for (const station of [...seeds, ...stations]) { const urlKey = stationUrlKey(station); const nameKey = stationNameKey(station); if (!urlKey) { logCuratedStationDiagnostic(station, 'excluded: missing stream URL', 'mergeSeedStations'); continue; } if (seenUrls.has(urlKey) || (!isCuratedStation(station) && seenNames.has(nameKey))) { logCuratedStationDiagnostic(station, 'excluded: duplicate suppressed; curated metadata wins when duplicate is Radio Browser', 'mergeSeedStations'); continue; } seenUrls.add(urlKey); if (nameKey) seenNames.add(nameKey); merged.push(isCuratedStation(station) ? { ...station, is_active: station.validation_status === 'needs_review' || isGeoAudioStation(station) ? station.is_active : true, failure_count: station.validation_status === 'needs_review' || isGeoAudioStation(station) ? station.failure_count : 0, last_check_ok: station.validation_status === 'needs_review' || isGeoAudioStation(station) ? station.last_check_ok : (station.last_check_ok ?? true), validation_status: station.validation_status === 'failed' ? 'needs_review' : station.validation_status } : station); } return merged; }
function rankStation(station: Station, rawQuery = '') { const q = rawQuery.trim().toLowerCase(); const name = station.name.toLowerCase(); let score = 0; if (q) { const tokens = q.split(/\s+/).filter((token) => token.length > 2); if (name === q) score += 10000; else if (name.startsWith(q)) score += 7000; else if (name.includes(q)) score += 4500; score += tokens.filter((token) => name.includes(token)).length * 2200; if (tokens[0] && name.includes(tokens[0])) score += 5000; if (`${station.country} ${station.country_code} ${station.language} ${station.tags.join(' ')}`.toLowerCase().includes(q)) score += 900; score += culturalAtlasScore(station, rawQuery); } score += station.is_active ? 1800 : -2000; score += Math.min(1400, station.votes * 1.5); score += Math.min(1200, station.click_count / 4); score += station.bitrate > 0 ? Math.min(800, station.bitrate * 2) : 0; score += station.codec && station.codec !== 'Unknown' ? 350 : 0; score += station.url ? 250 : 0; if (isCuratedStation(station)) score += 1800; if (station.country_code === 'NG' && isCuratedStation(station)) score += 2600; if (matchesAriyoPriorityIntent(station, rawQuery)) score += 9000; if (isCampusAtlas(station) && matchesCampusAtlasIntent(station, rawQuery)) score += 7200; return score; }
export function rankStations(stations: Station[], q = '') { return [...stations].sort((a,b)=>rankStation(b,q)-rankStation(a,q) || sortStations(a,b)); }

const candidateContinentSeeds = [
  { continent: 'Africa', codes: ['NG', 'GH', 'ZA', 'KE', 'EG', 'MA', 'SN'] },
  { continent: 'Europe', codes: ['GB', 'FR', 'DE', 'NL', 'ES', 'IT', 'SE'] },
  { continent: 'Asia', codes: ['JP', 'IN', 'SG', 'KR', 'ID', 'PH', 'AE'] },
  { continent: 'Oceania', codes: ['AU', 'NZ', 'FJ', 'PG'] },
  { continent: 'North America', codes: ['US', 'CA', 'MX'] },
  { continent: 'South America', codes: ['BR', 'AR', 'CL', 'CO', 'PE'] },
];

export async function fetchGlobalCandidateStations(minimum = 1500): Promise<Station[]> {
  return cached(`global-candidates:${minimum}`, STATION_CACHE_TTL_MS, async () => {
    const broad = await fetchStations({ limit: String(RADIO_BROWSER_PAGE_SIZE * GLOBAL_CACHED_PAGES), pageSize: String(RADIO_BROWSER_PAGE_SIZE), pages: String(GLOBAL_CACHED_PAGES), order: 'clicktrend', allowFallback: 'true', includeDiagnostics: 'true' });
    const countryPages = (await Promise.all(candidateContinentSeeds.flatMap((group) => group.codes).map((countryCode) => fetchStationsByCountry({ countryCode, limit: String(Math.ceil(minimum / 6)), pageSize: '150' }).catch(() => [])))).flat();
    const ranked = rankStations(mergeSeedStations([...broad, ...countryPages, ...fallbackStations]), 'global diverse radio');
    if (ranked.length < minimum && process.env.NODE_ENV !== 'production') console.warn('[WaveAtlas station discovery] global candidate pool below expected size', { expectedMinimum: minimum, actual: ranked.length });
    return ranked;
  });
}

function seedMatchesParams(station: Station, params: Record<string,string|undefined> = {}) { const query = (params.name || params.q || '').trim().toLowerCase(); const countryCode = params.countryCode?.toUpperCase(); const country = params.country?.trim().toLowerCase(); const language = params.language?.trim().toLowerCase(); const tag = params.tag?.trim().toLowerCase(); const haystack = `${station.name} ${station.country} ${station.country_code} ${station.city ?? ''} ${station.state ?? ''} ${station.language} ${station.tags.join(' ')}`.toLowerCase(); if (countryCode && station.country_code !== countryCode) return false; if (country && station.country.toLowerCase() !== country && station.country_code.toLowerCase() !== country && !haystack.includes(country)) return false; if (language && !station.language.toLowerCase().includes(language)) return false; if (tag && !station.tags.some((item) => item.toLowerCase().includes(tag) || tag.includes(item.toLowerCase()))) return false; return !query || haystack.includes(query) || query.split(/\s+/).some((token) => token.length > 2 && haystack.includes(token)); }
export async function fetchStations(params: Record<string,string|undefined> = {}): Promise<Station[]> {
  const requestedLimit = Math.max(1, Number(params.limit ?? String(RADIO_BROWSER_PAGE_SIZE * GLOBAL_CACHED_PAGES)));
  const pageSize = Math.min(RADIO_BROWSER_PAGE_SIZE, Math.max(1, Number(params.pageSize ?? Math.min(RADIO_BROWSER_PAGE_SIZE, requestedLimit))));
  const pages = Math.max(1, Number(params.pages ?? Math.ceil(requestedLimit / pageSize)));
  const startOffset = Math.max(0, Number(params.offset ?? '0'));
  const allowFallback = params.allowFallback === 'true';
  const cacheKey = `stations:${JSON.stringify({ ...params, requestedLimit, pageSize, pages, startOffset })}`;
  return cached(cacheKey, STATION_CACHE_TTL_MS, async()=>{
    const reasons: Record<string, number> = {};
    campusAtlasDiscoveryDiagnostics();
    const seeded = [...nonGeoAudioSeeds().filter((station) => seedMatchesParams(station, params)), ...geoAudioSeedsForParams(params)];
    try {
      const batches = await Promise.all(Array.from({ length: pages }, async (_, page) => {
        const query = new URLSearchParams({ hidebroken:'false', limit:String(pageSize), offset:String(startOffset + page * pageSize), order: params.order ?? 'votes', reverse:'true' });
        if(params.country) query.set('country', params.country); if(params.countryCode) query.set('countrycode', params.countryCode.toUpperCase()); if(params.language) query.set('language', params.language); if(params.tag) query.set('tag', params.tag); if(params.name || params.q) query.set('name', params.name || params.q || '');
        const res = await fetch(`${API_BASE}/stations/search?${query}`, { headers:{ 'User-Agent': UA }, next:{ revalidate: 300 } });
        if(!res.ok) throw new Error(`Radio Browser ${res.status}`);
        return await res.json() as RadioBrowserStation[];
      }));
      const data = batches.flat();
      const stations = data.map(normalize).filter((station) => { if (!station.url) { incrementReason(reasons, 'empty_url'); return false; } if (!/^https?:\/\//i.test(station.url)) { incrementReason(reasons, 'unsafe_url'); return false; } return true; });
      const merged = mergeSeedStations(stations, seeded);
      const ranked = rankStations(merged, params.name || params.q || params.tag || params.country || params.countryCode).slice(0, requestedLimit);
      discoveryDiagnostics('fetchStations', { fetchedCount: data.length, curatedCount: seeded.length, filteredCount: data.length - stations.length, returnedCount: ranked.length, filterReasons: reasons });
      return ranked.length ? ranked : (allowFallback ? rankStations(mergeSeedStations(fallbackStations, seeded), params.name || params.q) : []);
    } catch {
      return allowFallback || seeded.length ? rankStations(mergeSeedStations(allowFallback ? fallbackStations : [], seeded), params.name || params.q || params.tag || params.country || params.countryCode) : [];
    }
  });
}

export async function fetchStationsByCountry(params: Record<string,string|undefined> = {}) {
  const code=params.countryCode?.toUpperCase() || countryAliases[(params.country || '').toLowerCase()];
  const requestedLimit = Math.max(1, Number(params.limit ?? String(COUNTRY_PAGE_SIZE)));
  const pageSize = Math.min(COUNTRY_PAGE_SIZE, Math.max(1, Number(params.pageSize ?? Math.min(COUNTRY_PAGE_SIZE, requestedLimit))));
  const pages = Math.max(1, Number(params.pages ?? Math.ceil(requestedLimit / pageSize)));
  const startOffset = Math.max(0, Number(params.offset ?? '0'));
  const base = code ? `/stations/bycountrycodeexact/${encodeURIComponent(code)}` : `/stations/bycountry/${encodeURIComponent(params.country ?? '')}`;
  return cached(`country:${base}:${JSON.stringify({ ...params, requestedLimit, pageSize, pages, startOffset })}`, STATION_CACHE_TTL_MS, async()=>{
    const reasons: Record<string, number> = {};
    campusAtlasDiscoveryDiagnostics();
    const seeded = [...nonGeoAudioSeeds().filter((station) => seedMatchesParams(station, { ...params, countryCode: code })), ...geoAudioSeedsForParams({ ...params, countryCode: code })];
    try {
      const batches = await Promise.all(Array.from({ length: pages }, async (_, page) => {
        const query = new URLSearchParams({ hidebroken:'false', limit:String(pageSize), offset:String(startOffset + page * pageSize), order:'votes', reverse:'true' });
        if(params.tag) query.set('tag', params.tag); if(params.language) query.set('language', params.language);
        const res=await fetch(`${API_BASE}${base}?${query}`, { headers:{ 'User-Agent': UA }, next:{ revalidate: 300 } });
        if(!res.ok) throw new Error(`Radio Browser ${res.status}`);
        return await res.json() as RadioBrowserStation[];
      }));
      const data=batches.flat();
      const stations = data.map(normalize).filter((station) => { if (!station.url) { incrementReason(reasons, 'empty_url'); return false; } if (!/^https?:\/\//i.test(station.url)) { incrementReason(reasons, 'unsafe_url'); return false; } if (code && station.country_code !== code) { incrementReason(reasons, 'country_mismatch'); return false; } return true; });
      const ranked = rankStations(mergeSeedStations(stations, seeded), params.tag || params.language || params.country || params.countryCode).slice(0, requestedLimit);
      discoveryDiagnostics('fetchStationsByCountry', { fetchedCount: data.length, curatedCount: seeded.length, filteredCount: data.length - stations.length, returnedCount: ranked.length, filterReasons: reasons });
      return ranked;
    } catch { return rankStations(seeded, params.tag || params.language || params.country || params.countryCode); }
  });
}

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

type LatLng = { lat: number; lng: number };
export type CountryIntentOptions = Record<string, string | number | boolean | LatLng | undefined> & { limit?: number | string; offset?: number | string; strictCountryMatch?: boolean; excludeDefaultFallback?: boolean; clickLatLng?: LatLng; centroid?: LatLng };

function normalizeIsoA2(value = '') { return value.trim().toUpperCase(); }
function stationDistanceKm(station: Station, point?: LatLng) {
  if (!point || station.latitude == null || station.longitude == null) return Number.POSITIVE_INFINITY;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(station.latitude - point.lat);
  const dLng = toRad(station.longitude - point.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(point.lat)) * Math.cos(toRad(station.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function rankStationsForCountryIntent(stations: Station[], query: string, clickLatLng?: LatLng) {
  const ranked = rankStations(stations, query);
  if (!clickLatLng) return ranked;
  return ranked.sort((a, b) => {
    const aDistance = stationDistanceKm(a, clickLatLng);
    const bDistance = stationDistanceKm(b, clickLatLng);
    const aFinite = Number.isFinite(aDistance);
    const bFinite = Number.isFinite(bDistance);
    if (aFinite && bFinite && Math.abs(aDistance - bDistance) > 25) return aDistance - bDistance;
    if (aFinite !== bFinite) return aFinite ? -1 : 1;
    return 0;
  });
}

export async function fetchStationsForCountryIntent(countryName: string, isoA2 = '', options: CountryIntentOptions = {}) {
  const limit = String(options.limit ?? '50');
  const offset = String(options.offset ?? '0');
  const aliasCode = countryAliases[countryName.trim().toLowerCase()];
  const code = normalizeIsoA2(isoA2 || aliasCode || '');
  const requestParams: Record<string, string | undefined> = Object.fromEntries(Object.entries(options).filter(([, value]) => typeof value === 'string' || typeof value === 'number').map(([key, value]) => [key, String(value)]));
  const primary = await fetchStationsByCountry({ ...requestParams, country: countryName, countryCode: code, limit, offset });
  const strictCountryMatch = Boolean(options.strictCountryMatch);
  const excludeDefaultFallback = Boolean(options.excludeDefaultFallback);
  const normalizedCode = normalizeIsoA2(code);
  const matchesStrictCountry = (station: Station) => !strictCountryMatch || !normalizedCode || normalizeIsoA2(station.country_code) === normalizedCode;
  const primaryScoped = primary.filter(matchesStrictCountry);
  const scopedFallbacks = excludeDefaultFallback ? [] : (normalizedCode ? fallbackStations.filter((station) => normalizeIsoA2(station.country_code) === normalizedCode) : fallbackStations);
  const baseScopedSeeds = normalizedCode ? nonGeoAudioSeeds().filter((station) => normalizeIsoA2(station.country_code) === normalizedCode) : nonGeoAudioSeeds();
  const scopedSeeds = matchesGeoAudioIntent(requestParams.name || requestParams.q || requestParams.tag || '') ? [...baseScopedSeeds, ...geoAudioSeedsForParams({ ...requestParams, countryCode: normalizedCode })] : baseScopedSeeds;
  const scoped = mergeSeedStations([...primaryScoped, ...scopedFallbacks], scopedSeeds).filter(matchesStrictCountry);
  return rankStationsForCountryIntent(scoped, requestParams.name || requestParams.q || requestParams.tag || requestParams.language || countryName || normalizedCode, options.clickLatLng).slice(0, Number(limit));
}

function inferStreamFormat(url: string, contentType = '') {
  const value = `${url} ${contentType}`.toLowerCase();
  if (/opus/.test(value)) return { codec: 'OPUS', isPlaylist: false };
  if (/ogg|oga/.test(value)) return { codec: 'OGG', isPlaylist: false };
  if (/aac|aacp|aach|audio\/a[a]?c/.test(value)) return { codec: 'AAC', isPlaylist: false };
  if (/mp3|mpeg/.test(value)) return { codec: 'MP3', isPlaylist: false };
  if (/\.pls(?:[?#]|$)|scpls/.test(value)) return { codec: 'Unknown', isPlaylist: true };
  if (/\.m3u8?(?:[?#]|$)|mpegurl/.test(value)) return { codec: 'Unknown', isPlaylist: true };
  return { codec: 'Unknown', isPlaylist: false };
}

function parsePlaylist(body: string, baseUrl: string) {
  const plsFile = body.match(/^\s*File\d+=(.+)$/im)?.[1]?.trim();
  const line = plsFile ?? body.split(/\r?\n/).map((item) => item.trim()).find((line) => line && !line.startsWith('#') && !/^\[playlist\]/i.test(line));
  if (!line) return undefined;
  try { return new URL(line, baseUrl).toString(); } catch { return undefined; }
}

export async function validateStream(url: string, options: { curated?: boolean } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), options.curated ? 16000 : 9000);
  const checkedAt = () => new Date().toISOString();
  const uncertain = (reason: string, contentType = 'unknown', resolvedUrl?: string) => ({ is_active: Boolean(options.curated), health_score: options.curated ? 55 : 10, response_time_ms: Date.now()-started, failure_count: options.curated ? 0 : 1, content_type: contentType, codec: inferStreamFormat(resolvedUrl || url, contentType).codec, bitrate: 0, url_resolved: resolvedUrl, last_checked_at: checkedAt(), validation_status: options.curated ? 'needs_review' as const : 'failed' as const, validation_reason: reason });
  try {
    if(!/^https?:\/\//i.test(url)) throw new Error('Unsafe stream URL');
    let currentUrl = url;
    let res: Response | undefined;
    let headError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { res = await fetch(currentUrl, { method:'HEAD', signal:controller.signal, redirect:'follow' }); } catch (error) { headError = error; }
      if (!res?.ok) res = await fetch(currentUrl, { method:'GET', signal:controller.signal, redirect:'follow', headers: { Range: 'bytes=0-4095', 'Icy-MetaData': '1' } });
      const type = res.headers.get('content-type') ?? '';
      const responseUrl = res.url || currentUrl;
      const format = inferStreamFormat(responseUrl, type);
      if (format.isPlaylist && attempt === 0) {
        const text = await res.clone().text().catch(() => '');
        const target = parsePlaylist(text, responseUrl);
        if (target && /^https?:\/\//i.test(target)) { currentUrl = target; continue; }
        return uncertain('Playlist URL did not contain a playable HTTP(S) stream target.', type, responseUrl);
      }
      const extensionPlayable = /\.(mp3|aac|aacp|ogg|oga|opus)(?:[?#]|$)/i.test(responseUrl);
      const typePlayable = /(audio|mpeg|ogg|opus|aac|mp3|octet-stream)/i.test(type);
      const icyPlayable = Boolean(res.headers.get('icy-br') || res.headers.get('icy-name') || res.headers.get('icy-genre'));
      const playable = Boolean(res.ok && (typePlayable || extensionPlayable || icyPlayable || (options.curated && !type)));
      const codec = format.codec;
      const bitrate = Number(res.headers.get('icy-br') ?? 0) || 0;
      if (!playable && options.curated) return uncertain(`Uncertain content-type: ${type || 'missing'}`, type, responseUrl);
      return { is_active: playable, health_score: playable ? (responseUrl.startsWith('https://') ? 94 : 82) : 35, response_time_ms: Date.now()-started, failure_count: playable ? 0 : 1, content_type:type, codec, bitrate, url_resolved: responseUrl, last_verified_at: playable ? checkedAt() : undefined, last_checked_at: checkedAt(), validation_status: playable ? 'verified' as const : 'failed' as const, validation_reason: playable ? 'Stream accepted by validation with redirect, playlist, content-type, and lightweight audio checks.' : `Unsupported content-type: ${type || 'missing'}` };
    }
    return uncertain('Validation loop ended without a playable response.');
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
