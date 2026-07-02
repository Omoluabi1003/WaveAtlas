import assert from 'node:assert/strict';
import { AtlasInteractionEngine, rankPlayableAtlasStationsInCountry, type AtlasInteractionCountry } from '../lib/atlas-interaction-engine';
import { buildStationGeoTruthHealthReport } from '../lib/station-geotruth-health';
import type { Station } from '../lib/stations';

function station(input: Partial<Station> & Pick<Station, 'id' | 'name' | 'country' | 'country_code'>): Station {
  return {
    station_uuid: input.id,
    normalized_name: input.name.toLowerCase(),
    url: 'https://example.com/stream.mp3',
    url_resolved: 'https://example.com/stream.mp3',
    homepage: '',
    favicon: '',
    state: '',
    city: '',
    language: 'English',
    tags: [],
    codec: 'MP3',
    bitrate: 128,
    latitude: undefined,
    longitude: undefined,
    votes: 0,
    click_count: 0,
    health_score: 90,
    is_active: true,
    last_checked_at: '2026-01-01T00:00:00.000Z',
    failure_count: 0,
    response_time_ms: 100,
    last_check_ok: true,
    ...input,
  };
}

const nigeria: AtlasInteractionCountry = { name: 'Nigeria', code: 'NG', flag: '🇳🇬', centroid: { lat: 9.082, lng: 8.6753 }, station_count: 2 };
const active = station({ id: 'active-ng', name: 'Active Lagos', country: 'Nigeria', country_code: 'NG', city: 'Lagos', latitude: 6.5244, longitude: 3.3792, votes: 100 });
const alternative = station({ id: 'alt-ng', name: 'Alternative Ibadan', country: 'Nigeria', country_code: 'NG', city: 'Ibadan', latitude: 7.3775, longitude: 3.947, votes: 10 });

const ranked = rankPlayableAtlasStationsInCountry([active, alternative], { lat: 6.5244, lng: 3.3792 }, nigeria, 'active-ng');
assert.equal(ranked.excludedActiveStation, true);
assert.equal(ranked.ranked[0].station.id, 'alt-ng');
assert.equal(ranked.candidateCountBeforeExclusion, 2);
assert.equal(ranked.candidateCountAfterExclusion, 1);

const engine = new AtlasInteractionEngine({
  geometryProvider: () => null,
  countryResolver: () => nigeria,
  stationsProvider: () => [active, alternative],
});
engine.pointerDown({ pointerId: 1, clientX: 10, clientY: 10 });
engine.pointerDown({ pointerId: 2, clientX: 12, clientY: 12 });
const firstUp = engine.pointerUp({ pointerId: 1, clientX: 10, clientY: 10, blockedByOverlay: false, canvasRect: { left: 0, top: 0 } as DOMRect });
assert.equal(firstUp.kind, 'rejected');
assert.equal(firstUp.diagnostics.rejectedReason, 'multi-touch');
const secondUp = engine.pointerUp({ pointerId: 2, clientX: 12, clientY: 12, blockedByOverlay: false, canvasRect: { left: 0, top: 0 } as DOMRect });
assert.equal(secondUp.kind, 'rejected');
assert.equal(secondUp.diagnostics.rejectedReason, 'multi-touch');

const report = buildStationGeoTruthHealthReport([
  active,
  alternative,
  station({ id: 'centroid-gh', name: 'Ghana Centroid', country: 'Ghana', country_code: 'GH' }),
  station({ id: 'outside-ng', name: 'Bad Geo', country: 'Nigeria', country_code: 'NG', latitude: 51.5072, longitude: -0.1276 }),
], 1);
assert.equal(report.playableStations, 4);
assert.equal(report.playableStationsByCountry.find((row) => row.country_code === 'GH')?.countryCentroid, 1);
assert.equal(report.countriesWithPlayableStationsButNoPreciseCoordinates.some((row) => row.country_code === 'GH'), true);
assert.equal(report.stationsOutsideDeclaredCountry.some((row) => row.key === 'outside-ng'), true);
assert.equal(report.duplicatedCoordinates.some((row) => row.lat === 6.5244 && row.lng === 3.3792), true);

console.log('atlas geotruth health regression passed');
