import { ariyoSeedStations } from './stations/ariyoSeedStations';
import { campusAtlasStations } from './stations/campusAtlasStations';
import { discoveredRadioStations } from './stations/discoveredRadioStations';
import type { Station } from './stations';

export type RadioBrowserCandidate = Partial<Record<'stationuuid'|'name'|'url'|'url_resolved'|'homepage'|'favicon'|'country'|'countrycode'|'state'|'language'|'tags'|'codec', string>> & { bitrate?: number; geo_lat?: number; geo_long?: number; votes?: number; clickcount?: number; clicktrend?: number; lastcheckok?: number; lastchecktime_iso8601?: string };
export type DiscoveryMetadata = { stationUuid: string; discoverySource: string; sourceStationUuid: string; verifiedAt: string; lastSignalCheck: string; qualityScore: number; resolvedUrl?: string };

const SPAM = /\b(test|delete|xxx|porn|casino|viagra|bitcoin|crypto pump|do not use)\b/i;

export function normalizeStationName(name = '') {
  return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function slugifyStation(value: string) {
  return normalizeStationName(value).replace(/\s+/g, '-').replace(/^-|-$/g, '') || 'radio-station';
}
export function normalizeUrl(url = '') {
  try { const parsed = new URL(url.trim()); parsed.hash = ''; return parsed.toString().replace(/\/$/, '').toLowerCase(); } catch { return ''; }
}
export function hasValidCoordinates(lat?: number, lon?: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180 && !(lat === 0 && lon === 0);
}
export function qualityScore(c: RadioBrowserCandidate) {
  let score = 0;
  if ((c.bitrate ?? 0) >= 128) score += 25; else if ((c.bitrate ?? 0) > 0) score += 8;
  if (c.lastcheckok === 1) score += 25;
  if (hasValidCoordinates(c.geo_lat, c.geo_long)) score += 18;
  if ((c.url_resolved || c.url || '').startsWith('https://')) score += 8;
  if (c.homepage) score += 6;
  if (c.favicon) score += 4;
  score += Math.min(10, Math.max(0, Math.floor((c.votes ?? 0) / 100)));
  score += Math.min(4, Math.max(0, c.clicktrend ?? 0));
  return Math.min(100, score);
}
export function rejectReason(c: RadioBrowserCandidate, minimumBitrate = 128, requireGeo = true) {
  const name = c.name?.trim() ?? '';
  const url = c.url_resolved || c.url || '';
  if (!name) return 'missing_name';
  if (SPAM.test(name)) return 'suspicious_name';
  if (!normalizeUrl(url)) return 'missing_or_invalid_stream_url';
  if (c.lastcheckok !== 1) return 'lastcheck_not_ok';
  if ((c.bitrate ?? 0) < minimumBitrate) return 'low_bitrate';
  if (requireGeo && !hasValidCoordinates(c.geo_lat, c.geo_long)) return 'missing_geo';
  if (c.geo_lat !== undefined || c.geo_long !== undefined) if (!hasValidCoordinates(c.geo_lat, c.geo_long)) return 'invalid_geo';
  return undefined;
}
export function existingStationKeys(stations: Station[]) {
  return {
    urls: new Set(stations.map((s) => normalizeUrl(s.url_resolved || s.url)).filter(Boolean)),
    names: new Set(stations.map((s) => normalizeStationName(s.name)).filter(Boolean)),
    sourceUuids: new Set(stations.map((s) => s.station_uuid).filter(Boolean)),
  };
}
export function isDuplicateCandidate(c: RadioBrowserCandidate, keys: ReturnType<typeof existingStationKeys>) {
  return keys.urls.has(normalizeUrl(c.url_resolved || c.url)) || keys.names.has(normalizeStationName(c.name || '')) || (!!c.stationuuid && keys.sourceUuids.has(c.stationuuid));
}
export function candidateToStation(c: RadioBrowserCandidate, verifiedAt: string): Station {
  const name = (c.name || 'Unknown station').replace(/[\s_-]+/g, ' ').trim();
  const id = `radio-browser-${slugifyStation(name)}-${(c.stationuuid || '').slice(0, 8)}`.replace(/-$/,'');
  const url = c.url_resolved || c.url || '';
  return { id, station_uuid: id, name, normalized_name: normalizeStationName(name), url, url_resolved: c.url_resolved || url, homepage: c.homepage, favicon: c.favicon || '', country: c.country || 'Global', country_code: (c.countrycode || 'UN').toUpperCase(), state: c.state, language: c.language || 'Unknown', tags: [...new Set((c.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8).concat(['radio browser', 'global discovery']))], codec: c.codec || 'Unknown', bitrate: c.bitrate || 0, latitude: c.geo_lat, longitude: c.geo_long, votes: c.votes || 0, click_count: c.clickcount || 0, health_score: Math.max(70, qualityScore(c)), is_active: true, last_check_ok: true, last_checked_at: verifiedAt, failure_count: 0, response_time_ms: 0, curation_source: 'radio-browser', curation_tier: 'radio_browser', source_confidence: qualityScore(c) / 100, verification_status: 'verified', validation_status: 'verified', validation_reason: 'Validated by WaveAtlas global radio discovery agent.' };
}
export function allRuntimeStations() { return [...ariyoSeedStations, ...campusAtlasStations, ...discoveredRadioStations]; }
