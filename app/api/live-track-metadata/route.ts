import { NextResponse } from 'next/server';
import type { LiveTrackMetadata } from '@/lib/live-track-metadata-engine';

const PROVIDER = process.env.LIVE_TRACK_METADATA_PROVIDER ?? 'disabled';
const AUDD_TOKEN = process.env.AUDD_API_TOKEN;
const ACRCLOUD_ENDPOINT = process.env.ACRCLOUD_IDENTIFY_ENDPOINT;
const ACRCLOUD_API_KEY = process.env.ACRCLOUD_API_KEY;

function enabled() {
  return process.env.NEXT_PUBLIC_WAVEATLAS_LIVE_TRACK_METADATA === 'true' && process.env.WAVEATLAS_LIVE_TRACK_METADATA_SERVER !== 'false';
}

function safeYear(value?: string) {
  const year = value?.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? Number(year) : undefined;
}

function toMetadata(result: Record<string, unknown>, provider: string, stationKey: string): LiveTrackMetadata | null {
  const title = typeof result.title === 'string' ? result.title : undefined;
  const artist = typeof result.artist === 'string' ? result.artist : undefined;
  if (!title || !artist) return null;
  const album = typeof result.album === 'string' ? result.album : undefined;
  const releaseDate = typeof result.release_date === 'string' ? result.release_date : undefined;
  const spotify = result.spotify as { album?: { images?: Array<{ url?: string }> } } | undefined;
  const coverArtUrl = spotify?.album?.images?.[0]?.url;
  return {
    title,
    artist,
    album,
    releaseYear: safeYear(releaseDate),
    coverArtUrl,
    isrc: typeof result.isrc === 'string' ? result.isrc : undefined,
    confidence: typeof result.score === 'number' ? Math.min(1, Math.max(0, result.score / 100)) : 0.86,
    provider,
    recognizedAt: new Date().toISOString(),
    stationKey,
  };
}

async function recognizeWithAudD(streamUrl: string, stationKey: string) {
  if (!AUDD_TOKEN) return null;
  const body = new FormData();
  body.set('api_token', AUDD_TOKEN);
  body.set('url', streamUrl);
  body.set('return', 'spotify');
  const response = await fetch('https://api.audd.io/', { method: 'POST', body, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`AudD ${response.status}`);
  const payload = await response.json() as { status?: string; result?: Record<string, unknown> };
  return payload.status === 'success' && payload.result ? toMetadata(payload.result, 'AudD', stationKey) : null;
}

async function recognizeWithAcrCloud(streamUrl: string, stationKey: string) {
  if (!ACRCLOUD_ENDPOINT || !ACRCLOUD_API_KEY) return null;
  const response = await fetch(ACRCLOUD_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACRCLOUD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ streamUrl }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`ACRCloud ${response.status}`);
  const payload = await response.json() as { metadata?: { music?: Record<string, unknown>[] } };
  const result = payload.metadata?.music?.[0];
  if (!result) return null;
  const artists = Array.isArray(result.artists) ? result.artists as Array<{ name?: string }> : [];
  return toMetadata({
    title: result.title,
    artist: artists.map((artist) => artist.name).filter(Boolean).join(', '),
    album: (result.album as { name?: string } | undefined)?.name,
    release_date: result.release_date,
    isrc: (result.external_ids as { isrc?: string } | undefined)?.isrc,
    score: result.score,
  }, 'ACRCloud', stationKey);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const streamUrl = searchParams.get('streamUrl') || '';
  const stationKey = searchParams.get('stationKey') || 'unknown-station';
  if (!enabled()) return NextResponse.json({ status: 'unsupported', message: 'Live track metadata is disabled by feature flag.' });
  if (!/^https:\/\//i.test(streamUrl)) return NextResponse.json({ status: 'unsupported', message: 'Recognition requires an HTTPS stream URL.' });
  try {
    const metadata = PROVIDER.toLowerCase() === 'acrcloud'
      ? await recognizeWithAcrCloud(streamUrl, stationKey)
      : await recognizeWithAudD(streamUrl, stationKey);
    if (!metadata) return NextResponse.json({ status: 'unrecognized', message: 'Provider returned no confident song match.' });
    return NextResponse.json({ status: 'recognized', metadata });
  } catch (error) {
    console.warn('[WaveAtlas live metadata] recognition failed', error);
    return NextResponse.json({ status: 'unrecognized', message: 'Recognition provider could not identify this segment.' });
  }
}
