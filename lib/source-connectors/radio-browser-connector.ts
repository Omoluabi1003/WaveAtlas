import { fetchStationByUuid, fetchStations, fetchStationsByCountry, type Station } from '../stations';
import { clampConfidence, type NormalizedStationEvidence, type StationSourceConnector } from './station-source-connector';

export class RadioBrowserConnector implements StationSourceConnector<Station> {
  readonly name = 'radio_browser';
  readonly status = 'active' as const;
  readonly purpose = 'Primary global station discovery';

  async searchStations(query: string) { return fetchStations({ q: query, limit: '50' }); }
  async getStationsByCountry(countryCode: string) { return fetchStationsByCountry({ countryCode, limit: '75' }); }
  async getStationsByGenre(genre: string) { return fetchStations({ tag: genre, limit: '75' }); }
  async getStationById(id: string) { return fetchStationByUuid(id); }

  normalize(station: Station): NormalizedStationEvidence {
    const confidence = clampConfidence((station.health_score / 100) * 0.55 + (station.votes > 0 ? 0.2 : 0.05) + (station.latitude && station.longitude ? 0.15 : 0.05) + 0.1);
    return {
      sourceName: this.name,
      stationUuid: station.station_uuid || station.id,
      sourceStationId: station.station_uuid || station.id,
      sourceUrl: station.homepage,
      rawName: station.name,
      rawCountry: station.country,
      rawCountryCode: station.country_code,
      rawCity: station.city || station.state,
      rawLanguage: station.language,
      rawGenres: station.tags,
      rawStreamUrl: station.url_resolved || station.url,
      rawHomepage: station.homepage,
      rawLat: station.latitude,
      rawLng: station.longitude,
      evidenceConfidence: confidence,
      collectedAt: new Date().toISOString(),
      rawPayload: station,
      normalized: station,
    };
  }
}
