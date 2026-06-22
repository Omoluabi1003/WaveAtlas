import { NextRequest, NextResponse } from 'next/server';
import { focusForPoint, radiusForZoom } from '@/lib/geo-focus';
import { startupStations } from '@/lib/startupStations';
import { rankNearbyStations } from '@/lib/station-ranking';
import { ariyoSeedStations, fallbackStations, fetchGlobalCandidateStations, fetchStations, fetchStationsForCountryIntent, isCuratedStation, isStationAvailable, logCuratedStationDiagnostic, searchCountries, type Station } from '@/lib/stations';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const rawCountryCodeParam = p.get('countryCode')?.toUpperCase() || undefined;
  const countryNameParam = p.get('country') || undefined;
  const globalTeleport = p.get('global') === 'true';
  const countryCodeParam = globalTeleport ? undefined : rawCountryCodeParam;
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  const zoom = Number(p.get('zoom') ?? (countryCodeParam ? 4 : 2));
  const requestedRadiusKm = Number(p.get('radiusKm'));
  const radiusKm = Number.isFinite(requestedRadiusKm) && requestedRadiusKm > 0 ? requestedRadiusKm : radiusForZoom(zoom);
  const limit = Math.min(globalTeleport ? 25 : 24, Math.max(1, Number(p.get('limit') ?? 5)));
  const discoveryLimit = globalTeleport ? 1500 : 500;
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
  const countryStations = focusedPlace.countryCode ? await fetchStationsForCountryIntent(resolvedCountry?.name ?? countryNameParam ?? focusedPlace.countryCode, focusedPlace.countryCode, { limit: String(discoveryLimit), pageSize: '500' }) : [];
  const globalStations = globalTeleport
    ? await fetchTeleportCandidatePool()
    : countryStations.length ? [] : await fetchStations({ limit: String(discoveryLimit), pageSize: '500', allowFallback: 'false' });
  const fallbackPool = focusedPlace.countryCode ? fallbackStations.filter((station) => station.country_code === focusedPlace.countryCode) : fallbackStations;
  const candidates = teleportMode
    ? scoreTeleportCandidates(globalStations, anchor, recent, limit)
    : globalTeleport
      ? globalStations.slice(0, limit).map((station) => ({ station, signalStrength: Math.max(station.health_score, 70), distanceKm: 0 }))
      : rankNearbyStations([...countryStations, ...globalStations, ...fallbackPool], focusedPlace, limit);
  const bestCandidate = candidates[0] ?? null;
  const teleportDebug = globalTeleport && process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_TELEPORT === 'true';
  const debug = teleportDebug ? {
    requestParams: Object.fromEntries(p.entries()),
    restrictiveFiltersIgnored: globalTeleport ? { countryCode: rawCountryCodeParam ?? null, country: countryNameParam ?? null } : null,
    anchor: anchor ? { name: anchor.name, country: anchor.country_code, continent: continent(anchor) } : null,
    candidatePoolByContinent: globalStations.reduce<Record<string, number>>((acc, station) => { const name = continent(station); acc[name] = (acc[name] ?? 0) + 1; return acc; }, {}),
    top10CandidateCountriesContinents: candidates.slice(0, 10).map((candidate) => ({ country: candidate.station.country_code, continent: continent(candidate.station), station: candidate.station.name })),
  } : undefined;
  if (debug) console.debug('[WaveAtlas Teleport API]', debug);

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
    diagnostics: { fetchedCount: countryStations.length + globalStations.length, curatedCount: [...countryStations, ...globalStations].filter(isCuratedStation).length, returnedCount: candidates.length, poolSize: candidates.length, requestedLimit: limit },
    totalReturned: candidates.length,
    ...(debug ? { debug } : {}),
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
    fetchStations({ limit: '3000', pageSize: '500', pages: '6', order: 'clicktrend', allowFallback: 'false' }),
    fetchGlobalCandidateStations(1500),
  ]);
  const seen = new Set<string>();
  return [...ariyoSeedStations, ...startupStations, ...broad, ...continentSeeded, ...fallbackStations].filter((station) => {
    const key = station.station_uuid || station.id;
    const curated = isCuratedStation(station);
    if (!station.url) { logCuratedStationDiagnostic(station, 'excluded from teleport pool: missing stream URL', 'fetchTeleportCandidatePool'); return false; }
    if (seen.has(key)) { logCuratedStationDiagnostic(station, 'excluded from teleport pool: duplicate station id already present', 'fetchTeleportCandidatePool'); return false; }
    if (!isStationAvailable(station)) return false;
    if (curated && (!station.is_active || station.failure_count > 2)) logCuratedStationDiagnostic(station, 'kept in teleport pool as curated needs_review despite health flags', 'fetchTeleportCandidatePool');
    seen.add(key);
    return true;
  });
}

function recentSet(items: string[], length: number) { return new Set(items.slice(-length).filter(Boolean)); }
function stationIdentity(station: Station) { return station.station_uuid || station.id; }
function weightedDiversePick<T extends { score: number; station: Station; distanceKm: number }>(items: T[], limit: number) {
  const selected: T[] = [];
  const remaining = [...items];
  while (selected.length < limit && remaining.length) {
    const window = remaining.slice(0, 25);
    const floor = Math.min(...window.map((item) => item.score));
    const total = window.reduce((sum, item) => sum + Math.max(1, item.score - floor + 1), 0);
    let roll = Math.random() * total;
    let pickedIndex = 0;
    for (let index = 0; index < window.length; index += 1) {
      roll -= Math.max(1, window[index].score - floor + 1);
      if (roll <= 0) { pickedIndex = index; break; }
    }
    selected.push(remaining.splice(pickedIndex, 1)[0]);
  }
  return selected;
}

function scoreTeleportCandidates(pool: Station[], anchor: Station, recent: TeleportRecent, limit: number) {
  const anchorContinent = continent(anchor);
  const anchorCity = city(anchor);
  const anchorGenre = genre(anchor);
  const anchorLanguages = languages(anchor);
  const last25Stations = recentSet(recent.stationIds, 25);
  const last10Cities = recentSet(recent.cities, 10);
  const recentContinents = recent.continents.slice(-100);
  const recentCountries = recent.countries.slice(-100);
  const recentCities = recent.cities.slice(-100);
  const recentLanguages = recent.languages.slice(-100);
  const recentGenres = recent.genres.slice(-100);
  const last5Countries = recentCountries.slice(-5);
  const last3Continents = recentContinents.slice(-3);
  const countryRunBreak = [...recentCountries].reverse().findIndex((code) => code !== anchor.country_code);
  const continentRunBreak = [...recentContinents].reverse().findIndex((name) => name !== anchorContinent);
  const sameCountryRun = countryRunBreak === -1 ? recentCountries.length : countryRunBreak;
  const sameContinentRun = continentRunBreak === -1 ? recentContinents.length : continentRunBreak;
  const hardFiltered = pool
    .filter((station) => stationIdentity(station) !== stationIdentity(anchor))
    .filter((station) => !last25Stations.has(stationIdentity(station)))
    .filter((station) => city(station) !== anchorCity)
    .filter((station) => !last10Cities.has(city(station)))
    .filter((station) => !(sameCountryRun >= 2 && station.country_code === anchor.country_code))
    .filter((station) => !(sameContinentRun >= 3 && continent(station) === anchorContinent));
  const fallbackFiltered = pool
    .filter((station) => stationIdentity(station) !== stationIdentity(anchor))
    .filter((station) => !last25Stations.has(stationIdentity(station)))
    .filter((station) => city(station) !== anchorCity)
    .filter((station) => !(sameCountryRun >= 2 && station.country_code === anchor.country_code))
    .filter((station) => !(sameContinentRun >= 3 && continent(station) === anchorContinent));
  const candidates = hardFiltered.length >= limit ? hardFiltered : fallbackFiltered;
  const scored = candidates.map((station) => {
      const stationContinent = continent(station);
      const stationCity = city(station);
      const stationGenre = genre(station);
      const stationLanguages = languages(station);
      const km = distanceKm(anchor, station);
      let score = (isCuratedStation(station) ? 55 : 0) + station.health_score * 1.25 + Math.min(45, station.bitrate / 4) + Math.min(30, station.votes / 1000) + Math.min(25, station.click_count / 4000);
      score += km ? Math.min(320, km / 32) : 35;
      if (station.country_code !== anchor.country_code) score += 260; else score -= 420;
      if (stationContinent !== anchorContinent) score += 360; else score -= 190;
      if (stationLanguages.every((language) => !anchorLanguages.includes(language))) score += 95;
      if (stationGenre !== anchorGenre) score += 95;
      if (last5Countries.includes(station.country_code)) score -= 220 + count(last5Countries, station.country_code) * 80;
      if (last3Continents.includes(stationContinent)) score -= 180 + count(last3Continents, stationContinent) * 70;
      score -= count(recentCountries, station.country_code) * 42;
      score -= count(recentContinents, stationContinent) * 28;
      score -= count(recentCities, stationCity) * 70;
      score -= stationLanguages.filter((language) => recentLanguages.includes(language)).length * 35;
      score -= count(recentGenres, stationGenre) * 35;
      score -= station.tags.filter((tag) => recent.tags.slice(-100).includes(tag.toLowerCase())).length * 18;
      return { station, score, signalStrength: Math.max(1, Math.min(99, Math.round(score / 10))), distanceKm: km, metadata: { continent: stationContinent, cityRegion: station.city || station.state || station.country, genre: stationGenre, language: station.language } };
    })
    .sort((a, b) => b.score - a.score || b.distanceKm - a.distanceKm);
  return weightedDiversePick(scored.slice(0, Math.max(25, limit * 3)), limit).map(({ score: _score, ...candidate }) => candidate);
}
