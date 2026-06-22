export type GlobeRotation = { rotX: number; rotY: number };
export type GlobeScreen = { width: number; height: number; radius: number };
export type GlobeGeoPoint = { lat: number; lng: number; label?: string };
export type GlobeProjection = { x: number; y: number; z: number; vector: { x: number; y: number; z: number } };

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function normalizeLongitude(lng: number) {
  return ((lng + 540) % 360) - 180;
}

export function focusRotationForPoint(point: GlobeGeoPoint): GlobeRotation {
  return { rotX: point.lat * DEG, rotY: -point.lng * DEG };
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

export function projectGlobePoint(point: GlobeGeoPoint, rotation: GlobeRotation, screen: GlobeScreen): GlobeProjection {
  const phi = point.lat * DEG;
  const lambda = point.lng * DEG + rotation.rotY;
  const vectorX = Math.cos(phi) * Math.sin(lambda);
  const vectorY = Math.sin(phi) * Math.cos(rotation.rotX) - Math.cos(phi) * Math.cos(lambda) * Math.sin(rotation.rotX);
  const vectorZ = Math.sin(phi) * Math.sin(rotation.rotX) + Math.cos(phi) * Math.cos(lambda) * Math.cos(rotation.rotX);
  return {
    x: screen.width / 2 + vectorX * screen.radius,
    y: screen.height / 2 - vectorY * screen.radius,
    z: vectorZ,
    vector: { x: vectorX, y: vectorY, z: vectorZ },
  };
}

export function invertGlobePoint(x: number, y: number, rotation: GlobeRotation, screen: GlobeScreen): GlobeGeoPoint | null {
  const nx = (x - screen.width / 2) / screen.radius;
  const ny = (screen.height / 2 - y) / screen.radius;
  if (nx * nx + ny * ny > 1) return null;
  const nz = Math.sqrt(1 - nx * nx - ny * ny);
  const sinX = Math.sin(rotation.rotX);
  const cosX = Math.cos(rotation.rotX);
  const worldY = ny * cosX + nz * sinX;
  const worldZ = nz * cosX - ny * sinX;
  const lat = Math.asin(worldY) * RAD;
  const lng = normalizeLongitude((Math.atan2(nx, worldZ) - rotation.rotY) * RAD);
  return { lat, lng };
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
