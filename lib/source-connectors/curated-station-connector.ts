import type { Station } from '../stations';
import { clampConfidence, stableStationUuid, type NormalizedStationEvidence, type StationSourceConnector } from './station-source-connector';

export type CuratedStationRecord = Partial<Station> & {
  station_uuid?: string;
  source_station_id?: string;
  confidence?: number;
  notes?: string;
};

const curatedStations: CuratedStationRecord[] = [
  { station_uuid: 'bbc-world-service', source_station_id: 'bbc-world-service', name: 'BBC World Service', country: 'United Kingdom', country_code: 'GB', city: 'London', language: 'English', tags: ['news', 'talk', 'international'], url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', homepage: 'https://www.bbc.co.uk/worldserviceradio', latitude: 51.5072, longitude: -0.1276, confidence: 0.99 },
  { station_uuid: 'cool-fm-lagos', source_station_id: 'cool-fm-lagos', name: 'Cool FM Lagos', country: 'Nigeria', country_code: 'NG', city: 'Lagos', language: 'English', tags: ['music', 'afrobeats', 'talk'], url: 'https://stream.coolwazobiainfo.com/coolfm-lagos', homepage: 'https://www.coolfm.ng', latitude: 6.5244, longitude: 3.3792, confidence: 0.98 },
];

export class CuratedStationConnector implements StationSourceConnector<CuratedStationRecord> {
  readonly name = 'curated';
  readonly status = 'active' as const;
  readonly purpose = 'ETL-approved manual station overrides and verified records';
  constructor(private readonly records: CuratedStationRecord[] = curatedStations) {}

  async searchStations(query: string) { const q = query.toLowerCase(); return this.records.filter((s) => [s.name, s.country, s.country_code, s.city, ...(s.tags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(q)); }
  async getStationsByCountry(countryCode: string) { return this.records.filter((s) => s.country_code?.toUpperCase() === countryCode.toUpperCase()); }
  async getStationsByGenre(genre: string) { return this.records.filter((s) => s.tags?.some((tag) => tag.toLowerCase() === genre.toLowerCase())); }
  async getStationById(id: string) { return this.records.find((s) => s.station_uuid === id || s.source_station_id === id) ?? null; }

  normalize(record: CuratedStationRecord): NormalizedStationEvidence {
    const sourceStationId = record.source_station_id || record.station_uuid || record.name || 'curated-station';
    const stationUuid = record.station_uuid || stableStationUuid(this.name, sourceStationId, record.name);
    return {
      sourceName: this.name,
      stationUuid,
      sourceStationId,
      sourceUrl: record.homepage,
      rawName: record.name,
      rawCountry: record.country,
      rawCountryCode: record.country_code,
      rawCity: record.city || record.state,
      rawLanguage: record.language,
      rawGenres: record.tags,
      rawStreamUrl: record.url_resolved || record.url,
      rawHomepage: record.homepage,
      rawLat: record.latitude,
      rawLng: record.longitude,
      evidenceConfidence: clampConfidence(record.confidence ?? 0.95),
      collectedAt: new Date().toISOString(),
      rawPayload: record,
      normalized: { ...record, station_uuid: stationUuid },
    };
  }
}
