import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";

export type AtlasCoordinates = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp?: number;
  source?: "device";
};

const CACHE_KEY = "waveatlas.location.v2";
const LEGACY_CACHE_KEY = "waveatlas.location.v1";
export const PRECISE_LOCATION_MAX_ACCURACY_METERS = 5_000;
export const PRECISE_LOCATION_CACHE_AGE_MS = 2 * 60_000;
const FRESH_DEVICE_MAXIMUM_AGE_MS = 15_000;
const MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND = 400;
const JUMP_GRACE_METERS = 25_000;
let pending: Promise<AtlasCoordinates | undefined> | undefined;

type StoredAtlasCoordinates = AtlasCoordinates & { at: number };

export function validAtlasCoordinates(value: Pick<AtlasCoordinates, "lat" | "lng" | "accuracy"> | undefined | null) {
  return Boolean(
    value
      && Number.isFinite(value.lat)
      && Math.abs(value.lat) <= 90
      && Number.isFinite(value.lng)
      && Math.abs(value.lng) <= 180
      && Number.isFinite(value.accuracy)
      && value.accuracy >= 0,
  );
}

export function isPreciseAtlasLocation(value: Pick<AtlasCoordinates, "lat" | "lng" | "accuracy"> | undefined | null) {
  return validAtlasCoordinates(value) && value!.accuracy <= PRECISE_LOCATION_MAX_ACCURACY_METERS;
}

function toRad(value: number) {
  return value * Math.PI / 180;
}

export function atlasLocationDistanceMeters(a: Pick<AtlasCoordinates, "lat" | "lng">, b: Pick<AtlasCoordinates, "lat" | "lng">) {
  const radius = 6_371_008.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Reject impossible fresh jumps without preventing genuine travel. A precise
 * device fix is allowed to replace an old fix once elapsed time makes the move
 * physically plausible. Accuracy radii are included as uncertainty allowance.
 */
export function plausibleLocationTransition(previous: AtlasCoordinates | undefined, candidate: AtlasCoordinates, now = Date.now()) {
  if (!isPreciseAtlasLocation(candidate)) return false;
  if (!previous || !isPreciseAtlasLocation(previous) || !previous.timestamp) return true;
  const elapsedSeconds = Math.max(0, (now - previous.timestamp) / 1000);
  if (elapsedSeconds > 6 * 60 * 60) return true;
  const distance = atlasLocationDistanceMeters(previous, candidate);
  const allowance = JUMP_GRACE_METERS + previous.accuracy + candidate.accuracy + elapsedSeconds * MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND;
  return distance <= allowance;
}

function parseStored(raw: string | null): StoredAtlasCoordinates | undefined {
  try {
    const saved = JSON.parse(raw || "null");
    if (!saved || !Number.isFinite(saved.at)) return;
    const location: AtlasCoordinates = {
      lat: saved.lat,
      lng: saved.lng,
      accuracy: saved.accuracy,
      timestamp: saved.at,
      source: "device",
    };
    if (!isPreciseAtlasLocation(location)) return;
    return { ...location, at: saved.at };
  } catch {
    return;
  }
}

function savedLocation(maxAgeMs = PRECISE_LOCATION_CACHE_AGE_MS): AtlasCoordinates | undefined {
  const current = parseStored(readBrowserStorage("local", CACHE_KEY));
  const legacy = current ? undefined : parseStored(readBrowserStorage("local", LEGACY_CACHE_KEY));
  const saved = current || legacy;
  if (!saved) return;
  const age = Date.now() - saved.at;
  if (age < 0 || age > maxAgeMs) return;
  return { lat: saved.lat, lng: saved.lng, accuracy: saved.accuracy, timestamp: saved.at, source: "device" };
}

function persistLocation(coords: AtlasCoordinates) {
  const at = coords.timestamp ?? Date.now();
  writeBrowserStorage("local", CACHE_KEY, JSON.stringify({ lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy, at, source: "device" }));
}

function requestDeviceLocation(timeoutMs: number, previous?: AtlasCoordinates) {
  return new Promise<AtlasCoordinates | undefined>((resolve) => {
    let settled = false;
    const finish = (coords?: AtlasCoordinates) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(coords);
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords, timestamp }) => {
          const candidate: AtlasCoordinates = {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
            source: "device",
          };
          if (!plausibleLocationTransition(previous, candidate)) return finish();
          finish(candidate);
        },
        () => finish(),
        {
          enableHighAccuracy: true,
          maximumAge: FRESH_DEVICE_MAXIMUM_AGE_MS,
          timeout: timeoutMs,
        },
      );
    } catch {
      finish();
    }
  });
}

// Only an explicit location-button press may open the browser permission prompt.
// Nearby discovery, Journey, weather and map navigation share this precise source.
// Country centroids, stream-server IPs and other coarse guesses never enter here.
export async function readAtlasLocation({ allowPrompt = false, timeoutMs = 2500 } = {}): Promise<AtlasCoordinates | undefined> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  if (pending) return pending;

  const cached = savedLocation();
  if (!allowPrompt && cached) return cached;

  if (!allowPrompt) {
    try {
      if (!navigator.permissions || (await navigator.permissions.query({ name: "geolocation" })).state !== "granted") return;
    } catch {
      return;
    }
    if (pending) return pending;
  }

  pending = (async () => {
    const fresh = await requestDeviceLocation(timeoutMs, cached);
    if (fresh) {
      persistLocation(fresh);
      return fresh;
    }
    // An explicit request may fall back only to a still-fresh, precise device fix.
    return cached;
  })();

  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
