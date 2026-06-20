import { NextRequest, NextResponse } from 'next/server';
import { focusForPoint, radiusForZoom } from '@/lib/geo-focus';
import { rankNearbyStations } from '@/lib/station-ranking';
import { ariyoSeedStations, fallbackStations, fetchGlobalCandidateStations, fetchStations, fetchStationsForCountryIntent, isCuratedStation, logCuratedStationDiagnostic, searchCountries, type Station } from '@/lib/stations';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const countryCodeParam = p.get('countryCode')?.toUpperCase() || undefined;
  const countryNameParam = p.get('country') || undefined;
  const globalTeleport = p.get('global') === 'true';
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  const zoom = Number(p.get('zoom') ?? (countryCodeParam ? 4 : 2));
  const requestedRadiusKm = Number(p.get('radiusKm'));
  const radiusKm = Number.isFinite(requestedRadiusKm) && requestedRadiusKm > 0 ? requestedRadiusKm : radiusForZoom(zoom);
  const limit = Math.min(24, Math.max(1, Number(p.get('limit') ?? 5)));
  const anchor = parseStationParam(p.get('anchor'));
  const recent = parseRecentParam(p.get('recent'));
  const teleportMode = globalTeleport && anchor;

  if (!globalTeleport && !countryCodeParam && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
    return NextResponse.json({ error: 'lat/lng, countryCode, or global=true is required' }, { status: 400 });
  }

  const country = countryCodeParam ? (await searchCountries(countryCodeParam)).find((item) => item.code === countryCodeParam) : undefined;
  const focusedPlace = countryCodeParam && country
    ? { lat: country.centroid.lat, lng: country.centroid.lng, zoom, radiusKm: 1600, countryCode: country.code, countryName: country.name, label: `${country.name} signal area`, mode: 'country' as const }
    : globalTeleport
      ? { lat: 20, lng: 0, zoom: 1.5, radiusKm: 20000, label: 'Global audio teleport', mode: 'world' as const }
      : focusForPoint(lat, lng, zoom, radiusKm);
  const resolvedCountry = focusedPlace.countryCode ? (country ?? (await searchCountries(focusedPlace.countryCode)).find((item) => item.code === focusedPlace.countryCode)) : undefined;
  const countryStations = focusedPlace.countryCode ? await fetchStationsForCountryIntent(resolvedCountry?.name ?? countryNameParam ?? focusedPlace.countryCode, focusedPlace.countryCode, { limit: '120' }) : [];
  const globalStations = globalTeleport
    ? await fetchTeleportCandidatePool()
    : countryStations.length ? [] : await fetchStations({ limit: '120', allowFallback: 'false' });
  const fallbackPool = focusedPlace.countryCode ? fallbackStations.filter((station) => station.country_code === focusedPlace.countryCode) : fallbackStations;
  const candidates = teleportMode
    ? scoreTeleportCandidates(globalStations, anchor, recent, limit)
    : globalTeleport
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


const CONTINENT_BY_COUNTRY: Record<string, string> = { NG:'Africa', GH:'Africa', ZA:'Africa', KE:'Africa', EG:'Africa', MA:'Africa', SN:'Africa', TZ:'Africa', UG:'Africa', CM:'Africa', CD:'Africa', CG:'Africa', AO:'Africa', DZ:'Africa', BJ:'Africa', TG:'Africa', CI:'Africa', BW:'Africa', ZW:'Africa', NA:'Africa', MZ:'Africa', SL:'Africa', LR:'Africa', GA:'Africa', CV:'Africa', GB:'Europe', FR:'Europe', DE:'Europe', NL:'Europe', ES:'Europe', IT:'Europe', SE:'Europe', NO:'Europe', IE:'Europe', CH:'Europe', BE:'Europe', PT:'Europe', DK:'Europe', FI:'Europe', PL:'Europe', GR:'Europe', RU:'Europe', UA:'Europe', JP:'Asia', IN:'Asia', SG:'Asia', KR:'Asia', ID:'Asia', PH:'Asia', AE:'Asia', CN:'Asia', TH:'Asia', MY:'Asia', SA:'Asia', QA:'Asia', IL:'Asia', TR:'Asia', VN:'Asia', PK:'Asia', AU:'Oceania', NZ:'Oceania', FJ:'Oceania', PG:'Oceania', US:'North America', CA:'North America', MX:'North America', CU:'North America', JM:'North America', DO:'North America', BR:'South America', AR:'South America', CL:'South America', CO:'South America', PE:'South America', UY:'South America' };

type TeleportRecent = { countries: string[]; continents: string[]; cities: string[]; languages: string[]; genres: string[]; tags: string[]; stationIds: string[] };

function parseStationParam(value: string | null): Station | null { if (!value) return null; try { return JSON.parse(value) as Station; } catch { return null; } }
function parseRecentParam(value: string | null): TeleportRecent { const empty = { countries: [], continents: [], cities: [], languages: [], genres: [], tags: [], stationIds: [] }; if (!value) return empty; try { return { ...empty, ...(JSON.parse(value) as Partial<TeleportRecent>) }; } catch { return empty; } }
function continent(station: Station) { return CONTINENT_BY_COUNTRY[station.country_code] ?? 'Global'; }
function city(station: Station) { return (station.city || station.state || station.country || '').trim().toLowerCase(); }
function genre(station: Station) { return (station.tags.find(Boolean) || 'unknown').toLowerCase(); }
function languages(station: Station) { return station.language.toLowerCase().split(/[,/]/).map((item) => item.trim()).filter(Boolean); }
function distanceKm(a: Station, b: Station) { if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return 0; const toRad = (value: number) => value * Math.PI / 180; const dLat = toRad(b.latitude - a.latitude); const dLng = toRad(b.longitude - a.longitude); const lat1 = toRad(a.latitude); const lat2 = toRad(b.latitude); const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2; return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))); }
function count(items: string[], value: string) { return items.filter((item) => item === value).length; }

async function fetchTeleportCandidatePool() {
  const [broad, continentSeeded] = await Promise.all([
    fetchStations({ limit: '1000', order: 'clicktrend', allowFallback: 'false' }),
    fetchGlobalCandidateStations(40),
  ]);
  const seen = new Set<string>();
  return [...ariyoSeedStations, ...broad, ...continentSeeded, ...fallbackStations].filter((station) => {
    const key = station.station_uuid || station.id;
    const curated = isCuratedStation(station);
    if (!station.url) { logCuratedStationDiagnostic(station, 'excluded from teleport pool: missing stream URL', 'fetchTeleportCandidatePool'); return false; }
    if (seen.has(key)) { logCuratedStationDiagnostic(station, 'excluded from teleport pool: duplicate station id already present', 'fetchTeleportCandidatePool'); return false; }
    if (!curated && (!station.is_active || station.failure_count > 2)) return false;
    if (curated && (!station.is_active || station.failure_count > 2)) logCuratedStationDiagnostic(station, 'kept in teleport pool as curated needs_review despite health flags', 'fetchTeleportCandidatePool');
    seen.add(key);
    return true;
  });
}

function scoreTeleportCandidates(pool: Station[], anchor: Station, recent: TeleportRecent, limit: number) {
  const anchorContinent = continent(anchor);
  const anchorCity = city(anchor);
  const anchorGenre = genre(anchor);
  const anchorLanguages = languages(anchor);
  const recentContinents = recent.continents.slice(-100);
  const recentCountries = recent.countries.slice(-100);
  const recentCities = recent.cities.slice(-100);
  const lastCountryRun = recentCountries.slice(-2).filter((code) => code === anchor.country_code).length;
  const lastContinentRun = recentContinents.slice(-3).filter((name) => name === anchorContinent).length;
  return pool
    .filter((station) => station.id !== anchor.id && station.station_uuid !== anchor.station_uuid)
    .filter((station) => city(station) !== anchorCity)
    .filter((station) => !(lastCountryRun >= 2 && station.country_code === anchor.country_code))
    .filter((station) => !(lastContinentRun >= 3 && continent(station) === anchorContinent))
    .map((station) => {
      const stationContinent = continent(station);
      const stationCity = city(station);
      const stationGenre = genre(station);
      const stationLanguages = languages(station);
      const km = distanceKm(anchor, station);
      let score = (isCuratedStation(station) ? 35 : 0) + station.health_score * 2 + Math.min(80, station.bitrate / 2) + Math.min(45, station.votes / 500) + Math.min(35, station.click_count / 2000);
      score += km ? Math.min(220, km / 45) : 25;
      if (station.country_code !== anchor.country_code) score += 180; else score -= 280;
      if (stationContinent !== anchorContinent) score += 220; else score -= 140;
      if (stationLanguages.every((language) => !anchorLanguages.includes(language))) score += 70;
      if (stationGenre !== anchorGenre) score += 70;
      score -= count(recentCountries, station.country_code) * 80;
      score -= count(recentContinents, stationContinent) * 45;
      score -= count(recentCities, stationCity) * 70;
      score -= count(recent.genres.slice(-100), stationGenre) * 35;
      score -= station.tags.filter((tag) => recent.tags.slice(-100).includes(tag.toLowerCase())).length * 25;
      if (recent.stationIds.includes(station.station_uuid || station.id)) score -= 1000;
      return { station, signalStrength: Math.max(1, Math.min(99, Math.round(score / 10))), distanceKm: km, metadata: { continent: stationContinent, cityRegion: station.city || station.state || station.country, genre: stationGenre, language: station.language } };
    })
    .sort((a, b) => b.signalStrength - a.signalStrength || b.distanceKm - a.distanceKm)
    .slice(0, limit);
}
