import type { NormalizedStationEvidence, StationSourceProvider } from './station-source-connector';

export type FMStreamReferenceStation = {
  id?: string;
  name?: string;
  country?: string;
  countryCode?: string;
  streamUrl?: string;
  homepage?: string;
  city?: string;
  language?: string;
  genres?: string[];
};

export class FMStreamReferenceConnector implements StationSourceProvider<FMStreamReferenceStation> {
  readonly name = 'fmstream_reference';
  readonly status = 'stub' as const;
  readonly primary = false;
  readonly referenceOnly = true;
  readonly purpose = 'Reference-only FMStream discovery adapter; disabled until API key and terms approval are configured.';
  readonly usageConstraints = [
    'FMStream API access requires an approved key and signed conditions.',
    'Use is limited to 100% non-commercial projects with no ads, fees, monetization, user tracking, or key sharing.',
    'fmstream.org must be clearly named and linked as a data source from the main screen.',
    'FMStream data must not be collected, stored, or aggregated into a separate database.',
    'Station assignments and stream metadata are experimental and must be independently verified before publication.',
  ];

  private enabled() { return Boolean(process.env.FMSTREAM_API_KEY && process.env.FMSTREAM_TERMS_APPROVED === 'true'); }
  async searchStations() { return []; }
  async getStationsByCountry() { return []; }
  async getStationsByGenre() { return []; }
  async getStationById() { return null; }
  normalize(rawStation: FMStreamReferenceStation): NormalizedStationEvidence {
    if (!this.enabled()) throw new Error('FMStream reference adapter is disabled until usage constraints are approved and an API key is configured.');
    const sourceStationId = rawStation.id || rawStation.streamUrl || rawStation.name || 'fmstream-reference';
    return {
      sourceName: this.name,
      sourceStationId,
      sourceUrl: rawStation.homepage,
      rawName: rawStation.name,
      rawCountry: rawStation.country,
      rawCountryCode: rawStation.countryCode,
      rawCity: rawStation.city,
      rawLanguage: rawStation.language,
      rawGenres: rawStation.genres,
      rawStreamUrl: rawStation.streamUrl,
      rawHomepage: rawStation.homepage,
      evidenceConfidence: 0.45,
      collectedAt: new Date().toISOString(),
      stationUuid: `fmstream-reference-${sourceStationId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      validation_status: 'needs_review',
      normalized: {
        name: rawStation.name,
        url: rawStation.streamUrl,
        homepage: rawStation.homepage,
        country: rawStation.country,
        country_code: rawStation.countryCode?.toUpperCase(),
        city: rawStation.city,
        language: rawStation.language,
        tags: [...(rawStation.genres ?? []), 'fmstream reference'],
        curation_source: 'fmstream-reference',
        source_confidence: 0.45,
        verification_status: 'reference_only',
        validation_status: 'needs_review',
        validation_reason: 'Reference-only FMStream candidate; must pass WaveAtlas stream validation and licensing review before use.',
      },
    };
  }
}
