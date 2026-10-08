import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { recordPermissionDenied } from "./browser-permissions";

export type AtlasCoordinates = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp?: number;
  highAccuracy?: boolean;
};

export type LocationPurpose = 'general' | 'nearby' | 'precision';

export interface LocationResolutionOptions {
  allowPrompt?: boolean;
  timeoutMs?: number;
  purpose?: LocationPurpose;
  requirePrecision?: boolean;
}

const CACHE_KEY = "waveatlas.location.v1";

const TTL_MAP: Record<LocationPurpose, number> = {
  general: 15 * 60_000,
  nearby: 15 * 60_000,
  precision: 5 * 60_000
};

interface StoredLocation {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
  highAccuracy?: boolean;
}

let pendingResolution: Promise<AtlasCoordinates | undefined> | undefined;

function savedLocation(purpose: LocationPurpose = 'general'): AtlasCoordinates | undefined {
  try {
    const raw = readBrowserStorage("local", CACHE_KEY);
    if (!raw) return undefined;
    const saved: StoredLocation = JSON.parse(raw);
    if (!saved || !Number.isFinite(saved.at)) return undefined;

    const age = Date.now() - saved.at;
    const ttl = TTL_MAP[purpose] ?? TTL_MAP.general;

    if (age < 0 || age > ttl) return undefined;

    if (
      !Number.isFinite(saved.lat) || Math.abs(saved.lat) > 90 ||
      !Number.isFinite(saved.lng) || Math.abs(saved.lng) > 180 ||
      !Number.isFinite(saved.accuracy) || saved.accuracy < 0
    ) {
      return undefined;
    }

    return {
      lat: saved.lat,
      lng: saved.lng,
      accuracy: saved.accuracy,
      ...(saved.highAccuracy ? { highAccuracy: true } : {})
    };
  } catch {
    return undefined;
  }
}

function saveLocation(coords: AtlasCoordinates) {
  try {
    const currentRaw = readBrowserStorage("local", CACHE_KEY);
    if (currentRaw) {
      const current: StoredLocation = JSON.parse(currentRaw);
      const isFresh = Date.now() - current.at < TTL_MAP.general;
      if (isFresh && current.accuracy < coords.accuracy - 500) {
        return;
      }
    }

    const payload: StoredLocation = {
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy,
      at: coords.timestamp || Date.now(),
      highAccuracy: coords.highAccuracy
    };
    writeBrowserStorage("local", CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write errors
  }
}

export async function readAtlasLocation({
  allowPrompt = false,
  timeoutMs = 2500,
  purpose = 'general',
  requirePrecision = false
}: LocationResolutionOptions = {}): Promise<AtlasCoordinates | undefined> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return undefined;

  const saved = savedLocation(purpose);
  if (saved && (!requirePrecision || saved.highAccuracy || saved.accuracy <= 250)) {
    return saved;
  }

  if (pendingResolution) return pendingResolution;

  if (!allowPrompt) {
    try {
      if (!navigator.permissions || (await navigator.permissions.query({ name: "geolocation" })).state !== "granted") {
        return saved || savedLocation('general');
      }
    } catch {
      return saved || savedLocation('general');
    }
    if (pendingResolution) return pendingResolution;
  }

  const highAccuracy = requirePrecision || purpose === 'precision' || purpose === 'nearby';
  const effectiveTimeout = Math.max(timeoutMs, highAccuracy ? 3500 : 2500);

  pendingResolution = new Promise<AtlasCoordinates | undefined>((resolve) => {
    let settled = false;

    const finish = (coords?: AtlasCoordinates) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (coords) {
        saveLocation(coords);
      }
      resolve(coords);
    };

    const timer = setTimeout(() => finish(saved || savedLocation('general')), effectiveTimeout);

    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => finish({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          ...(highAccuracy ? { highAccuracy: true } : {})
        }),
        (error) => {
          if (error && error.code === error.PERMISSION_DENIED) {
            recordPermissionDenied('geolocation');
          }
          finish(saved || savedLocation('general'));
        },
        { enableHighAccuracy: highAccuracy, maximumAge: TTL_MAP[purpose] ?? TTL_MAP.general, timeout: effectiveTimeout }
      );
    } catch {
      finish(saved || savedLocation('general'));
    }
  });

  try {
    return await pendingResolution;
  } finally {
    pendingResolution = undefined;
  }
}
