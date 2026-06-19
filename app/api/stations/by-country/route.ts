import { NextRequest, NextResponse } from 'next/server';
import { fetchStationsForCountryIntent, rankStations } from '@/lib/stations';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const country = p.get('country') ?? '';
  const countryCode = (p.get('countryCode') ?? '').toUpperCase();
  const limit = p.get('limit') ?? '50';
  const offset = p.get('offset') ?? '0';
  const rawStations = await fetchStationsForCountryIntent(country || countryCode, countryCode, {
    limit,
    offset,
    tag: p.get('tag') ?? undefined,
    language: p.get('language') ?? undefined,
  });
  const stations = rankStations(rawStations, country).filter((station) => station.country_code === countryCode);

  return NextResponse.json({
    query: country.trim().toLowerCase(),
    intent: 'country',
    countryCode,
    countryName: country || countryCode,
    source: `radio-browser:bycountrycodeexact/${countryCode}`,
    stations,
    totalReturned: stations.length,
    limit: Number(limit),
    offset: Number(offset),
    hasMore: stations.length >= Number(limit),
  });
}
