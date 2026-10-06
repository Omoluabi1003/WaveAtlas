import { NextRequest, NextResponse } from 'next/server';

const POCKET_TTS_COMMIT = '7d7a27423b0845eb0425c81a8aa5ed3f3d973eef';
const ALLOWED = new Set(['worker.js', 'tokenizer.js', 'binary.js']);

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (!ALLOWED.has(file)) return new NextResponse('Not found', { status: 404 });

  const upstream = `https://raw.githubusercontent.com/vlapky/pocket-tts-js/${POCKET_TTS_COMMIT}/src/${file}`;
  try {
    const response = await fetch(upstream, { next: { revalidate: 604800 } });
    if (!response.ok) return new NextResponse('Pocket TTS runtime unavailable', { status: 502 });
    const source = await response.text();
    return new NextResponse(source, {
      status: 200,
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Atlas-Vendor': `pocket-tts-js@${POCKET_TTS_COMMIT.slice(0, 12)}`,
      },
    });
  } catch {
    return new NextResponse('Pocket TTS runtime unavailable', { status: 502 });
  }
}
