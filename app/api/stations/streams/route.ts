import { NextRequest, NextResponse } from 'next/server';
import { trustedStationStreams } from '@/lib/maturity/stream-candidates-server';
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('station')?.trim();
  if (!id || id.length > 256) return NextResponse.json({ error: 'Station required' }, { status: 400 });
  const result = await trustedStationStreams(id).catch(() => null);
  return NextResponse.json(result || { error: 'Station unavailable' }, { status: result ? 200 : 404, headers: { 'Cache-Control': 'private, max-age=60' } });
}
