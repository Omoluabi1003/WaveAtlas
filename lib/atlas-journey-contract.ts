export type JourneyPlace = { label: string; lat: number; lng: number; countryCode?: string; approximate?: boolean };
export type JourneyRoute = { from: JourneyPlace; to: JourneyPlace };
export function validJourneyPlace(value: unknown): value is JourneyPlace {
  if (!value || typeof value !== 'object') return false;
  const p = value as JourneyPlace;
  return typeof p.label === 'string' && p.label.trim().length > 0 && p.label.length <= 120 && typeof p.lat === 'number' && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && typeof p.lng === 'number' && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 && (p.countryCode === undefined || /^[A-Z]{2}$/.test(p.countryCode)) && (p.approximate === undefined || typeof p.approximate === 'boolean');
}
export function validJourneyRoute(value: unknown): value is JourneyRoute {
  if (!value || typeof value !== 'object') return false;
  const route = value as JourneyRoute;
  return validJourneyPlace(route.from) && validJourneyPlace(route.to) && routeSeparation(route) >= 1;
}
function routeSeparation(route: JourneyRoute) {
  const radians = Math.PI / 180;
  const a = Math.sin((route.to.lat - route.from.lat) * radians / 2) ** 2 + Math.cos(route.from.lat * radians) * Math.cos(route.to.lat * radians) * Math.sin((route.to.lng - route.from.lng) * radians / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}
export function decodeJourney(value: string | null): JourneyRoute | null {
  if (!value || value.length > 1200) return null;
  try { const route: unknown = JSON.parse(value); return validJourneyRoute(route) ? route : null; } catch { return null; }
}
