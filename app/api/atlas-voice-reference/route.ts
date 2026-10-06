import { NextResponse } from 'next/server';

const OMOLUABI_REFERENCE = 'https://raw.githubusercontent.com/Omoluabi1003/WaveAtlas/99121f3012e9e606ed02c23db42fda5844344bb9/Omoluabi%20voice.mp3';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const response = await fetch(OMOLUABI_REFERENCE, { cache: 'force-cache' });
    if (!response.ok) return NextResponse.json({ error: 'Voice reference unavailable' }, { status: 502 });
    const audio = await response.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
        'Content-Length': String(audio.byteLength),
        'X-Atlas-Voice': 'Omoluabi Paul',
        'X-Atlas-Voice-Version': '99121f3012e9e606ed02c23db42fda5844344bb9',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Voice reference unavailable' }, { status: 502 });
  }
}
