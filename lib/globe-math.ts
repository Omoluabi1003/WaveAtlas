import { geoDistance, geoOrthographic, type GeoProjection as D3GeoProjection } from "d3-geo";

export type GlobeRotation = { rotX: number; rotY: number };
export type GlobeScreen = { width: number; height: number; radius: number; centerX?: number; centerY?: number };
export type GlobeGeoPoint = { lat: number; lng: number; label?: string };

export type GlobeProjection = { x: number; y: number; z: number; vector: { x: number; y: number; z: number }; projection: D3GeoProjection };

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function normalizeLongitude(lng: number) {
  return ((lng + 540) % 360) - 180;
}

export function focusRotationForPoint(point: GlobeGeoPoint): GlobeRotation {
  return { rotX: point.lat * DEG, rotY: point.lng * DEG };
}

export function clampManualLatitudeRotation(rotX: number) {
  return Math.max(-70 * DEG, Math.min(70 * DEG, rotX));
}

export function rotateFromDrag(rotation: GlobeRotation, dx: number, dy: number, mobile = false): GlobeRotation {
  return {
    rotX: clampManualLatitudeRotation(rotation.rotX + dy * (mobile ? 0.003 : 0.004)),
    rotY: rotation.rotY - dx * (mobile ? 0.0045 : 0.006),
  };
}

export function buildGlobeProjection(width: number, height: number, radius: number, rotX: number, rotY: number, centerX = width / 2, centerY = height / 2): D3GeoProjection {
  const rotXDeg = rotX * RAD;
  const rotYDeg = rotY * RAD;
  return geoOrthographic()
    .translate([centerX, centerY])
    .scale(radius)
    .rotate([-rotYDeg, -rotXDeg, 0])
    .clipAngle(90);
}

export function globeDepthFromProjection(point: GlobeGeoPoint, projection: D3GeoProjection) {
  const [rotateLng, rotateLat] = projection.rotate();
  const center: [number, number] = [-rotateLng, -rotateLat];
  return Math.cos(geoDistance([point.lng, point.lat], center));
}

export function projectGlobePoint(point: GlobeGeoPoint, rotation: GlobeRotation, screen: GlobeScreen): GlobeProjection {
  const projection = buildGlobeProjection(screen.width, screen.height, screen.radius, rotation.rotX, rotation.rotY, screen.centerX, screen.centerY);
  const projected = projection([point.lng, point.lat]);
  const z = globeDepthFromProjection(point, projection);
  return {
    x: projected?.[0] ?? Number.NaN,
    y: projected?.[1] ?? Number.NaN,
    z,
    vector: { x: Number.NaN, y: Number.NaN, z },
    projection,
  };
}

export function invertGlobePoint(x: number, y: number, rotation: GlobeRotation, screen: GlobeScreen): GlobeGeoPoint | null {
  const dx = x - (screen.centerX ?? screen.width / 2);
  const dy = y - (screen.centerY ?? screen.height / 2);
  if (dx * dx + dy * dy > screen.radius * screen.radius) return null;
  const projection = buildGlobeProjection(screen.width, screen.height, screen.radius, rotation.rotX, rotation.rotY, screen.centerX, screen.centerY);
  const lngLat = projection.invert?.([x, y]);
  if (!lngLat) return null;
  return { lng: normalizeLongitude(lngLat[0]), lat: lngLat[1] };
}

export const GLOBE_COORDINATE_FIXTURES = [
  { label: "Ibadan", lat: 7.3775, lng: 3.947, expectedRegion: "southwest Nigeria" },
  { label: "Lagos", lat: 6.5244, lng: 3.3792, expectedRegion: "Lagos, Nigeria" },
  { label: "Tokyo", lat: 35.6762, lng: 139.6503, expectedRegion: "Tokyo, Japan" },
  { label: "London", lat: 51.5072, lng: -0.1276, expectedRegion: "London, United Kingdom" },
  { label: "New York", lat: 40.7128, lng: -74.006, expectedRegion: "New York, United States" },
  { label: "Sydney", lat: -33.8688, lng: 151.2093, expectedRegion: "Sydney, Australia" },
  { label: "Cape Town", lat: -33.9249, lng: 18.4241, expectedRegion: "Cape Town, South Africa" },
] as const satisfies readonly (GlobeGeoPoint & { expectedRegion: string })[];

export function fixtureProjectsToFocusedCenter(point: GlobeGeoPoint, screen: GlobeScreen = { width: 1000, height: 1000, radius: 300 }) {
  const projected = projectGlobePoint(point, focusRotationForPoint(point), screen);
  return {
    ...projected,
    centered: Math.abs(projected.x - screen.width / 2) < 0.000001 && Math.abs(projected.y - screen.height / 2) < 0.000001 && projected.z > 0.999999,
  };
}
