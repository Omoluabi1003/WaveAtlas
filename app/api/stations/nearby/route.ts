import { NextRequest, NextResponse } from 'next/server';
import { focusForPoint, radiusForZoom } from '@/lib/geo-focus';
import { rankNearbyStations } from '@/lib/station-ranking';
import { fallbackStations, fetchStations, fetchStationsForCountryIntent, searchCountries } from '@/lib/stations';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  const zoom = Number(p.get('zoom') ?? 4);
  const requestedRadiusKm = Number(p.get('radiusKm'));
  const radiusKm = Number.isFinite(requestedRadiusKm) && requestedRadiusKm > 0 ? requestedRadiusKm : radiusForZoom(zoom);
  const limit = Math.min(10, Math.max(1, Number(p.get('limit') ?? 5)));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'lat and lng are required valid coordinates' }, { status: 400 });
  }

  const focusedPlace = focusForPoint(lat, lng, zoom, radiusKm);
  const country = focusedPlace.countryCode ? (await searchCountries(focusedPlace.countryCode)).find((item) => item.code === focusedPlace.countryCode) : undefined;
  const countryStations = focusedPlace.countryCode ? await fetchStationsForCountryIntent(country?.name ?? focusedPlace.countryCode, focusedPlace.countryCode, { limit: '120' }) : [];
  const globalStations = countryStations.length ? [] : await fetchStations({ limit: '120', allowFallback: 'false' });
  const fallbackPool = focusedPlace.countryCode ? fallbackStations.filter((station) => station.country_code === focusedPlace.countryCode) : fallbackStations;
  const candidates = rankNearbyStations([...countryStations, ...globalStations, ...fallbackPool], focusedPlace, limit);
  const bestCandidate = candidates[0] ?? null;

  return NextResponse.json({
    focusedPlace: { ...focusedPlace, countryName: country?.name ?? focusedPlace.countryName, country },
    countryCode: focusedPlace.countryCode ?? null,
    candidates,
    bestCandidate,
    signalStrength: bestCandidate?.signalStrength ?? 0,
    searchRadiusKm: radiusKm,
    status: bestCandidate ? 'signal_found' : 'no_signal',
    // Backwards-compatible aliases for older clients.
    focus: { ...focusedPlace, countryName: country?.name ?? focusedPlace.countryName, country },
    best: bestCandidate,
    totalReturned: candidates.length,
  });
}
