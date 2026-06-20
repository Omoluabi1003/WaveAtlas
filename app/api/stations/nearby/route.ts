import { NextRequest, NextResponse } from 'next/server';
import { focusForPoint, radiusForZoom } from '@/lib/geo-focus';
import { rankNearbyStations } from '@/lib/station-ranking';
import { fallbackStations, fetchGlobalCandidateStations, fetchStations, fetchStationsForCountryIntent, searchCountries } from '@/lib/stations';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const countryCodeParam = p.get('countryCode')?.toUpperCase() || undefined;
  const countryNameParam = p.get('country') || undefined;
  const globalScan = p.get('global') === 'true';
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  const zoom = Number(p.get('zoom') ?? (countryCodeParam ? 4 : 2));
  const requestedRadiusKm = Number(p.get('radiusKm'));
  const radiusKm = Number.isFinite(requestedRadiusKm) && requestedRadiusKm > 0 ? requestedRadiusKm : radiusForZoom(zoom);
  const limit = Math.min(10, Math.max(1, Number(p.get('limit') ?? 5)));

  if (!globalScan && !countryCodeParam && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
    return NextResponse.json({ error: 'lat/lng, countryCode, or global=true is required' }, { status: 400 });
  }

  const country = countryCodeParam ? (await searchCountries(countryCodeParam)).find((item) => item.code === countryCodeParam) : undefined;
  const focusedPlace = countryCodeParam && country
    ? { lat: country.centroid.lat, lng: country.centroid.lng, zoom, radiusKm: 1600, countryCode: country.code, countryName: country.name, label: `${country.name} signal area`, mode: 'country' as const }
    : globalScan
      ? { lat: 20, lng: 0, zoom: 1.5, radiusKm: 20000, label: 'Global signal scan', mode: 'world' as const }
      : focusForPoint(lat, lng, zoom, radiusKm);
  const resolvedCountry = focusedPlace.countryCode ? (country ?? (await searchCountries(focusedPlace.countryCode)).find((item) => item.code === focusedPlace.countryCode)) : undefined;
  const countryStations = focusedPlace.countryCode ? await fetchStationsForCountryIntent(resolvedCountry?.name ?? countryNameParam ?? focusedPlace.countryCode, focusedPlace.countryCode, { limit: '120' }) : [];
  const globalStations = globalScan ? await fetchGlobalCandidateStations(4) : countryStations.length ? [] : await fetchStations({ limit: '120', allowFallback: 'false' });
  const fallbackPool = focusedPlace.countryCode ? fallbackStations.filter((station) => station.country_code === focusedPlace.countryCode) : fallbackStations;
  const candidates = globalScan
    ? globalStations.slice(0, limit).map((station) => ({ station, signalStrength: Math.max(station.health_score, 70), distanceKm: 0 }))
    : rankNearbyStations([...countryStations, ...globalStations, ...fallbackPool], focusedPlace, limit);
  const bestCandidate = candidates[0] ?? null;

  return NextResponse.json({
    focusedPlace: { ...focusedPlace, countryName: resolvedCountry?.name ?? focusedPlace.countryName, country: resolvedCountry },
    countryCode: focusedPlace.countryCode ?? null,
    candidates,
    bestCandidate,
    signalStrength: bestCandidate?.signalStrength ?? 0,
    searchRadiusKm: focusedPlace.radiusKm,
    status: bestCandidate ? 'signal_found' : 'no_signal',
    focus: { ...focusedPlace, countryName: resolvedCountry?.name ?? focusedPlace.countryName, country: resolvedCountry },
    best: bestCandidate,
    totalReturned: candidates.length,
  });
}
