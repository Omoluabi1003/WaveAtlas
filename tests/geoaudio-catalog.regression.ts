import assert from 'node:assert/strict';
import {
  ariyoGeoAudioChannels,
  journeyCatalog,
  normalizeJourneyTrackTitle,
  validateJourneyCatalog,
} from '../lib/geoaudio';

const issues = validateJourneyCatalog(journeyCatalog);
assert.deepEqual(issues.filter((issue) => issue.severity === 'error'), [], 'canonical journey catalog must not contain duplicate audio references or order errors');

for (const journey of journeyCatalog) {
  assert.ok(journey.journeyId.endsWith('-journey'), `${journey.albumId} should expose a stable journeyId`);
  journey.tracks.forEach((track, index) => {
    assert.equal(track.orderIndex, index + 1, `${track.trackId} should have contiguous 1-based orderIndex`);
    assert.equal(track.title, normalizeJourneyTrackTitle(track.title), `${track.trackId} should use normalized product-ready title casing`);
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
      { journeyId: 'test-journey', albumId: 'test-album', trackId: 'test-track-1', title: 'Duplicate Track', subtitle: 'Test', description: 'Test', audioUrl: 'https://example.test/audio/duplicate.mp3', language: 'English', region: 'Test', country: 'Test', city: 'Test', genre: 'GeoAudio', mood: 'Curated', orderIndex: 1, sourceAlbum: 'Test Journey', attribution: 'Ariyo AI Studio' },
      { journeyId: 'test-journey', albumId: 'test-album', trackId: 'test-track-2', title: 'Duplicate Track Copy', subtitle: 'Test', description: 'Test', audioUrl: 'https://example.test/audio/duplicate.mp3', language: 'English', region: 'Test', country: 'Test', city: 'Test', genre: 'GeoAudio', mood: 'Curated', orderIndex: 3, sourceAlbum: 'Test Journey', attribution: 'Ariyo AI Studio' },
    ],
  },
]);
assert.ok(syntheticIssues.some((issue) => issue.message.includes('Duplicate audioUrl')), 'validation should detect duplicate audio URLs');
assert.ok(syntheticIssues.some((issue) => issue.message.includes('Expected orderIndex 2')), 'validation should detect skipped orderIndex values');
