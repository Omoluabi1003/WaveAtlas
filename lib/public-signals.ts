export const SIGNAL_LAYERS = {
  earthquakes: { label: "Earthquakes", source: "USGS", url: "https://earthquake.usgs.gov/", color: "#fbbf24", refreshMs: 300_000, description: "Magnitude 2.5+ reports from the past seven days." },
  events: { label: "Natural events", source: "NASA EONET", url: "https://eonet.gsfc.nasa.gov/", color: "#fb7185", refreshMs: 300_000, description: "Curated open events reported within 30 days, including fires, storms and volcanoes." },
  iss: { label: "Space station", source: "Where the ISS at?", url: "https://wheretheiss.at/", color: "#7dd3fc", refreshMs: 30_000, description: "Periodically updated ISS orbital position, calculated by the provider." },
} as const;
export type SignalLayer = keyof typeof SIGNAL_LAYERS;
export type PublicSignal = {
  id: string; layer: SignalLayer; title: string; lat: number; lng: number;
  observedAt: string; url: string; detail: string;
};
export type SignalSnapshot = { layer: SignalLayer; fetchedAt: string; points: PublicSignal[] };
export function isSignalLayer(value: string | null): value is SignalLayer {
  return value !== null && Object.prototype.hasOwnProperty.call(SIGNAL_LAYERS, value);
}
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" ? value as ObjectValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
export function safeSignalUrl(value: unknown, fallback: string): string {
  try { const url = new URL(string(value)); return url.protocol === "https:" ? url.href : fallback; } catch { return fallback; }
}
function position(lng: unknown, lat: unknown) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
function timestamp(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function normalizePublicSignals(layer: SignalLayer, payload: unknown): PublicSignal[] {
  const root = object(payload), fallback = SIGNAL_LAYERS[layer].url;
  if (layer === "iss") {
    const geo = position(root.longitude, root.latitude);
    const time = typeof root.timestamp === "number" ? timestamp(root.timestamp * 1000) : null;
    if (!geo || !time || root.id !== 25544) return [];
    const altitude = typeof root.altitude === "number" && Number.isFinite(root.altitude) ? `${Math.round(root.altitude)} km altitude` : "Altitude unavailable";
    return [{ id: "iss-25544", layer, title: "International Space Station", ...geo, observedAt: time, url: fallback, detail: `${altitude} · calculated orbital position` }];
  }
  const points: PublicSignal[] = [];
  for (const raw of array(layer === "earthquakes" ? root.features : root.events)) {
    const item = object(raw);
    if (layer === "earthquakes") {
      const props = object(item.properties), geometry = object(item.geometry), coords = array(geometry.coordinates);
      const geo = geometry.type === "Point" ? position(coords[0], coords[1]) : null;
      const time = timestamp(props.time), id = string(item.id);
      if (!geo || !time || !id) continue;
      const magnitude = typeof props.mag === "number" && Number.isFinite(props.mag) ? props.mag : null;
      points.push({ id: `usgs-${id}`, layer, title: `${magnitude === null ? "Magnitude unavailable" : `M${magnitude.toFixed(1)}`} · ${string(props.place, "Earthquake")}`, ...geo, observedAt: time, url: safeSignalUrl(props.url, fallback), detail: "USGS earthquake report · past seven days" });
    } else {
      const geometries = array(item.geometry).map(object).filter(g => g.type === "Point" && timestamp(g.date)).sort((a, b) => new Date(string(b.date)).getTime() - new Date(string(a.date)).getTime());
      const latest = geometries[0], id = string(item.id);
      if (!latest || !id) continue;
      const coords = array(latest.coordinates), geo = position(coords[0], coords[1]), time = timestamp(latest.date);
      if (!geo || !time) continue;
      points.push({ id: `eonet-${id}`, layer, title: string(item.title, "Natural event"), ...geo, observedAt: time, url: safeSignalUrl(object(array(item.sources)[0]).url, fallback), detail: `${array(item.categories).map(c => string(object(c).title)).filter(Boolean).join(", ") || "Natural event"} · curated report` });
    }
  }
  return [...new Map(points.sort((a, b) => b.observedAt.localeCompare(a.observedAt)).map(p => [p.id, p])).values()].slice(0, 200);
}
export function signalDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
