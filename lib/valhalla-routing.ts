import type { CorridorPoint } from './atlas-corridor-intelligence';

export type RouteMode = 'auto' | 'bicycle' | 'pedestrian';

export type RouteRequest = {
  origin: CorridorPoint;
  destination: CorridorPoint;
  waypoints?: CorridorPoint[];
  costing?: RouteMode;
  alternatives?: number;
};

export type RouteResult = {
  points: CorridorPoint[];
  distanceKm?: number;
  durationSeconds?: number;
};

const DEFAULT_VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';

function decodePolyline6(encoded: string): CorridorPoint[] {
  const coordinates: CorridorPoint[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }

  return coordinates;
}

export async function fetchValhallaRoute(
  request: RouteRequest,
  fetchImpl: typeof fetch = fetch,
  endpoint = process.env.VALHALLA_ROUTE_URL || DEFAULT_VALHALLA_URL,
): Promise<RouteResult> {
  const locations = [request.origin, ...(request.waypoints ?? []), request.destination].map((point) => ({
    lat: point.lat,
    lon: point.lon,
    type: 'break',
  }));

  const payload = {
    locations,
    costing: request.costing ?? 'auto',
    units: 'kilometers',
    directions_options: { units: 'kilometers' },
    alternates: Math.max(0, Math.min(request.alternatives ?? 0, 2)),
  };

  const url = new URL(endpoint);
  url.searchParams.set('json', JSON.stringify(payload));

  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Valhalla routing failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  const trip = data?.trip;
  const legs = Array.isArray(trip?.legs) ? trip.legs : [];
  const points: CorridorPoint[] = [];

  for (const leg of legs) {
    if (typeof leg?.shape !== 'string') continue;
    const decoded = decodePolyline6(leg.shape);
    if (points.length && decoded.length) decoded.shift();
    points.push(...decoded);
  }

  if (!points.length) {
    throw new Error('Valhalla returned no route geometry');
  }

  return {
    points,
    distanceKm: typeof trip?.summary?.length === 'number' ? trip.summary.length : undefined,
    durationSeconds: typeof trip?.summary?.time === 'number' ? trip.summary.time : undefined,
  };
}

export { decodePolyline6 };
