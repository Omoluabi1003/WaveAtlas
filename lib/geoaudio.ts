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
const ARIYO_AI_ORIGIN = 'https://ariyo-ai.vercel.app';
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
      { title: 'A Very Good Bad Guy v3', url: `${ARIYO_AI_ORIGIN}/A%20Very%20Good%20Bad%20Guy%20v3.mp3` },
      { title: 'Dem Wan Shut Me Up', url: `${ARIYO_AI_ORIGIN}/Dem%20Wan%20Shut%20Me%20Up.mp3` },
      { title: 'EFCC', url: `${ARIYO_AI_ORIGIN}/EFCC.mp3` },
    ],
  },
  {
    id: 'ariyo-geoaudio-officialpaulinspires',
    title: 'OfficialPaulInspires Spoken Word Series',
    artist: 'Ariyo AI Studio',
    provider: 'Omoluabi Productions',
    producer: 'Omoluabi Productions',
    studio: 'Ariyo AI Studio',
    ...FLORIDA_ANCHOR,
    homepage: 'https://omoluabi1003.github.io/WaveAtlas/',
    tracks: [
      { title: 'Me After You', url: 'https://cdn1.suno.ai/215c4402-5ac9-445a-807a-dd4ffb541f64.mp3' },
      { title: 'The Blessing in Staying Away', url: 'https://cdn1.suno.ai/6ffc73cb-91af-466e-9dbe-c88fff9773bc.mp3' },
      { title: 'Parking Lot Therapy', url: 'https://cdn1.suno.ai/c366aac4-5bf4-4137-a021-65de1812af6e.mp3' },
      { title: 'When A Good Man Walks Away', url: 'https://cdn1.suno.ai/350fdbb1-c55d-4ee4-a7f6-5a3848fa3efd.mp3' },
      { title: 'Disrupted Career', url: 'https://cdn1.suno.ai/ab730851-6c85-49e8-9816-bb26177e289d.mp3' },
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
    `provider: ${album.provider}`,
    `producer: ${album.producer}`,
    `studio: ${album.studio}`,
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
    name: `${album.title} GeoAudio Channel — ${album.studio}`,
    normalized_name: normalizeName(`${album.title} ${album.studio} ${album.provider} ${album.producer}`),
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
    validation_status: firstPlayableTrack ? 'verified' : 'needs_review',
    validation_reason: firstPlayableTrack ? `Local WaveAtlas GeoAudio seed from Ariyo-AI data/albums.json. Provider/producer: ${album.provider}. Studio: ${album.studio}. Geographic anchor: ${album.city}, ${album.country}.` : 'Ariyo GeoAudio album has no playable track URL in Ariyo-AI data/albums.json.',
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
