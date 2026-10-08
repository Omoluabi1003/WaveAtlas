import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";

export type AtlasCoordinates = { lat: number; lng: number; accuracy: number };
const CACHE_KEY = "waveatlas.location.v1";
const CACHE_AGE_MS = 15 * 60_000;
let pending: Promise<AtlasCoordinates | undefined> | undefined;

function savedLocation(): AtlasCoordinates | undefined {
  try {
    const saved = JSON.parse(readBrowserStorage("local", CACHE_KEY) || "null");
    if (!saved || !Number.isFinite(saved.at) || Date.now() - saved.at < 0 || Date.now() - saved.at > CACHE_AGE_MS) return;
    if (!Number.isFinite(saved.lat) || Math.abs(saved.lat) > 90 || !Number.isFinite(saved.lng) || Math.abs(saved.lng) > 180 || !Number.isFinite(saved.accuracy) || saved.accuracy < 0) return;
    return { lat: saved.lat, lng: saved.lng, accuracy: saved.accuracy };
  } catch { return; }
}

// Only an explicit location-button press may open the browser permission prompt.
// Nearby discovery, playback and mounted panels share this request and cache.
export async function readAtlasLocation({ allowPrompt = false, timeoutMs = 2500 } = {}): Promise<AtlasCoordinates | undefined> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  const saved = savedLocation();
  if (saved) return saved;
  if (pending) return pending;
  if (!allowPrompt) {
    try {
      if (!navigator.permissions || (await navigator.permissions.query({ name: "geolocation" })).state !== "granted") return;
    } catch { return; }
    if (pending) return pending;
  }
  pending = new Promise<AtlasCoordinates | undefined>((resolve) => {
    let settled = false;
    const finish = (coords?: AtlasCoordinates) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (coords) writeBrowserStorage("local", CACHE_KEY, JSON.stringify({ ...coords, at: Date.now() }));
      resolve(coords);
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => finish({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
        () => finish(),
        { enableHighAccuracy: false, maximumAge: CACHE_AGE_MS, timeout: timeoutMs },
      );
    } catch { finish(); }
  });
  try { return await pending; } finally { pending = undefined; }
}
