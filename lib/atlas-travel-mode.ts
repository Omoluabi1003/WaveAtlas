import { buildAtlasCorridor, type AtlasCorridor, type CorridorPoint, type CorridorStation } from './atlas-corridor-intelligence';
import { journeyFromStation, journeyTrack, type JourneyRoute } from './atlas-journey';
import { stationDiscoveryEligible } from './agents/station-health-policy';
import type { Station } from './stations';
import { fetchValhallaRoute, type RouteMode } from './valhalla-routing';

export type AtlasTravelProfile = 'flight' | 'drive' | 'bicycle' | 'walk';
export type AtlasTravelRouteSource = 'great-circle' | 'valhalla' | 'great-circle-fallback';

export type AtlasTravelModeSession = {
  profile: AtlasTravelProfile;
  source: AtlasTravelRouteSource;
  route: JourneyRoute;
  points: CorridorPoint[];
  corridor: AtlasCorridor;
  distanceKm?: number;
  durationSeconds?: number;
  generatedAt: string;
};

export type AtlasTravelProgress = {
  progress: number;
  routeIndex: number;
  point: CorridorPoint;
  passedStationIds: string[];
  currentStationId?: string;
  nextStationIds: string[];
};

export type BuildAtlasTravelModeOptions = {
  profile?: AtlasTravelProfile;
  corridorRadiusKm?: number;
  alternatives?: number;
  fetchImpl?: typeof fetch;
};

function valhallaCosting(profile: AtlasTravelProfile): RouteMode | null {
  if (profile === 'drive') return 'auto';
  if (profile === 'bicycle') return 'bicycle';
  if (profile === 'walk') return 'pedestrian';
  return null;
}

export function stationToCorridorStation(station: Station): CorridorStation | null {
  const place = journeyFromStation(station);
  if (!place || place.approximate) return null;
  return {
    id: station.station_uuid || station.id,
    name: station.name,
    lat: place.lat,
    lon: place.lng,
    streamUrl: station.url,
    country: station.country,
    state: station.state,
    city: station.city,
  };
}

export function eligibleTravelStations(stations: Station[]) {
  const seen = new Set<string>();
  return stations.flatMap((station) => {
    const id = station.station_uuid || station.id;
    if (!id || seen.has(id) || !stationDiscoveryEligible(station) || !/^https?:\/\//i.test(station.url) || station.sourceType === 'geoaudio') return [];
    const corridorStation = stationToCorridorStation(station);
    if (!corridorStation) return [];
    seen.add(id);
    return [corridorStation];
  });
}

export function greatCircleTravelPoints(route: JourneyRoute, steps = 180): CorridorPoint[] {
  return journeyTrack(route, 1, Math.max(24, steps)).map(([lon, lat]) => ({ lat, lon }));
}

export async function buildAtlasTravelModeSession(
  route: JourneyRoute,
  stations: Station[],
  options: BuildAtlasTravelModeOptions = {},
): Promise<AtlasTravelModeSession> {
  const profile = options.profile ?? 'flight';
  const costing = valhallaCosting(profile);
  let points: CorridorPoint[];
  let source: AtlasTravelRouteSource;
  let distanceKm: number | undefined;
  let durationSeconds: number | undefined;

  if (!costing) {
    points = greatCircleTravelPoints(route);
    source = 'great-circle';
  } else {
    try {
      const result = await fetchValhallaRoute({
        origin: { lat: route.from.lat, lon: route.from.lng },
        destination: { lat: route.to.lat, lon: route.to.lng },
        costing,
        alternatives: options.alternatives ?? 0,
      }, options.fetchImpl);
      points = result.points;
      distanceKm = result.distanceKm;
      durationSeconds = result.durationSeconds;
      source = 'valhalla';
    } catch {
      // Journey must remain usable if a public router is unavailable or cannot
      // connect two endpoints, including ocean crossings.
      points = greatCircleTravelPoints(route);
      source = 'great-circle-fallback';
    }
  }

  const corridor = buildAtlasCorridor(points, eligibleTravelStations(stations), options.corridorRadiusKm ?? (profile === 'flight' ? 220 : 55));
  return { profile, source, route, points, corridor, distanceKm, durationSeconds, generatedAt: new Date().toISOString() };
}

export function atlasTravelProgress(session: AtlasTravelModeSession, rawProgress: number, lookAhead = 4): AtlasTravelProgress {
  const progress = Math.max(0, Math.min(1, Number.isFinite(rawProgress) ? rawProgress : 0));
  const routeIndex = Math.min(session.points.length - 1, Math.max(0, Math.round(progress * Math.max(0, session.points.length - 1))));
  const point = session.points[routeIndex] ?? { lat: session.route.from.lat, lon: session.route.from.lng };
  const ordered = session.corridor.stations;
  const passed = ordered.filter((station) => station.routeIndex < routeIndex);
  const current = ordered
    .filter((station) => station.routeIndex >= Math.max(0, routeIndex - 1))
    .sort((a, b) => Math.abs(a.routeIndex - routeIndex) - Math.abs(b.routeIndex - routeIndex) || a.distanceKm - b.distanceKm)[0];
  const upcoming = ordered
    .filter((station) => station.routeIndex > routeIndex && station.id !== current?.id)
    .slice(0, Math.max(1, lookAhead));

  return {
    progress,
    routeIndex,
    point,
    passedStationIds: passed.map((station) => station.id),
    currentStationId: current?.id,
    nextStationIds: upcoming.map((station) => station.id),
  };
}

export function corridorStationQueue(session: AtlasTravelModeSession, progress: number, limit = 6) {
  const state = atlasTravelProgress(session, progress, limit);
  const ids = [state.currentStationId, ...state.nextStationIds].filter((id): id is string => Boolean(id));
  const byId = new Map(session.corridor.stations.map((station) => [station.id, station]));
  return ids.map((id) => byId.get(id)).filter((station): station is NonNullable<typeof station> => Boolean(station)).slice(0, limit);
}
