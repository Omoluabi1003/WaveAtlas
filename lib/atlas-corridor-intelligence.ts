export type CorridorPoint = {
  lat: number;
  lon: number;
};

export type CorridorStation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  streamUrl?: string;
  country?: string;
  state?: string;
  city?: string;
};

export type CorridorStationHit = CorridorStation & {
  distanceKm: number;
  routeIndex: number;
};

export type AtlasCorridor = {
  points: CorridorPoint[];
  stations: CorridorStationHit[];
  generatedAt: string;
};

const EARTH_RADIUS_KM = 6371.0088;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineKm(a: CorridorPoint, b: CorridorPoint) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function matchStationsToCorridor(
  route: CorridorPoint[],
  stations: CorridorStation[],
  radiusKm = 45,
): CorridorStationHit[] {
  if (!route.length || !stations.length) return [];

  const hits: CorridorStationHit[] = [];

  for (const station of stations) {
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestIndex = -1;

    for (let index = 0; index < route.length; index += 1) {
      const distance = haversineKm(route[index], station);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestDistance <= radiusKm) {
      hits.push({ ...station, distanceKm: bestDistance, routeIndex: bestIndex });
    }
  }

  return hits.sort((a, b) => a.routeIndex - b.routeIndex || a.distanceKm - b.distanceKm);
}

export function buildAtlasCorridor(
  route: CorridorPoint[],
  stations: CorridorStation[],
  radiusKm = 45,
): AtlasCorridor {
  return {
    points: route,
    stations: matchStationsToCorridor(route, stations, radiusKm),
    generatedAt: new Date().toISOString(),
  };
}
