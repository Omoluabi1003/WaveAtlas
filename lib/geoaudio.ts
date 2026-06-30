import type { Station } from './stations';

export type GeoAudioTrack = {
  title: string;
  url: string;
  duration?: string;
};

export type GeoAudioAlbum = {
  id: string;
  title: string;
  artist: string;
  provider: string;
  producer: string;
  studio: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  homepage?: string;
  tracks: GeoAudioTrack[];
};

const GEOAUDIO_SEED_CHECKED_AT = '2026-06-30T00:00:00.000Z';
const FLORIDA_ANCHOR = { city: 'Florida', state: 'Florida', country: 'United States', countryCode: 'US', latitude: 28.5383, longitude: -81.3792 };

export const ariyoGeoAudioAlbums: GeoAudioAlbum[] = [
  {
    id: 'ariyo-geoaudio-kindness',
    title: 'Kindness',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/WaveAtlas/',
    tracks: [
      { title: 'Kindness', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    ],
  },
  {
    id: 'ariyo-geoaudio-officialpaulinspires',
    title: 'OfficialPaulInspires',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/WaveAtlas/',
    tracks: [
      { title: 'OfficialPaulInspires', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    ],
  },
];

function normalizeName(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function uniqueTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function adaptAriyoAlbumToGeoAudioChannel(album: GeoAudioAlbum): Station {
  const firstPlayableTrack = album.tracks.find((track) => /^https?:\/\//i.test(track.url));
  const tags = uniqueTags([
    'geoaudio',
    'GeoAudio Channel',
    'Ariyo GeoAudio',
    'Ariyo AI Studio',
    'Omoluabi Productions',
    'provider: Omoluabi Productions',
    'producer: Omoluabi Productions',
    'studio: Ariyo AI Studio',
    album.title,
    album.artist,
    album.provider,
    album.producer,
    album.studio,
    album.city,
    album.state,
    album.country,
    ...album.tracks.map((track) => track.title),
  ]);

  return {
    id: album.id,
    station_uuid: album.id,
    name: `${album.title} GeoAudio Channel — Ariyo AI Studio`,
    normalized_name: normalizeName(`${album.title} Ariyo AI Studio Omoluabi Productions`),
    url: firstPlayableTrack?.url ?? '',
    url_resolved: firstPlayableTrack?.url ?? '',
    homepage: album.homepage,
    favicon: '',
    country: album.country,
    country_code: album.countryCode,
    state: album.state,
    city: album.city,
    language: 'English',
    tags,
    codec: 'MP3',
    bitrate: 320,
    latitude: album.latitude,
    longitude: album.longitude,
    votes: 50000,
    click_count: 120000,
    health_score: 98,
    is_active: Boolean(firstPlayableTrack),
    last_check_ok: Boolean(firstPlayableTrack),
    last_checked_at: GEOAUDIO_SEED_CHECKED_AT,
    failure_count: 0,
    response_time_ms: 90,
    curation_source: 'waveatlas-geoaudio',
    curation_tier: 'curated_atlas',
    validation_status: 'verified',
    validation_reason: `Local WaveAtlas GeoAudio seed. Provider/producer: ${album.provider}. Studio: ${album.studio}. Geographic anchor: Florida, United States.`,
    sourceType: 'geoaudio',
    geoAudio: {
      albumTitle: album.title,
      artist: album.artist,
      provider: album.provider,
      producer: album.producer,
      studio: album.studio,
      tracks: album.tracks,
    },
  };
}

export const ariyoGeoAudioChannels: Station[] = ariyoGeoAudioAlbums.map(adaptAriyoAlbumToGeoAudioChannel);
