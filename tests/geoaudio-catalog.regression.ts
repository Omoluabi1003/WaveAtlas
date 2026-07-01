import assert from 'node:assert/strict';
import {
  ariyoGeoAudioChannels,
  buildJourneyCatalog,
  journeyCatalog,
  normalizeJourneyTrackTitle,
  resolveGeoAudioPlaybackUrl,
  validateJourneyCatalog,
  auditGeoAudioCatalog,
  geoAudioCatalogMismatchReport,
  validateJourneyPlaybackUrls,
} from '../lib/geoaudio';

const issues = validateJourneyCatalog(journeyCatalog);
assert.deepEqual(issues.filter((issue) => issue.severity === 'error'), [], 'canonical journey catalog must not contain duplicate audio references, title/source filename mismatches, or order errors');
assert.deepEqual(geoAudioCatalogMismatchReport(), [], 'canonical journey catalog must not contain title/source filename mismatches');
const auditRows = auditGeoAudioCatalog();
assert.equal(auditRows.length, journeyCatalog.reduce((count, journey) => count + journey.tracks.length, 0), 'catalog audit should emit one row per displayed GeoAudio track');
assert.deepEqual(auditRows.filter((row) => row.duplicateReason), [], 'catalog audit should report no duplicate suppression risks in canonical journeys');

const sunoAuditRows = auditRows.filter((row) => row.originalSunoUrl);
assert.ok(sunoAuditRows.length > 0, 'catalog-wide audit should include every Suno-origin track');
assert.deepEqual(sunoAuditRows.filter((row) => row.status !== 'resolved'), [], 'every Suno-origin audit row should be resolved by exact manifest URL');
for (const row of sunoAuditRows) {
  assert.ok(row.album, 'Suno audit row should include album');
  assert.ok(row.journey, 'Suno audit row should include journey');
  assert.ok(row.title, 'Suno audit row should include title');
  assert.match(row.originalSunoUrl ?? '', /^https:\/\/cdn1\.suno\.ai\//i, 'Suno audit row should preserve originalSunoUrl');
  assert.ok(row.manifestPath?.startsWith('data/suno-assets/'), 'Suno audit row should include manifestPath');
  assert.equal(row.finalAudioUrl, `https://omoluabi1003.github.io/Ariyo-AI/${row.manifestPath}`, 'Suno audit row finalAudioUrl should match the exact manifest asset');
}

for (const journey of journeyCatalog) {
  assert.ok(journey.journeyId.endsWith('-journey'), `${journey.albumId} should expose a stable journeyId`);
  journey.tracks.forEach((track, index) => {
    assert.equal(track.orderIndex, index + 1, `${track.trackId} should have contiguous 1-based orderIndex`);
    assert.equal(track.title, normalizeJourneyTrackTitle(track.title), `${track.trackId} should use normalized product-ready title casing`);
    assert.equal(track.audioUrl, track.sourceUrl, `${track.trackId} should keep the manifest-mapped Ariyo GitHub Pages MP3 as the playable URL unless WaveAtlas serves a verified WaveAtlas local asset`);
    assert.ok(/^https:\/\/omoluabi1003\.github\.io\/Ariyo-AI\//i.test(track.audioUrl), `${track.trackId} should play an Ariyo GitHub Pages URL`);
    if (track.originalSunoUrl) {
      assert.match(track.originalSunoUrl, /^https:\/\/cdn1\.suno\.ai\//i, `${track.trackId} should preserve the original Suno URL only as provenance`);
      assert.ok(track.sunoManifestPath, `${track.trackId} should include the exact Suno manifest path used for resolution`);
      assert.equal(track.audioUrl, `https://omoluabi1003.github.io/Ariyo-AI/${track.sunoManifestPath}`, `${track.trackId} should play the exact manifest-mapped Ariyo local asset`);
      assert.notEqual(track.audioUrl, track.originalSunoUrl, `${track.trackId} must not play the original Suno CDN URL`);
    }
    assert.ok(/^https?:\/\//i.test(track.sourceUrl), `${track.trackId} should preserve source URL only as catalog provenance`);
    assert.equal(track.journeyId, journey.journeyId, `${track.trackId} should point back to its journey`);
    assert.equal(track.sourceAlbum, journey.sourceAlbum, `${track.trackId} should preserve source album`);
    assert.match(track.attribution, /Ariyo AI Studio|Omoluabi Productions/, `${track.trackId} should keep Ariyo attribution`);
  });
}

for (const channel of ariyoGeoAudioChannels) {
  const journey = journeyCatalog.find((entry) => entry.albumId === channel.id);
  assert.ok(journey, `${channel.id} should be backed by a canonical journey manifest`);
  assert.equal(channel.name, `${journey.title} GeoAudio Channel — ${channel.geoAudio?.studio}`, `${channel.id} frontend label should match manifest title`);
  assert.deepEqual(
    channel.geoAudio?.tracks.map((track) => track.title),
    journey.tracks.map((track) => track.title),
    `${channel.id} station queue should consume canonical manifest titles`,
  );
  assert.deepEqual(
    channel.channel?.queue.items.map((item) => item.title),
    journey.tracks.map((track) => track.title),
    `${channel.id} playback queue should consume canonical manifest titles`,
  );
  assert.deepEqual(
    channel.geoAudio?.tracks.map((track) => track.url),
    journey.tracks.map((track) => track.audioUrl),
    `${channel.id} manual track selection should use canonical JourneyCatalogTrack.audioUrl values`,
  );
  assert.deepEqual(
    channel.channel?.queue.items.map((item) => item.url),
    journey.tracks.map((track) => track.audioUrl),
    `${channel.id} auto-next queue should use the same canonical JourneyCatalogTrack.audioUrl values`,
  );
}

const syntheticIssues = validateJourneyCatalog([
  {
    journeyId: 'test-journey',
    albumId: 'test-album',
    title: 'Test Journey',
    subtitle: 'Test',
    description: 'Test journey',
    language: 'English',
    region: 'Test',
    country: 'Test',
    city: 'Test',
    genre: 'GeoAudio',
    mood: 'Curated',
    sourceAlbum: 'Test Journey',
    attribution: 'Ariyo AI Studio / Omoluabi Productions',
    tracks: [
      { journeyId: 'test-journey', albumId: 'test-album', trackId: 'test-track-1', title: 'Duplicate Track', subtitle: 'Test', description: 'Test', audioUrl: '/geoaudio/ariyo/duplicate.mp3', sourceUrl: 'https://example.test/audio/duplicate.mp3', localAssetPath: '/geoaudio/ariyo/duplicate.mp3', language: 'English', region: 'Test', country: 'Test', city: 'Test', genre: 'GeoAudio', mood: 'Curated', orderIndex: 1, sourceAlbum: 'Test Journey', attribution: 'Ariyo AI Studio' },
      { journeyId: 'test-journey', albumId: 'test-album', trackId: 'test-track-2', title: 'Duplicate Track Copy', subtitle: 'Test', description: 'Test', audioUrl: '/geoaudio/ariyo/duplicate.mp3', sourceUrl: 'https://example.test/audio/duplicate-copy.mp3', localAssetPath: '/geoaudio/ariyo/duplicate.mp3', language: 'English', region: 'Test', country: 'Test', city: 'Test', genre: 'GeoAudio', mood: 'Curated', orderIndex: 3, sourceAlbum: 'Test Journey', attribution: 'Ariyo AI Studio' },
    ],
  },
]);
assert.ok(syntheticIssues.some((issue) => issue.message.includes('Synthetic local playback path')), 'validation should reject unverified synthetic local playback paths');
assert.ok(!syntheticIssues.some((issue) => issue.message.includes('Duplicate asset')), 'validation should not dedupe or flag duplicate unverified synthetic local assets');
assert.ok(syntheticIssues.some((issue) => issue.message.includes('Expected orderIndex 2')), 'validation should detect skipped orderIndex values');

const guessedSunoIssues = validateJourneyCatalog([
  {
    journeyId: 'guessed-suno-journey',
    albumId: 'guessed-suno-album',
    title: 'Guessed Suno',
    subtitle: 'Test',
    description: 'Test journey',
    language: 'English',
    region: 'Test',
    country: 'Test',
    city: 'Test',
    genre: 'GeoAudio',
    mood: 'Curated',
    sourceAlbum: 'Guessed Suno',
    attribution: 'Ariyo AI Studio / Omoluabi Productions',
    tracks: [
      { journeyId: 'guessed-suno-journey', albumId: 'guessed-suno-album', trackId: 'guessed-suno-track-1', title: 'Covenant Of Isolation', subtitle: 'Test', description: 'Test', audioUrl: 'https://omoluabi1003.github.io/Ariyo-AI/Covenant%20Of%20Isolation.mp3', sourceUrl: 'https://omoluabi1003.github.io/Ariyo-AI/Covenant%20Of%20Isolation.mp3', originalSunoUrl: 'https://cdn1.suno.ai/7578528b-34c1-492c-9e97-df93216f0cc2.mp3', language: 'English', region: 'Test', country: 'Test', city: 'Test', genre: 'GeoAudio', mood: 'Curated', orderIndex: 1, sourceAlbum: 'Guessed Suno', attribution: 'Ariyo AI Studio' },
    ],
  },
]);
assert.ok(guessedSunoIssues.some((issue) => issue.message.includes('must play the exact manifest asset')), 'validation should fail Suno-origin playback mapped by title or filename guesswork');

assert.equal(normalizeJourneyTrackTitle('working-on myself (live version)'), 'Working on Myself (Live Version)', 'title normalization should clean punctuation, parentheses, minor words, and version suffixes');

const alternateCatalog = buildJourneyCatalog([
  {
    id: 'alternate-test',
    title: 'Alternate Test',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    city: 'Florida',
    state: 'Florida',
    country: 'United States',
    countryCode: 'US',
    latitude: 28.5383,
    longitude: -81.3792,
    tracks: [
      { title: 'Shared Song', url: 'https://suno.example/shared-song.mp3', localAssetPath: '/geoaudio/ariyo/shared-song.mp3' },
      { title: 'Shared Song Live', url: 'https://suno.example/shared-song-live.mp3', localAssetPath: '/geoaudio/ariyo/shared-song.mp3', originalSunoUrl: 'https://suno.example/shared-song-live.mp3' },
    ],
  },
]);
assert.equal(alternateCatalog[0].tracks.length, 2, 'intentional live/versioned alternates remain listed without relying on unverified local asset dedupe');


const playableSource = 'https://omoluabi1003.github.io/Ariyo-AI/Test%20Track.mp3';
assert.equal(
  resolveGeoAudioPlaybackUrl({ title: 'Test Track', url: playableSource }),
  playableSource,
  'Ariyo GitHub Pages MP3 URLs must remain final playback URLs when no verified local asset exists',
);

async function runPlaybackValidationRegression() {
  const playbackProbeResults = await validateJourneyPlaybackUrls(journeyCatalog, {
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(init?.method, 'HEAD', 'build-time playback validation should HEAD-check remote journey tracks');
      assert.ok(String(url).startsWith('https://omoluabi1003.github.io/Ariyo-AI/'), 'validation should probe playable Ariyo source URLs');
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });
  assert.equal(playbackProbeResults.length, journeyCatalog.length, 'validation should probe at least one track per journey');
  assert.deepEqual(playbackProbeResults.filter((result) => !result.ok), [], 'mocked Ariyo HEAD checks should pass');
}

void runPlaybackValidationRegression();
