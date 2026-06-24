import { campusAtlasStations } from '../stations/campusAtlasStations';
import { countryAliases, validateStream, type Station } from '../stations';
import { clampConfidence, stableStationUuid, type NormalizedStationEvidence, type StationSourceConnector, type StationSourceName, type ValidationStatus } from './station-source-connector';

export type SourceDiagnostics = { source: string; fetched: number; rejected: number; duplicated: number; verified: number; failed: number; imported: number };
export type GlobalRadioCandidate = { id: string; name: string; streamUrl: string; homepage?: string; country?: string; countryCode?: string; city?: string; language?: string; tags?: string[]; codec?: string; bitrate?: number; lat?: number; lng?: number; attribution: string; sourceUrl?: string };

const SAFE_SOURCE_PRIORITY: StationSourceName[] = ['radio_browser', 'xiph_icecast', 'official_broadcaster', 'campus_directory', 'public_media_network', 'national_broadcaster_list', 'community_signal'];
const FORBIDDEN_CATALOGS = [/radio\s*garden/i, /mytuner/i, /tunein/i, /streema/i, /online\s*radio\s*box/i];
const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(Object.entries(countryAliases).map(([name, code]) => [code, name.replace(/\b\w/g, (m) => m.toUpperCase())]));

function normalizeName(name = 'Unknown station') { return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function countryName(code?: string, fallback = 'Global') { return code ? COUNTRY_NAMES[code.toUpperCase()] ?? fallback : fallback; }
function sourceAllowed(candidate: GlobalRadioCandidate) { return !FORBIDDEN_CATALOGS.some((pattern) => pattern.test(`${candidate.attribution} ${candidate.sourceUrl ?? ''} ${candidate.homepage ?? ''}`)); }

export class StaticVerifiedSourceConnector implements StationSourceConnector<GlobalRadioCandidate> {
  readonly status = 'active' as const;
  constructor(readonly name: StationSourceName, readonly purpose: string, private readonly candidates: GlobalRadioCandidate[]) {}
  async searchStations(query: string) { const q = query.toLowerCase(); return this.candidates.filter((item) => `${item.name} ${item.country ?? ''} ${item.countryCode ?? ''} ${item.tags?.join(' ') ?? ''}`.toLowerCase().includes(q)); }
  async getStationsByCountry(countryCode: string) { return this.candidates.filter((item) => item.countryCode?.toUpperCase() === countryCode.toUpperCase()); }
  async getStationsByGenre(genre: string) { const q = genre.toLowerCase(); return this.candidates.filter((item) => item.tags?.some((tag) => tag.toLowerCase().includes(q))); }
  async getStationById(id: string) { return this.candidates.find((item) => item.id === id) ?? null; }
  async fetchCandidates(input: { query?: string; countryCode?: string; genre?: string; limit?: number } = {}) {
    let rows = this.candidates.filter(sourceAllowed);
    if (input.countryCode) rows = rows.filter((item) => item.countryCode?.toUpperCase() === input.countryCode?.toUpperCase());
    if (input.genre) rows = await this.getStationsByGenre(input.genre);
    if (input.query) rows = rows.filter((item) => `${item.name} ${item.country ?? ''} ${item.tags?.join(' ') ?? ''}`.toLowerCase().includes(input.query!.toLowerCase()));
    return rows.slice(0, input.limit ?? 50);
  }
  normalize(rawStation: GlobalRadioCandidate) { return this.normalizeCandidate(rawStation); }
  normalizeCandidate(candidate: GlobalRadioCandidate): NormalizedStationEvidence {
    const countryCode = candidate.countryCode?.toUpperCase() ?? 'UN';
    const stationUuid = stableStationUuid(this.name, candidate.id, candidate.name);
    return { sourceName: this.name, stationUuid, sourceStationId: candidate.id, sourceUrl: candidate.sourceUrl ?? candidate.homepage, rawName: candidate.name, rawCountry: candidate.country ?? countryName(countryCode), rawCountryCode: countryCode, rawCity: candidate.city, rawLanguage: candidate.language, rawGenres: candidate.tags, rawStreamUrl: candidate.streamUrl, rawHomepage: candidate.homepage, rawLat: candidate.lat, rawLng: candidate.lng, evidenceConfidence: 0.82, collectedAt: new Date().toISOString(), rawPayload: candidate, normalized: { id: stationUuid, station_uuid: stationUuid, name: candidate.name, normalized_name: normalizeName(candidate.name), url: candidate.streamUrl, url_resolved: candidate.streamUrl, homepage: candidate.homepage, country: candidate.country ?? countryName(countryCode), country_code: countryCode, city: candidate.city, language: candidate.language ?? 'Unknown', tags: [...(candidate.tags ?? []), 'global source expansion', this.name.replace(/_/g, ' ')], codec: candidate.codec ?? 'Unknown', bitrate: candidate.bitrate ?? 0, latitude: candidate.lat, longitude: candidate.lng, votes: 0, click_count: 0, health_score: 50, is_active: false, last_checked_at: new Date().toISOString(), failure_count: 0, response_time_ms: 0, curation_source: candidate.attribution, validation_status: 'candidate' } };
  }
  async validateStream(candidate: NormalizedStationEvidence) { return validateStream(candidate.rawStreamUrl || candidate.normalized.url || ''); }
  async enrichGeo(candidate: NormalizedStationEvidence) { return candidate.rawLat && candidate.rawLng ? candidate : { ...candidate, evidenceConfidence: clampConfidence(candidate.evidenceConfidence - 0.08) }; }
  scoreCandidate(candidate: NormalizedStationEvidence) { const station = candidate.normalized; return Math.round((candidate.evidenceConfidence * 45) + (String(station.url).startsWith('https://') ? 20 : 0) + (station.homepage ? 10 : 0) + (station.latitude && station.longitude ? 15 : 0) + (station.codec && station.codec !== 'Unknown' ? 5 : 0)); }
}

export const xiphIcecastDirectoryConnector = new StaticVerifiedSourceConnector('xiph_icecast', 'Xiph/Icecast public directory compatible adapter; imports only URLs that pass validation.', [
  { id: 'somafm-groove-salad', name: 'SomaFM Groove Salad', streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3', homepage: 'https://somafm.com/groovesalad/', country: 'United States', countryCode: 'US', city: 'San Francisco', language: 'English', tags: ['electronic', 'ambient'], codec: 'MP3', bitrate: 128, lat: 37.7749, lng: -122.4194, attribution: 'SomaFM official Icecast stream', sourceUrl: 'https://somafm.com/listen/' },
]);
export const officialBroadcasterConnector = new StaticVerifiedSourceConnector('official_broadcaster', 'Verified broadcaster homepage stream adapter.', [
  { id: 'bbc-world-service-official', name: 'BBC World Service', streamUrl: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', homepage: 'https://www.bbc.co.uk/worldserviceradio', country: 'United Kingdom', countryCode: 'GB', city: 'London', language: 'English', tags: ['news', 'talk', 'international'], codec: 'MP3', bitrate: 96, lat: 51.5072, lng: -0.1276, attribution: 'BBC official stream page' },
]);
export const publicMediaNetworkConnector = new StaticVerifiedSourceConnector('public_media_network', 'Public media network station list adapter.', [
  { id: 'npr-news-public-media', name: 'NPR News', streamUrl: 'https://npr-ice.streamguys1.com/live.mp3', homepage: 'https://www.npr.org', country: 'United States', countryCode: 'US', city: 'Washington', language: 'English', tags: ['news', 'public radio'], codec: 'MP3', bitrate: 128, lat: 38.9072, lng: -77.0369, attribution: 'NPR public media stream' },
]);
export const nationalBroadcasterListConnector = new StaticVerifiedSourceConnector('national_broadcaster_list', 'Curated national broadcaster list adapter.', [
  { id: 'radio-france-fip', name: 'FIP', streamUrl: 'https://icecast.radiofrance.fr/fip-midfi.mp3', homepage: 'https://www.radiofrance.fr/fip', country: 'France', countryCode: 'FR', city: 'Paris', language: 'French', tags: ['jazz', 'eclectic', 'public radio'], codec: 'MP3', bitrate: 128, lat: 48.8566, lng: 2.3522, attribution: 'Radio France public stream list' },
]);

export const campusDirectoryConnector = new StaticVerifiedSourceConnector('campus_directory', 'Campus and university radio directory adapter preserving existing Campus Atlas seeds.', campusAtlasStations.map((station) => ({ id: station.station_uuid, name: station.name, streamUrl: station.url_resolved || station.url, homepage: station.homepage, country: station.country, countryCode: station.country_code, city: station.city || station.state, language: station.language, tags: station.tags, codec: station.codec, bitrate: station.bitrate, lat: station.latitude, lng: station.longitude, attribution: station.curation_source || 'Campus Atlas curated directory', sourceUrl: station.homepage })));

export const safeExpansionConnectors = [xiphIcecastDirectoryConnector, officialBroadcasterConnector, campusDirectoryConnector, publicMediaNetworkConnector, nationalBroadcasterListConnector] as const;

export async function runGlobalRadioSourceExpansion(input: { query?: string; countryCode?: string; genre?: string; limitPerSource?: number; validate?: boolean } = {}) {
  const diagnostics: SourceDiagnostics[] = [];
  const stations: Station[] = [];
  const seen = new Set<string>();
  for (const connector of safeExpansionConnectors) {
    const raw = await connector.fetchCandidates({ ...input, limit: input.limitPerSource ?? 25 });
    const diag: SourceDiagnostics = { source: connector.name, fetched: raw.length, rejected: 0, duplicated: 0, verified: 0, failed: 0, imported: 0 };
    for (const item of raw) {
      const candidate = await connector.enrichGeo(connector.normalizeCandidate(item));
      const keys = [candidate.rawStreamUrl, candidate.normalized.url_resolved, candidate.rawHomepage, candidate.stationUuid, normalizeName(candidate.rawName)].filter(Boolean).map(String).map((value) => value.toLowerCase());
      if (keys.some((key) => seen.has(key))) { diag.duplicated += 1; continue; }
      keys.forEach((key) => seen.add(key));
      const validation = input.validate === false ? undefined : await connector.validateStream(candidate);
      const status = (validation?.validation_status ?? 'candidate') as ValidationStatus;
      if (status === 'rejected') { diag.rejected += 1; continue; }
      if (status === 'failed') diag.failed += 1;
      if (status === 'verified') diag.verified += 1;
      const base = candidate.normalized as Station;
      stations.push({ ...base, url_resolved: validation?.url_resolved ?? base.url_resolved, codec: validation?.codec && validation.codec !== 'Unknown' ? validation.codec : base.codec, bitrate: validation?.bitrate || base.bitrate, response_time_ms: validation?.response_time_ms ?? base.response_time_ms, health_score: validation?.health_score ?? connector.scoreCandidate(candidate), is_active: validation?.is_active ?? false, failure_count: validation?.failure_count ?? 0, last_check_ok: validation?.is_active, last_checked_at: validation?.last_checked_at ?? base.last_checked_at, validation_status: status, validation_reason: validation?.validation_reason ?? 'Candidate queued for stream validation.' });
      diag.imported += 1;
    }
    diagnostics.push(diag);
  }
  return { sourcePriority: SAFE_SOURCE_PRIORITY, stations, diagnostics };
}
