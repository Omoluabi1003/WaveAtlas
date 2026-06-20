import { fetchStations, validateStream } from '@/lib/stations';

export type SignalSubmissionInput = {
  station_name: string;
  stream_url: string;
  city?: string;
  country?: string;
  genre?: string;
  language?: string;
  station_website?: string;
  submitted_by?: string;
  submitter_email_optional?: string;
  notes_optional?: string;
};

export type SignalReviewStatus = 'pending' | 'verified' | 'rejected' | 'duplicate' | 'needs_review';

export type SignalReviewResult = {
  status: SignalReviewStatus;
  quality_score: number;
  duplicate_candidates: Array<{ name: string; country: string; stream_url: string }>;
  validation: Awaited<ReturnType<typeof validateStream>> & { resolved_stream_url?: string; playlist_followed?: boolean };
  normalized_station: {
    name: string;
    url: string;
    homepage?: string;
    country: string;
    city?: string;
    language: string;
    tags: string[];
    codec: string;
    bitrate: number;
    health_score: number;
    is_active: boolean;
  };
  recommendation: string;
};

const AUDIO_OR_PLAYLIST_PATTERN = /audio|mpeg|ogg|aac|mp3|x-scpls|mpegurl|vnd\.apple\.mpegurl|octet-stream|text\/plain/i;
const PLAYLIST_PATTERN = /(?:\.m3u8?|\.pls)(?:[?#].*)?$/i;

function normalizeUrl(value = '') {
  return value.trim().replace(/\/$/, '').toLowerCase();
}

function normalizeName(value = '') {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function splitTags(input: SignalSubmissionInput) {
  return [input.genre, input.language, input.city, input.country]
    .flatMap((item) => (item ?? '').split(','))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 8);
}

async function followPlaylistIfSafe(url: string) {
  if (!PLAYLIST_PATTERN.test(new URL(url).pathname)) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'WaveAtlas Signal Review Agent/1.0' } });
    if (!res.ok) return undefined;
    const body = (await res.text()).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    return body.find((line) => /^https?:\/\//i.test(line));
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function reviewSignalSubmission(input: SignalSubmissionInput): Promise<SignalReviewResult> {
  const streamUrl = input.stream_url.trim();
  let parsed: URL;
  try {
    parsed = new URL(streamUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
  } catch {
    const validation = await validateStream('invalid://signal');
    return {
      status: 'rejected',
      quality_score: 0,
      duplicate_candidates: [],
      validation,
      normalized_station: {
        name: input.station_name.trim() || 'Unknown station',
        url: streamUrl,
        homepage: input.station_website?.trim() || undefined,
        country: input.country?.trim() || 'Unknown',
        city: input.city?.trim() || undefined,
        language: input.language?.trim() || 'Unknown',
        tags: splitTags(input),
        codec: 'Unknown',
        bitrate: 0,
        health_score: 0,
        is_active: false,
      },
      recommendation: 'Reject for now: the submitted stream URL is not a safe HTTP(S) URL.',
    };
  }

  const playlistTarget = await followPlaylistIfSafe(streamUrl);
  const validationUrl = playlistTarget ?? streamUrl;
  const validation = { ...(await validateStream(validationUrl)), resolved_stream_url: validationUrl, playlist_followed: Boolean(playlistTarget) };
  const duplicateSearch = await fetchStations({ q: input.station_name || input.country || '', limit: '25', allowFallback: 'true' }).catch(() => []);
  const submittedUrl = normalizeUrl(validationUrl);
  const submittedName = normalizeName(input.station_name);
  const duplicate_candidates = duplicateSearch
    .filter((station) => {
      const stationUrl = normalizeUrl(station.url_resolved || station.url);
      const stationName = normalizeName(station.name);
      return stationUrl === submittedUrl || Boolean(submittedName && stationName && (stationName === submittedName || stationName.includes(submittedName) || submittedName.includes(stationName)));
    })
    .slice(0, 5)
    .map((station) => ({ name: station.name, country: station.country, stream_url: station.url_resolved || station.url }));

  const contentTypeOk = AUDIO_OR_PLAYLIST_PATTERN.test(validation.content_type ?? '');
  const metadataScore = [input.station_name, input.city, input.country, input.genre, input.language, input.station_website].filter((value) => value?.trim()).length * 5;
  const quality_score = Math.max(0, Math.min(100, Math.round((validation.is_active ? 50 : 10) + (contentTypeOk ? 15 : 0) + metadataScore - (duplicate_candidates.length ? 20 : 0))));
  const status: SignalReviewStatus = duplicate_candidates.length ? 'duplicate' : validation.is_active && contentTypeOk ? 'verified' : validation.is_active ? 'needs_review' : 'rejected';

  return {
    status,
    quality_score,
    duplicate_candidates,
    validation,
    normalized_station: {
      name: input.station_name.trim(),
      url: validationUrl,
      homepage: input.station_website?.trim() || undefined,
      country: input.country?.trim() || 'Unknown',
      city: input.city?.trim() || undefined,
      language: input.language?.trim() || 'Unknown',
      tags: splitTags(input),
      codec: validation.content_type?.includes('mpeg') || validation.content_type?.includes('mp3') ? 'MP3' : 'Unknown',
      bitrate: 0,
      health_score: validation.health_score,
      is_active: validation.is_active,
    },
    recommendation: status === 'verified'
      ? 'Recommend admin review and approval. Do not publish until an admin adds approved-signal.'
      : status === 'duplicate'
        ? 'Likely duplicate. Admin should compare candidate streams before approval.'
        : status === 'needs_review'
          ? 'Needs manual review: stream responded, but content type was not clearly audio.'
          : 'Reject or ask submitter for a working direct audio or playlist URL.',
  };
}
