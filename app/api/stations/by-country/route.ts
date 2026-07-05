import { NextRequest, NextResponse } from 'next/server';
import { fetchStationsForCountryIntent, rankStations } from '@/lib/stations';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const country = p.get('country') ?? '';
  const countryCode = (p.get('countryCode') ?? '').toUpperCase();
  const limit = p.get('limit') ?? '500';
  const offset = p.get('offset') ?? '0';
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  const clickLatLng = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
  const requestUrl = `/api/stations/by-country?${p.toString()}`;
  if (process.env.NODE_ENV !== 'production') console.info('[WaveAtlas Country Click API] request', { requestUrl, country, countryCode });
  const rawStations = await fetchStationsForCountryIntent(country || countryCode, countryCode, {
    limit,
    offset,
    tag: p.get('tag') ?? undefined,
    language: p.get('language') ?? undefined,
    strictCountryMatch: true,
    excludeDefaultFallback: true,
    clickLatLng,
  });
  const stations = rankStations(rawStations, country).filter((station) => !countryCode || station.country_code === countryCode);
  if (process.env.NODE_ENV !== 'production') console.info('[WaveAtlas Country Click API] candidates', { requestUrl, country, countryCode, candidateCount: stations.length, selectedStation: stations[0]?.name ?? null });

  return NextResponse.json({
    diagnostics: { fetchedCount: rawStations.length, filteredCount: rawStations.length - stations.length, returnedCount: stations.length, filterReasons: countryCode ? { country_mismatch: rawStations.length - stations.length } : {} },
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
