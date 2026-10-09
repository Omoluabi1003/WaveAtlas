import type { Station } from '../stations';
// Sources checked against broadcaster players; city coordinates describe the
// broadcast destination, not an FM transmitter or listener position.
const inputs = [
  { id: 'atlas-dj-radio-dubai', name: 'DJ Radio Dubai', url: 'https://listen.radioking.com/radio/623812/stream/685903', homepage: 'https://www.djradio.ae/', country: 'United Arab Emirates', country_code: 'AE', city: 'Dubai', latitude: 25.2048, longitude: 55.2708, language: 'English', tags: ['electronic', 'dance', 'dj', 'uae', 'dubai'] },
  { id: 'atlas-hi-fm-oman', name: 'Hi FM Oman', url: 'https://listen-hifmtemp.sharp-stream.com/hifmmid.mp3', homepage: 'https://www.hifmradio.com/player/', country: 'Oman', country_code: 'OM', city: 'Muscat', latitude: 23.588, longitude: 58.3829, language: 'English', tags: ['pop', 'hit music'] },
  { id: 'atlas-so-radio-oman', name: 'So! Radio Oman', url: 'https://listen-soradio.sharp-stream.com/soradio_high.mp3', homepage: 'https://www.soradiooman.com/player/', country: 'Oman', country_code: 'OM', city: 'Muscat', latitude: 23.588, longitude: 58.3829, language: 'English', tags: ['rock'] },
  { id: 'atlas-suno-qatar', name: 'Radio Suno 91.7 Qatar', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SUNO917.mp3', homepage: 'https://suno.qa/', country: 'Qatar', country_code: 'QA', city: 'Doha', latitude: 25.2854, longitude: 51.531, language: 'Malayalam', tags: ['suno', 'music', 'talk'] },
  { id: 'atlas-alifalif-saudi', name: 'Alif Alif FM Saudi Arabia', url: 'https://alifalifjobs.com/radio/8000/AlifAlifLive.mp3', homepage: 'https://www.alifaliffm.com/', country: 'Saudi Arabia', country_code: 'SA', city: 'Riyadh', latitude: 24.7136, longitude: 46.6753, language: 'Arabic', tags: ['arabic', 'music', 'talk'] },
  { id: 'atlas-saudi-quran', name: 'Saudi Quran Radio', url: 'https://stream.radiojar.com/0tpy1h0kxtzuv', homepage: 'https://www.aloula.sa/ar/live/quranradio', country: 'Saudi Arabia', country_code: 'SA', city: 'Riyadh', latitude: 24.7136, longitude: 46.6753, language: 'Arabic', tags: ['quran', 'religious'] },
  { id: 'atlas-mazaj-jordan', name: 'Mazaj FM Jordan', url: 'https://mazajfm.ice.infomaniak.ch/mazajfm-192.mp3', homepage: 'https://www.mazaj.fm/', country: 'Jordan', country_code: 'JO', city: 'Amman', latitude: 31.9539, longitude: 35.9106, language: 'Arabic', tags: ['music', 'arabic'] },
  { id: 'atlas-mood-jordan', name: 'Mood FM 92 Amman', url: 'https://securestreams2.autopo.st:1241/live', homepage: 'https://www.mood.fm/', country: 'Jordan', country_code: 'JO', city: 'Amman', latitude: 31.9539, longitude: 35.9106, language: 'English', tags: ['music', 'mood'] },
  { id: 'atlas-voice-lebanon', name: 'Voice of Lebanon', url: 'https://l3.itworkscdn.net/itwaudio/9054/stream', homepage: 'https://www.vdl.me/', country: 'Lebanon', country_code: 'LB', city: 'Beirut', latitude: 33.8938, longitude: 35.5018, language: 'Arabic', tags: ['news', 'talk'] },
];
export const middleEastStations: Station[] = inputs.map(input => ({
  ...input, station_uuid: input.id, url_resolved: input.url, codec: 'MP3', bitrate: 0,
  tags: [...input.tags, 'middle east', 'middle eastern', 'live radio', 'waveatlas-curated'],
  votes: 0, click_count: 0, health_score: 85, is_active: true, last_check_ok: true,
  last_checked_at: '2026-10-09T17:00:00Z', failure_count: 0, response_time_ms: 0,
  curation_tier: 'curated_atlas', curation_source: 'Broadcaster player / audio byte check',
  verification_status: 'verified', validation_status: 'verified',
  validation_reason: 'Direct HTTPS stream returned audio bytes on 2026-10-09. Availability may vary by broadcaster and listener region.',
}));

// Authoritative identity overrides prevent directory entries with the same
// name from sending listeners to U105 or Virgin Radio UK. Geographic blocks
// remain visible and are never bypassed by substituting an unrelated station.
for (const [id, name, url, homepage] of [
  ['atlas-dubai-eye', 'Dubai Eye 103.8', 'https://stream.radiojar.com/shcthrfbsxquv', 'https://www.dubaieye1038.com/player/'],
  ['atlas-virgin-dubai', 'Virgin Radio Dubai 104.4 FM', 'https://stream.radiojar.com/nhq0vcqwuueuv', 'https://www.virginradiodubai.com/listen/'],
]) middleEastStations.push({ id, station_uuid: id, name, url, url_resolved: url, homepage, country: 'United Arab Emirates', country_code: 'AE', city: 'Dubai', latitude: 25.2048, longitude: 55.2708, language: 'English', tags: ['middle east', 'dubai', 'uae', 'waveatlas-curated'], codec: 'MP3', bitrate: 0, votes: 0, click_count: 0, health_score: 30, is_active: false, last_check_ok: false, last_checked_at: '2026-10-09T17:00:00Z', failure_count: 0, response_time_ms: 0, curation_tier: 'curated_atlas', curation_source: 'Official broadcaster player', verification_status: 'candidate', validation_status: 'needs_review', validation_reason: 'Official stream returned HTTP 401 from this test location. Broadcaster regional restrictions may apply.' });
