import type { NormalizedStationEvidence, StationSourceConnector } from './station-source-connector';

export class FutureProviderConnector implements StationSourceConnector<never> {
  readonly name = 'future_provider';
  readonly status = 'stub' as const;
  readonly purpose = 'Placeholder for TuneIn, MyTuner, Streema, Radio Garden, national broadcasters, and future sources';
  async searchStations() { return []; }
  async getStationsByCountry() { return []; }
  async getStationsByGenre() { return []; }
  async getStationById() { return null; }
  normalize(): NormalizedStationEvidence { throw new Error('FutureProviderConnector is a non-scraping stub until provider terms and APIs are approved.'); }
}
