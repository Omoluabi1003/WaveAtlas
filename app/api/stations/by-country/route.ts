import { NextRequest, NextResponse } from 'next/server';
import { fetchStationsForCountryIntent } from '@/lib/stations';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const country = p.get('country') ?? '';
  const countryCode = p.get('countryCode') ?? '';
  const limit = p.get('limit') ?? '50';
  const offset = p.get('offset') ?? '0';
  const stations = await fetchStationsForCountryIntent(country || countryCode, countryCode, {
    limit,
    offset,
    tag: p.get('tag') ?? undefined,
    language: p.get('language') ?? undefined,
  });

  return NextResponse.json({
    stations,
    limit: Number(limit),
    offset: Number(offset),
    hasMore: stations.length >= Number(limit),
  });
}
