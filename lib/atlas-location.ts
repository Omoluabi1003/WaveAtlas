import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";

export type AtlasCoordinates = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp?: number;
  source?: "device";
};

const CACHE_KEY = "waveatlas.location.v3";
const LEGACY_CACHE_KEYS = ["waveatlas.location.v2", "waveatlas.location.v1"];
export const PRECISE_LOCATION_MAX_ACCURACY_METERS = 250;
export const PRECISE_LOCATION_CACHE_AGE_MS = 30_000;
export const LOCATION_LOCK_TARGET_ACCURACY_METERS = 75;
const FRESH_DEVICE_MAXIMUM_AGE_MS = 5_000;
const INTERACTIVE_LOCATION_TIMEOUT_MS = 15_000;
const LOCATION_SETTLE_MS = 1_500;
const MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND = 400;
const JUMP_GRACE_METERS = 2_000;
let pending: Promise<AtlasCoordinates | undefined> | undefined;

type StoredAtlasCoordinates = AtlasCoordinates & { at: number };

export function validAtlasCoordinates(value: Pick<AtlasCoordinates, "lat" | "lng" | "accuracy"> | undefined | null) {
  return Boolean(value && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180 && Number.isFinite(value.accuracy) && value.accuracy >= 0);
}

export function isPreciseAtlasLocation(value: Pick<AtlasCoordinates, "lat" | "lng" | "accuracy"> | undefined | null) {
  return validAtlasCoordinates(value) && value!.accuracy <= PRECISE_LOCATION_MAX_ACCURACY_METERS;
}

function toRad(value: number) { return value * Math.PI / 180; }

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

export function plausibleLocationTransition(previous: AtlasCoordinates | undefined, candidate: AtlasCoordinates, now = Date.now()) {
  if (!isPreciseAtlasLocation(candidate)) return false;
  if (!previous || !isPreciseAtlasLocation(previous) || !previous.timestamp) return true;
  const elapsedSeconds = Math.max(0, (now - previous.timestamp) / 1000);
  if (elapsedSeconds > 6 * 60 * 60) return true;
  const distance = atlasLocationDistanceMeters(previous, candidate);
  const allowance = JUMP_GRACE_METERS + previous.accuracy + candidate.accuracy + elapsedSeconds * MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND;
  return distance <= allowance;
}

export function atlasLocationMayPrompt(allowPrompt: boolean, userActivation = false) { return allowPrompt || userActivation; }

function parseStored(raw: string | null): StoredAtlasCoordinates | undefined {
  try {
    const saved = JSON.parse(raw || "null");
    if (!saved || !Number.isFinite(saved.at)) return;
    const location: AtlasCoordinates = { lat: saved.lat, lng: saved.lng, accuracy: saved.accuracy, timestamp: saved.at, source: "device" };
    if (!isPreciseAtlasLocation(location)) return;
    return { ...location, at: saved.at };
  } catch { return; }
}

function savedLocation(maxAgeMs = PRECISE_LOCATION_CACHE_AGE_MS): AtlasCoordinates | undefined {
  const current = parseStored(readBrowserStorage("local", CACHE_KEY));
  let saved = current;
  if (!saved) {
    for (const key of LEGACY_CACHE_KEYS) {
      saved = parseStored(readBrowserStorage("local", key));
      if (saved) break;
    }
  }
  if (!saved) return;
  const age = Date.now() - saved.at;
  if (age < 0 || age > maxAgeMs) return;
  return { lat: saved.lat, lng: saved.lng, accuracy: saved.accuracy, timestamp: saved.at, source: "device" };
}

function persistLocation(coords: AtlasCoordinates) {
  const at = coords.timestamp ?? Date.now();
  writeBrowserStorage("local", CACHE_KEY, JSON.stringify({ lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy, at, source: "device" }));
}

function deviceCandidate(position: GeolocationPosition): AtlasCoordinates {
  return { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: Number.isFinite(position.timestamp) ? position.timestamp : Date.now(), source: "device" };
}

export function betterAtlasLocation(current: AtlasCoordinates | undefined, candidate: AtlasCoordinates) {
  if (!isPreciseAtlasLocation(candidate)) return current;
  if (!current) return candidate;
  return candidate.accuracy < current.accuracy ? candidate : current;
}

function requestDeviceLocation(timeoutMs: number, previous?: AtlasCoordinates) {
  return new Promise<AtlasCoordinates | undefined>((resolve) => {
    let settled = false;
    let watchId: number | undefined;
    let best: AtlasCoordinates | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (settleTimer) clearTimeout(settleTimer);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      resolve(best);
    };
    const consider = (position: GeolocationPosition) => {
      const candidate = deviceCandidate(position);
      if (!plausibleLocationTransition(previous, candidate)) return;
      best = betterAtlasLocation(best, candidate);
      if (!best) return;
      if (best.accuracy <= LOCATION_LOCK_TARGET_ACCURACY_METERS) {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(finish, LOCATION_SETTLE_MS);
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    const options: PositionOptions = { enableHighAccuracy: true, maximumAge: FRESH_DEVICE_MAXIMUM_AGE_MS, timeout: timeoutMs };
    try {
      // Do not lock the first network/Wi-Fi fix. Keep sampling while iOS/Safari
      // refines the position, retain the best accuracy, then settle briefly.
      watchId = navigator.geolocation.watchPosition(consider, () => finish(), options);
    } catch {
      try { navigator.geolocation.getCurrentPosition(consider, () => finish(), options); }
      catch { finish(); }
    }
  });
}

export async function readAtlasLocation({ allowPrompt = false, timeoutMs = 2500 } = {}): Promise<AtlasCoordinates | undefined> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  if (pending) return pending;

  const cached = savedLocation();
  const userActivation = typeof navigator.userActivation !== "undefined" && navigator.userActivation.isActive;
  const mayPrompt = atlasLocationMayPrompt(allowPrompt, userActivation);

  // Interactive location actions always seek a fresh refined fix. Passive
  // consumers may reuse only a short-lived, sub-250m device fix.
  if (!mayPrompt && cached) return cached;

  if (!mayPrompt) {
    try {
      if (!navigator.permissions || (await navigator.permissions.query({ name: "geolocation" })).state !== "granted") return;
    } catch { return; }
    if (pending) return pending;
  }

  const effectiveTimeoutMs = mayPrompt ? Math.max(timeoutMs, INTERACTIVE_LOCATION_TIMEOUT_MS) : Math.max(timeoutMs, 5_000);
  pending = (async () => {
    const fresh = await requestDeviceLocation(effectiveTimeoutMs, cached);
    if (fresh) {
      persistLocation(fresh);
      return fresh;
    }
    return cached;
  })();

  try { return await pending; }
  finally { pending = undefined; }
}
