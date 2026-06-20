import { NextRequest, NextResponse } from 'next/server';
import { focusForPoint, radiusForZoom } from '@/lib/geo-focus';
import { rankNearbyStations } from '@/lib/station-ranking';
import { fallbackStations, fetchStations, fetchStationsForCountryIntent, searchCountries } from '@/lib/stations';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  const zoom = Number(p.get('zoom') ?? 4);
  const radiusKm = Number(p.get('radiusKm') ?? radiusForZoom(zoom));
  const limit = Math.min(10, Math.max(1, Number(p.get('limit') ?? 5)));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'lat and lng are required valid coordinates' }, { status: 400 });
  }
  const focus = focusForPoint(lat, lng, zoom, radiusKm);
  const country = focus.countryCode ? (await searchCountries(focus.countryCode)).find((item) => item.code === focus.countryCode) : undefined;
  const countryStations = focus.countryCode ? await fetchStationsForCountryIntent(country?.name ?? focus.countryCode, focus.countryCode, { limit: '80' }) : [];
  const globalStations = countryStations.length ? [] : await fetchStations({ limit: '80', allowFallback: 'true' });
  const candidates = rankNearbyStations([...countryStations, ...globalStations, ...fallbackStations], focus, limit);
  return NextResponse.json({ focus: { ...focus, countryName: country?.name ?? focus.countryName, country }, candidates, best: candidates[0] ?? null, totalReturned: candidates.length });
}
