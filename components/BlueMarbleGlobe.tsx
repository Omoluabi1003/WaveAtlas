"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoPath, type GeoPermissibleObjects, type GeoProjection as D3GeoProjection } from "d3-geo";
import { isoCountryCentroids } from "@/lib/geotruth-resolver";
import { flagFor, type Station } from "@/lib/stations";
import { stationKey } from "@/lib/fast-connect-engine";
import { DEBUG_SIGNALS, buildSignalFeatures, getActiveBeaconFeature, resolveStationGeo, type SignalCluster, type SignalFeature } from "@/lib/signal-constellations";
import type { GlobeBasemapKey } from "@/lib/globe-renderer-types";
import { shouldRenderPhotorealisticBasemap } from "@/lib/globe-renderer-adapter";
import { DEG, buildGlobeProjection, focusRotationForPoint, globeDepthFromProjection, invertGlobePoint, projectGlobePoint, rotateFromDrag, type GlobeProjection } from "@/lib/globe-math";
import { drawActiveStationBeacon } from "@/components/ActiveStationBeacon";

type CountryResult = {
  name: string;
  code: string;
  flag: string;
  centroid: { lat: number; lng: number };
  station_count: number;
};

type GlobePoint = { lat: number; lng: number; label: string; geoSource?: string; geoPrecision?: string; usedFallbackCentroid?: boolean };
type GlobeLabelKind = "active" | "country" | "city" | "station";
type GlobeLabel = GlobePoint & { active?: boolean; kind?: GlobeLabelKind; priority?: number };
type GlobeRuntime = { currentPoint: GlobePoint | null; selectionVersion?: number; focusIdentityKey: string; stationName: string; stationCity?: string; stationCountry?: string; stationLabel: string; basemap: GlobeBasemapKey; teleporting: boolean; labels: GlobeLabel[]; landShapes: LandShape[]; signalFeatures: SignalFeature[]; signalClusters: SignalCluster[] };
type GlobeDebugOverlay = { stationLat: number | null; stationLng: number | null; screenX: number | null; screenY: number | null; targetScreenX: number; targetScreenY: number; deltaX: number | null; deltaY: number | null; usableBounds: { left: number; top: number; right: number; bottom: number }; canvasCenter: { x: number; y: number }; rotX: number; rotY: number; selectedCountry: string | null; frontFacing: boolean; correctiveFocusRan: boolean; d3InputOrder: "[longitude, latitude]" };
type CanvasSize = { cssWidth: number; cssHeight: number; pixelWidth: number; pixelHeight: number; dpr: number };
type LandRing = Array<[number, number]>;
type LandShape = { name: string; code?: string; rings: LandRing[]; centroid: { lat: number; lng: number }; feature: GeoPermissibleObjects };
type NaturalEarthFeature = {
  type: "Feature";
  properties?: Record<string, string | number | null | undefined>;
  geometry?: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};
type NaturalEarthCollection = { type: "FeatureCollection"; features: NaturalEarthFeature[] };

type SpaceStar = { x: number; y: number; radius: number; alpha: number; hue: number; phase: number; twinkle: number };
type GlobeQualityTier = "mobile" | "balanced" | "cinematic";
type RendererDiagnostics = { drawCalls: number; projectedPolygons: number; hiddenPointSkips: number; frameTimeMs: number; estimatedFps: number; beforeDrawCalls: number; beforeProjectedPolygons: number };
type GlobeTextureKey = "day" | "night" | "clouds" | "detail" | "normal";
type GlobeTextureStatus = "idle" | "loading" | "loaded" | "failed";
type GlobeTextureBundle = { status: Record<GlobeTextureKey, GlobeTextureStatus>; images: Partial<Record<GlobeTextureKey, HTMLImageElement>>; fallbackReason?: string };
type RendererDiagnosticsSnapshot = { mode: string; quality: GlobeQualityTier; fps: number; frameTimeMs: number; textureStatus: Record<GlobeTextureKey, GlobeTextureStatus>; fallbackReason: string | null; recoveryStatus: string };

type Props = {
  station: Station;
  stations?: Station[];
  previousStation?: Station;
  teleporting?: boolean;
  onCountrySelect?: (country: CountryResult) => void;
  onFallback?: (reason: string) => void;
  onStreetZoomRequest?: (context?: { lat: number; lng: number; zoom: number; stationId?: string; reason: string }) => void;
  mobile?: boolean;
  basemap?: GlobeBasemapKey;
  selectionVersion?: number;
};

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const TAU = Math.PI * 2;
const LAND_GEOJSON_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const LAND_CACHE_NAME = "waveatlas-boundaries-v1";
const MOBILE_FRAME_MS = 1000 / 30;
const DESKTOP_FRAME_MS = 1000 / 60;
const MOBILE_FALLBACK_MS = 2000;
const TEXTURE_RETRY_BASE_MS = 1200;
const TEXTURE_RETRY_MAX_MS = 30000;
const MOBILE_PRIMARY_FOCUS_DURATION_MS = 3000;
const DESKTOP_PRIMARY_FOCUS_DURATION_MS = 3600;
const MOBILE_FAST_FOCUS_DURATION_MS = 2200;
const DESKTOP_FAST_FOCUS_DURATION_MS = 2400;
const POST_FOCUS_CORRECTION_DURATION_MS = 1600;
const IOS_PRIMARY_FOCUS_DURATION_MS = 3800;
const IOS_MINIMUM_FOCUS_DURATION_MS = 3000;
const IOS_POST_FOCUS_CORRECTION_DURATION_MS = 1200;
const IOS_FRAME_DELTA_CLAMP_MS = 32;
const MINIMUM_FOCUS_DURATION_MS = 2400;
const LONG_DISTANCE_FOCUS_DURATION_MS = 4200;
const REDUCED_MOTION_FOCUS_DURATION_MS = 280;

const SPACE_STAR_SEED = 92821;
const SPACE_STAR_COUNT_DESKTOP = 90;
const SPACE_STAR_COUNT_MOBILE = 35;
const SPACE_STAR_COUNT_LOW_POWER = 20;
const SPACE_STARS = buildSpaceStars(SPACE_STAR_COUNT_DESKTOP, SPACE_STAR_SEED);
let landPromise: Promise<LandShape[]> | null = null;
let landCache: LandShape[] | null = null;

const EARTH_TEXTURES: Record<GlobeTextureKey, { cinematic: string; balanced: string; mobile: string; required: boolean }> = {
  day: { cinematic: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_atmos_2048.jpg", balanced: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_atmos_2048.jpg", mobile: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_atmos_2048.jpg", required: true },
  night: { cinematic: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_lights_2048.png", balanced: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_lights_2048.png", mobile: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_lights_2048.png", required: true },
  clouds: { cinematic: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_clouds_1024.png", balanced: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_clouds_1024.png", mobile: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_clouds_1024.png", required: true },
  detail: { cinematic: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_specular_2048.jpg", balanced: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_specular_2048.jpg", mobile: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_specular_2048.jpg", required: true },
  normal: { cinematic: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_normal_2048.jpg", balanced: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_normal_2048.jpg", mobile: "https://unpkg.com/three@0.160.0/examples/textures/planets/earth_normal_2048.jpg", required: false },
};

const EMPTY_TEXTURE_STATUS: Record<GlobeTextureKey, GlobeTextureStatus> = { day: "idle", night: "idle", clouds: "idle", detail: "idle", normal: "idle" };


function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function buildSpaceStars(count: number, seed: number): SpaceStar[] {
  return Array.from({ length: count }, (_, index) => {
    const starSeed = seed + index * 17;
    return {
      x: seededUnit(starSeed + 1),
      y: seededUnit(starSeed + 2),
      radius: 0.45 + seededUnit(starSeed + 3) * 1.05,
      alpha: 0.12 + seededUnit(starSeed + 4) * 0.28,
      hue: seededUnit(starSeed + 5),
      phase: seededUnit(starSeed + 6) * TAU,
      twinkle: 0.015 + seededUnit(starSeed + 7) * 0.045,
    };
  });
}

function drawSpaceBackdrop(ctx: CanvasRenderingContext2D, options: { width: number; height: number; cx: number; cy: number; radius: number; now: number; mobile: boolean; lowPower: boolean; reducedMotion: boolean; basemap: GlobeBasemapKey }) {
  const { width, height, cx, cy, radius, now, mobile, lowPower, reducedMotion, basemap } = options;
  const starCount = lowPower ? SPACE_STAR_COUNT_LOW_POWER : mobile ? SPACE_STAR_COUNT_MOBILE : SPACE_STAR_COUNT_DESKTOP;
  ctx.save();

  const ambience = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.38, radius * 0.15, cx, cy, radius * 1.95);
  ambience.addColorStop(0, basemap === "photorealistic" ? "rgba(96,165,250,0.16)" : basemap === "night" ? "rgba(59,130,246,0.10)" : basemap === "signal" ? "rgba(0,214,143,0.08)" : "rgba(56,189,248,0.075)");
  ambience.addColorStop(0.5, "rgba(15,23,42,0.055)");
  ambience.addColorStop(1, "rgba(2,6,23,0)");
  ctx.fillStyle = ambience;
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < starCount; index += 1) {
    const star = SPACE_STARS[index];
    const x = star.x * width;
    const y = star.y * height;
    const distanceFromGlobe = Math.hypot(x - cx, y - cy);
    if (distanceFromGlobe < radius * 1.04) continue;
    const twinkle = reducedMotion ? 0 : Math.sin(now * 0.00042 + star.phase) * star.twinkle;
    const alpha = Math.max(0.04, star.alpha + twinkle) * (distanceFromGlobe < radius * 1.22 ? 0.58 : 1);
    const cool = star.hue > 0.78;
    ctx.fillStyle = cool ? `rgba(191,219,254,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, star.radius * (mobile || lowPower ? 0.82 : 1), 0, TAU);
    ctx.fill();
  }

  if (!lowPower) {
    ctx.lineCap = "round";
    for (const [index, scale] of [1.18, 1.34].entries()) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(index === 0 ? -0.22 : 0.18);
      ctx.strokeStyle = index === 0 ? "rgba(125,211,252,0.075)" : "rgba(0,214,143,0.055)";
      ctx.lineWidth = mobile ? 0.45 : 0.7;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * scale, radius * (scale * 0.34), 0, Math.PI * 0.08, Math.PI * 0.84);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutQuart(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clampFocusLatitude(rotX: number) {
  return Math.max(-70 * DEG, Math.min(70 * DEG, rotX));
}

function ringCentroid(rings: LandRing[]) {
  let lat = 0;
  let lng = 0;
  let count = 0;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      lng += x;
      lat += y;
      count += 1;
    }
  }
  return count ? { lat: lat / count, lng: lng / count } : { lat: 0, lng: 0 };
}

function normalizeLandFeature(feature: NaturalEarthFeature): LandShape | null {
  const geometry = feature.geometry;
  if (!geometry) return null;
  const props = feature.properties ?? {};
  const rings: LandRing[] = geometry.type === "Polygon"
    ? (geometry.coordinates as number[][][]).map((ring) => ring.map(([lng, lat]) => [lng, lat] as [number, number]))
    : (geometry.coordinates as number[][][][]).flatMap((polygon) => polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat] as [number, number])));
  if (!rings.length) return null;
  return {
    name: String(props.NAME_EN || props.NAME || props.ADMIN || "Land"),
    code: typeof props.ISO_A2 === "string" && props.ISO_A2.length === 2 ? props.ISO_A2 : undefined,
    rings,
    centroid: ringCentroid(rings),
    feature: feature as unknown as GeoPermissibleObjects,
  };
}

async function fetchBoundaryCollection() {
  const request = new Request(LAND_GEOJSON_URL, { cache: "force-cache" });
  if (typeof window !== "undefined" && "caches" in window) {
    const cache = await caches.open(LAND_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached.json() as Promise<NaturalEarthCollection>;
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Natural Earth boundaries failed: ${response.status}`);
    await cache.put(request, response.clone());
    return response.json() as Promise<NaturalEarthCollection>;
  }
  const response = await fetch(request);
  if (!response.ok) throw new Error(`Natural Earth boundaries failed: ${response.status}`);
  return response.json() as Promise<NaturalEarthCollection>;
}

function loadLandShapes() {
  if (landCache) return Promise.resolve(landCache);
  if (!landPromise) {
    landPromise = fetchBoundaryCollection().then((collection) => {
      landCache = collection.features.map(normalizeLandFeature).filter((shape): shape is LandShape => Boolean(shape));
      return landCache;
    });
  }
  return landPromise;
}

function resolveGlobeQualityTier(mobile: boolean, lowPower: boolean): GlobeQualityTier {
  if (mobile || lowPower) return "mobile";
  if (typeof window !== "undefined" && window.devicePixelRatio >= 2 && window.innerWidth >= 1280) return "cinematic";
  return "balanced";
}

function surfaceNoise(lat: number, lng: number, seed = 0) {
  return seededUnit(Math.round((lat + 90) * 7.13 + (lng + 180) * 3.71 + seed * 101));
}

function projectCanvasGlobePoint(lat: number, lng: number, projection: D3GeoProjection, diagnostics?: RendererDiagnostics): GlobeProjection {
  const projected = projection([lng, lat]);
  if (!projected) {
    if (diagnostics) diagnostics.hiddenPointSkips += 1;
    return { x: Number.NaN, y: Number.NaN, z: -1, vector: { x: Number.NaN, y: Number.NaN, z: -1 }, projection };
  }
  const z = globeDepthFromProjection({ lat, lng }, projection);
  return { x: projected[0], y: projected[1], z, vector: { x: Number.NaN, y: Number.NaN, z }, projection };
}

function blendRgb(base: [number, number, number], overlay: [number, number, number], overlayAlpha: number): [number, number, number] {
  return [
    Math.round(overlay[0] * overlayAlpha + base[0] * (1 - overlayAlpha)),
    Math.round(overlay[1] * overlayAlpha + base[1] * (1 - overlayAlpha)),
    Math.round(overlay[2] * overlayAlpha + base[2] * (1 - overlayAlpha)),
  ];
}

function photorealisticLandColor(lat: number, lng: number): [number, number, number] {
  const polar = Math.abs(lat);
  const desertBand = Math.max(0, 1 - Math.abs(polar - 24) / 23);
  const forestBand = Math.max(0, 1 - Math.abs(lat) / 44);
  const tundra = Math.max(0, (polar - 52) / 32);
  const ice = Math.max(0, (polar - 68) / 18);
  const aridNoise = surfaceNoise(lat, lng, 23);
  const vegetationNoise = surfaceNoise(lat, lng, 29);
  let color: [number, number, number] = [58, 116, 64];
  color = blendRgb(color, [187, 144, 77], Math.min(0.7, desertBand * (0.38 + aridNoise * 0.42)));
  color = blendRgb(color, [22, 83, 45], Math.min(0.55, forestBand * (0.28 + vegetationNoise * 0.38)));
  color = blendRgb(color, [115, 126, 96], Math.min(0.55, tundra * 0.62));
  color = blendRgb(color, [229, 238, 241], Math.min(0.92, ice));
  return color;
}

function drawCountryBoundaries(ctx: CanvasRenderingContext2D, options: { projection: D3GeoProjection; landShapes: LandShape[]; quality: GlobeQualityTier; mobile: boolean; lowPower: boolean; diagnostics?: RendererDiagnostics }) {
  const { projection, landShapes, quality, mobile, lowPower, diagnostics } = options;
  if (!landShapes.length) return;
  const path = geoPath(projection, ctx);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (quality !== "mobile") {
    ctx.strokeStyle = "rgba(15,23,42,0.30)";
    ctx.lineWidth = 1.25;
    for (const shape of landShapes) {
      ctx.beginPath();
      path(shape.feature);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = "rgba(226,244,255,0.48)";
  ctx.lineWidth = quality === "cinematic" ? 0.72 : mobile || lowPower ? 0.48 : 0.58;
  for (const shape of landShapes) {
    ctx.beginPath();
    path(shape.feature);
    ctx.stroke();
    if (diagnostics) diagnostics.drawCalls += 1;
  }
  ctx.restore();
}

function textureSampleRect(image: HTMLImageElement, lng: number, lat: number) {
  const x = (((lng + 180) % 360 + 360) % 360) / 360 * image.naturalWidth;
  const y = (90 - Math.max(-90, Math.min(90, lat))) / 180 * image.naturalHeight;
  return { sx: Math.max(0, Math.min(image.naturalWidth - 2, x)), sy: Math.max(0, Math.min(image.naturalHeight - 2, y)) };
}

function drawEquirectangularTextureLayer(ctx: CanvasRenderingContext2D, options: { projection: D3GeoProjection; cx: number; cy: number; r: number; image: HTMLImageElement; alpha?: number; composite?: GlobalCompositeOperation; cell: number; lngOffset?: number; diagnostics: RendererDiagnostics }) {
  const { projection, cx, cy, r, image, alpha = 1, composite = "source-over", cell, lngOffset = 0, diagnostics } = options;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = composite;
  for (let y = cy - r; y < cy + r; y += cell) {
    for (let x = cx - r; x < cx + r; x += cell) {
      const dx = x + cell * 0.5 - cx;
      const dy = y + cell * 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const inverted = projection.invert?.([x + cell * 0.5, y + cell * 0.5]);
      if (!inverted) { diagnostics.hiddenPointSkips += 1; continue; }
      const [lng, lat] = inverted;
      const source = textureSampleRect(image, lng + lngOffset, lat);
      ctx.drawImage(image, source.sx, source.sy, 2, 2, x, y, cell + 0.75, cell + 0.75);
      diagnostics.drawCalls += 1;
    }
  }
  ctx.restore();
}

function drawPhotorealisticSurface(ctx: CanvasRenderingContext2D, options: { projection: D3GeoProjection; cx: number; cy: number; r: number; now: number; quality: GlobeQualityTier; landShapes: LandShape[]; mobile: boolean; lowPower: boolean; reducedMotion: boolean; diagnostics: RendererDiagnostics; textures: GlobeTextureBundle }) {
  const { projection, cx, cy, r, now, quality, landShapes, mobile, lowPower, reducedMotion, diagnostics, textures } = options;
  const day = textures.images.day;
  const night = textures.images.night;
  const clouds = textures.images.clouds;
  const detail = textures.images.detail;
  if (!day || !night || !clouds || !detail) throw new Error(textures.fallbackReason || "Required photorealistic Earth texture failed to load.");

  const cell = quality === "cinematic" ? Math.max(4.5, r / 118) : quality === "balanced" ? Math.max(6.25, r / 92) : Math.max(9.5, r / 58);
  const cloudCell = quality === "cinematic" ? cell * 1.6 : cell * 1.95;
  drawEquirectangularTextureLayer(ctx, { projection, cx, cy, r, image: day, cell, diagnostics });
  drawEquirectangularTextureLayer(ctx, { projection, cx, cy, r, image: detail, cell: cell * 1.8, alpha: quality === "mobile" ? 0.16 : 0.24, composite: "soft-light", diagnostics });

  const sunLng = -35;
  const sunLat = 18;
  const terminatorStep = quality === "mobile" ? cell * 1.8 : cell * 1.35;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let y = cy - r; y < cy + r; y += terminatorStep) {
    for (let x = cx - r; x < cx + r; x += terminatorStep) {
      const dx = x + terminatorStep * 0.5 - cx;
      const dy = y + terminatorStep * 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const inverted = projection.invert?.([x + terminatorStep * 0.5, y + terminatorStep * 0.5]);
      if (!inverted) continue;
      const [lng, lat] = inverted;
      const light = Math.sin(lat * DEG) * Math.sin(sunLat * DEG) + Math.cos(lat * DEG) * Math.cos(sunLat * DEG) * Math.cos((lng - sunLng) * DEG);
      const nightAlpha = Math.max(0, Math.min(1, (0.22 - light) / 0.52));
      if (nightAlpha <= 0.02) continue;
      const source = textureSampleRect(night, lng, lat);
      const sampledAlpha = Math.min(0.92, nightAlpha);
      ctx.globalAlpha = sampledAlpha;
      ctx.drawImage(night, source.sx, source.sy, 2, 2, x, y, terminatorStep + 1, terminatorStep + 1);
      ctx.globalAlpha = Math.min(0.68, nightAlpha * 0.54);
      ctx.fillStyle = "#020617";
      ctx.fillRect(x, y, terminatorStep + 1, terminatorStep + 1);
      diagnostics.drawCalls += 1;
    }
  }
  ctx.restore();

  if (textures.images.normal && quality !== "mobile") drawEquirectangularTextureLayer(ctx, { projection, cx, cy, r, image: textures.images.normal, cell: cell * 2.2, alpha: 0.1, composite: "overlay", diagnostics });

  // Clouds are intentionally separate and slightly drift above the Earth surface.
  drawEquirectangularTextureLayer(ctx, { projection, cx, cy, r: r * 1.006, image: clouds, cell: cloudCell, alpha: lowPower ? 0.22 : 0.34, composite: "screen", lngOffset: reducedMotion ? 0 : now * 0.00055, diagnostics });

  const limb = ctx.createRadialGradient(cx - r * 0.24, cy - r * 0.28, r * 0.08, cx, cy, r);
  limb.addColorStop(0, "rgba(255,255,255,0.16)");
  limb.addColorStop(0.56, "rgba(255,255,255,0.015)");
  limb.addColorStop(1, "rgba(0,7,19,0.56)");
  ctx.fillStyle = limb;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  diagnostics.projectedPolygons += landShapes.length;
}

function iosGlobeDebugEnabled() {
  return process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_IOS_GLOBE === "true";
}

function globeDebugEnabled() {
  return (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_GLOBE === "true") || iosGlobeDebugEnabled() || process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_TRANSITIONS === "true";
}

function debugGlobeFocus(label: string, details: Record<string, unknown>) {
  if (!globeDebugEnabled()) return;
  console.debug(`[WaveAtlas globe focus] ${label}`, { ...details, timestamp: new Date().toISOString() });
}

function warnGlobeFocus(label: string, details: Record<string, unknown>) {
  if (!globeDebugEnabled()) return;
  console.warn(`[WaveAtlas globe focus] ${label}`, { ...details, timestamp: new Date().toISOString() });
}

function isIOSWebKit() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchMac = platform === "MacIntel" && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  return /iP(hone|ad|od)/i.test(ua) || touchMac;
}

function describeBrowser() {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent || "";
  if (/CriOS/i.test(ua)) return "Chrome iOS (WebKit)";
  if (/EdgiOS/i.test(ua)) return "Edge iOS (WebKit)";
  if (/FxiOS/i.test(ua)) return "Firefox iOS (WebKit)";
  if (/Safari/i.test(ua) && /Version/i.test(ua)) return "Mobile Safari/WebKit";
  if (/Android/i.test(ua)) return "Android browser";
  return "Desktop/other";
}

function resolveFocusDuration({ disabledMotion, fast, mobile, angularDistance, iosWebKit }: { disabledMotion: boolean; fast: boolean; mobile: boolean; angularDistance: number; iosWebKit: boolean }) {
  if (disabledMotion) return REDUCED_MOTION_FOCUS_DURATION_MS;
  if (iosWebKit) return IOS_PRIMARY_FOCUS_DURATION_MS;
  const distanceRatio = Math.min(1, Math.max(0, angularDistance / Math.PI));
  if (fast) return Math.max(MOBILE_FAST_FOCUS_DURATION_MS, DESKTOP_FAST_FOCUS_DURATION_MS);
  const baseDuration = mobile ? MOBILE_PRIMARY_FOCUS_DURATION_MS : DESKTOP_PRIMARY_FOCUS_DURATION_MS;
  const scaledDuration = lerp(MINIMUM_FOCUS_DURATION_MS, LONG_DISTANCE_FOCUS_DURATION_MS, easeInOutCubic(distanceRatio));
  return Math.round(Math.max(baseDuration, scaledDuration));
}

function angularDistanceDegrees(a: Pick<GlobePoint, "lat" | "lng">, b: Pick<GlobePoint, "lat" | "lng">) {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))) / DEG;
}

function angularDistanceBetweenPoints(a: GlobePoint | null, b: GlobePoint | null) {
  if (!a || !b) return null;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function stationPoint(station?: Station): GlobePoint | null {
  if (!station) return null;
  const beacon = getActiveBeaconFeature(station);
  const geo = resolveStationGeo(station);
  if (!beacon || geo.lat === null || geo.lng === null) return null;
  const usedFallbackCentroid = geo.source === "country_centroid";
  const point = { lat: beacon.geometry.coordinates[1], lng: beacon.geometry.coordinates[0], label: beacon.properties.label, geoSource: beacon.properties.source, geoPrecision: beacon.properties.precision, usedFallbackCentroid };
  if (DEBUG_SIGNALS) console.debug("[WaveAtlas signals] active beacon coordinates", { view: "globe", station: station.name, lat: point.lat, lng: point.lng, source: point.geoSource, precision: point.geoPrecision });
  debugGlobeFocus("stationPoint", { station: station.name, city: station.city, country: station.country, latitude: point.lat, longitude: point.lng, derivedLat: point.lat, derivedLng: point.lng, geoSource: geo.source, geoPrecision: geo.precision, coordinatesFrom: usedFallbackCentroid ? "fallback_country_centroid" : "station_or_resolved_geo", warning: geo.warning });
  return point;
}

function countryNameForCode(code: string) {
  try {
    return COUNTRY_NAMES.of(code) || code;
  } catch {
    return code;
  }
}

function nearestCountry(lat: number, lng: number): CountryResult | null {
  let best: { code: string; distance: number } | null = null;
  for (const [code, point] of Object.entries(isoCountryCentroids)) {
    const dLat = (lat - point.lat) * DEG;
    const dLng = (lng - point.lng) * DEG;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * DEG) * Math.cos(point.lat * DEG) * Math.sin(dLng / 2) ** 2;
    const distance = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (!best || distance < best.distance) best = { code, distance };
  }
  if (!best || best.distance > 1700) return null;
  const centroid = isoCountryCentroids[best.code];
  return { name: countryNameForCode(best.code), code: best.code, flag: flagFor(best.code), centroid, station_count: 0 };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getDeviceProfile() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return { lowPower: false, mobile: false, webgl: false, reason: "server" };
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number; userAgentData?: { mobile?: boolean } };
  const ua = navigator.userAgent || "";
  const mobile = Boolean(nav.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const lowPower = (nav.deviceMemory ?? 8) <= 3 || (nav.hardwareConcurrency ?? 8) <= 4;
  const probe = document.createElement("canvas");
  const webgl = Boolean(probe.getContext("webgl2") || probe.getContext("webgl") || probe.getContext("experimental-webgl"));
  return { lowPower, mobile, webgl, reason: lowPower ? "reduced mobile effects" : "full effects" };
}

function debugGlobeDecision(details: Record<string, unknown>) {
  if (!globeDebugEnabled()) return;
  console.info("[WaveAtlas globe]", details);
}

function debugGlobeCoordinates(details: Record<string, unknown>) {
  if (!globeDebugEnabled()) return;
  console.info("[WaveAtlas globe coordinates]", details);
}

const CITY_LIGHTS: GlobePoint[] = [
  { lat: 40.7128, lng: -74.006, label: "New York" }, { lat: 34.0522, lng: -118.2437, label: "Los Angeles" },
  { lat: 51.5072, lng: -0.1276, label: "London" }, { lat: 48.8566, lng: 2.3522, label: "Paris" },
  { lat: 35.6762, lng: 139.6503, label: "Tokyo" }, { lat: 28.6139, lng: 77.209, label: "Delhi" },
  { lat: 19.076, lng: 72.8777, label: "Mumbai" }, { lat: 31.2304, lng: 121.4737, label: "Shanghai" },
  { lat: -23.5505, lng: -46.6333, label: "São Paulo" }, { lat: 30.0444, lng: 31.2357, label: "Cairo" },
  { lat: 6.5244, lng: 3.3792, label: "Lagos" }, { lat: -33.8688, lng: 151.2093, label: "Sydney" },
  { lat: 37.5665, lng: 126.978, label: "Seoul" }, { lat: 41.0082, lng: 28.9784, label: "Istanbul" },
  { lat: 55.7558, lng: 37.6173, label: "Moscow" }, { lat: -34.6037, lng: -58.3816, label: "Buenos Aires" },
];


function readGlobeFavoriteSet() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem("waveatlas:favorites") || "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function globeCenterFromRotation(rotX: number, rotY: number) {
  return { centerLat: Math.max(-89, Math.min(89, rotX / DEG)), centerLng: ((((rotY / DEG) % 360) + 540) % 360) - 180 };
}

function readMobileViewport(wrap: HTMLDivElement, canvas: HTMLCanvasElement) {
  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const visualViewport = typeof window !== "undefined" ? window.visualViewport : undefined;
  const headerRect = document.querySelector('[aria-label="Open station search"]')?.getBoundingClientRect();
  const dockRect = document.querySelector('nav[class*="bottom-0"]')?.getBoundingClientRect();
  const toastRect = document.querySelector('[role="status"], [role="alert"]')?.getBoundingClientRect();
  const playerRect = document.querySelector('[data-waveatlas-player], [aria-label="Now playing"]')?.getBoundingClientRect();
  const visualHeight = visualViewport?.height ?? window.innerHeight;
  const safeAreaBottomEstimate = Math.max(0, window.innerHeight - visualHeight - (visualViewport?.offsetTop ?? 0));
  const topObstruction = headerRect ? Math.max(0, headerRect.bottom - canvasRect.top + 16) : 0;
  const bottomObstruction = Math.max(safeAreaBottomEstimate, dockRect ? Math.max(0, canvasRect.bottom - dockRect.top + 16) : 0, toastRect ? Math.max(0, canvasRect.bottom - toastRect.top + 16) : 0, playerRect ? Math.max(0, canvasRect.bottom - playerRect.top + 16) : 0);
  const usableBounds = { left: 0, top: Math.min(canvasRect.height, topObstruction), right: canvasRect.width, bottom: Math.max(0, canvasRect.height - bottomObstruction) };
  return {
    canvasRect: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
    wrapRect: { left: wrapRect.left, top: wrapRect.top, width: wrapRect.width, height: wrapRect.height },
    visualViewport: visualViewport ? { width: visualViewport.width, height: visualViewport.height, offsetTop: visualViewport.offsetTop, offsetLeft: visualViewport.offsetLeft, scale: visualViewport.scale } : null,
    safeAreaBottomEstimate,
    headerRect: headerRect ? { left: headerRect.left, top: headerRect.top, width: headerRect.width, height: headerRect.height, bottom: headerRect.bottom } : null,
    dockRect: dockRect ? { left: dockRect.left, top: dockRect.top, width: dockRect.width, height: dockRect.height, bottom: dockRect.bottom } : null,
    toastRect: toastRect ? { left: toastRect.left, top: toastRect.top, width: toastRect.width, height: toastRect.height, bottom: toastRect.bottom } : null,
    playerRect: playerRect ? { left: playerRect.left, top: playerRect.top, width: playerRect.width, height: playerRect.height, bottom: playerRect.bottom } : null,
    usableBounds,
  };
}

function loadGlobeTexture(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Texture failed to load: ${src}`));
    image.src = src;
  });
}

async function loadPhotorealisticTextures(quality: GlobeQualityTier, onStatus: (key: GlobeTextureKey, status: GlobeTextureStatus) => void): Promise<GlobeTextureBundle> {
  const images: Partial<Record<GlobeTextureKey, HTMLImageElement>> = {};
  const status: Record<GlobeTextureKey, GlobeTextureStatus> = { ...EMPTY_TEXTURE_STATUS };
  let fallbackReason: string | undefined;
  await Promise.all((Object.keys(EARTH_TEXTURES) as GlobeTextureKey[]).map(async (key) => {
    const texture = EARTH_TEXTURES[key];
    status[key] = "loading";
    onStatus(key, "loading");
    try {
      images[key] = await loadGlobeTexture(texture[quality]);
      status[key] = "loaded";
      onStatus(key, "loaded");
    } catch (error) {
      status[key] = "failed";
      onStatus(key, "failed");
      if (texture.required) fallbackReason = error instanceof Error ? error.message : `${key} texture failed to load`;
    }
  }));
  return { status, images, fallbackReason };
}

const GLOBE_STYLE_COPY: Record<GlobeBasemapKey, string> = {
  blueMarble: "Blue Marble Globe",
  night: "Night Globe",
  signal: "Signal Globe",
  photorealistic: "Photorealistic Globe",
};

export default function BlueMarbleGlobe({ station, stations = [], previousStation, teleporting = false, onCountrySelect, onFallback, onStreetZoomRequest, mobile = false, basemap = "photorealistic", selectionVersion }: Props) {
  const effectiveBasemap: GlobeBasemapKey = basemap;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [landShapes, setLandShapes] = useState<LandShape[]>([]);
  const state = useRef({ rotX: -10 * DEG, rotY: 0, zoom: 1, targetX: -10 * DEG, targetY: 0, targetZoom: 1, travelStartX: -10 * DEG, travelStartY: 0, travelStartZoom: 1, focusStartedAt: 0, focusDuration: 1100, dragging: false, lastX: 0, lastY: 0, downX: 0, downY: 0, disabledMotion: false, hidden: false, focusToken: 0, activeFocusToken: 0, activeSelectionVersion: selectionVersion, verificationPending: false, correctiveFocusRan: false, verifiedPointKey: "", travelActive: false, landingPulseStartedAt: 0, progressMilestones: new Set<number>(), activeFocusIdentityKey: "" });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const currentPoint = useMemo(() => stationPoint(station), [station]);
  const stationLabel = useMemo(() => [station.city || station.state, station.country].filter(Boolean).join(", ") || station.name, [station]);
  const globeLabels = useMemo<GlobeLabel[]>(() => currentPoint ? [{ ...currentPoint, label: stationLabel, active: true, kind: "active", priority: 1000 }] : [], [currentPoint, stationLabel]);
  const stationFocusIdentityKey = useMemo(() => [stationKey(station), currentPoint?.lat ?? "none", currentPoint?.lng ?? "none", selectionVersion ?? "none"].join(":"), [currentPoint?.lat, currentPoint?.lng, selectionVersion, station]);
  const signalConstellation = useMemo(() => buildSignalFeatures({ stations, currentStation: station, globeVisibleHemisphere: { centerLat: -10, centerLng: 0 }, globeScale: 1, favoriteIds: readGlobeFavoriteSet(), maxSignals: mobile ? 220 : 520 }), [mobile, station, stations]);
  const runtimeRef = useRef<GlobeRuntime>({ currentPoint, selectionVersion, focusIdentityKey: stationFocusIdentityKey, stationName: station.name, stationCity: station.city || station.state, stationCountry: station.country, stationLabel, basemap: effectiveBasemap, teleporting, labels: globeLabels, landShapes, signalFeatures: signalConstellation.visibleSignals, signalClusters: signalConstellation.clusters });
  const lastCoordinateLogRef = useRef("");
  const stableSizeRef = useRef<CanvasSize | null>(null);
  const fallbackRef = useRef(onFallback);
  const streetZoomRequestRef = useRef(onStreetZoomRequest);
  const streetZoomTriggeredRef = useRef(false);
  const [debugOverlay, setDebugOverlay] = useState<GlobeDebugOverlay | null>(null);
  const debugOverlayTickRef = useRef(0);
  const diagnosticsTickRef = useRef(0);
  const settledFocusLogRef = useRef("");
  const lastFocusKeyRef = useRef("");
  const previousFocusRef = useRef<{ name: string; point: GlobePoint | null } | null>(null);
  const signalRefreshKeyRef = useRef("");
  const photorealisticFallbackNotifiedRef = useRef(false);
  const textureRetryAttemptRef = useRef(0);
  const textureRecoveryStatusRef = useRef("idle");
  const textureBundleRef = useRef<GlobeTextureBundle>({ status: { ...EMPTY_TEXTURE_STATUS }, images: {} });
  const [textureStatus, setTextureStatus] = useState<Record<GlobeTextureKey, GlobeTextureStatus>>({ ...EMPTY_TEXTURE_STATUS });
  const [textureRecoveryStatus, setTextureRecoveryStatus] = useState("idle");
  const [rendererDiagnosticsSnapshot, setRendererDiagnosticsSnapshot] = useState<RendererDiagnosticsSnapshot | null>(null);

  const focusPoint = useCallback((point: GlobePoint | null, fast = false) => {
    if (!point) return;
    const focusKey = stationFocusIdentityKey;
    const s = state.current;
    if (lastFocusKeyRef.current === focusKey && !s.disabledMotion) {
      debugGlobeFocus("focusPoint duplicate restarting", { selectionVersion, focusKey, label: point.label, fast, reason: "same station/point/version requested again; recentering to prevent drift", travelActive: s.travelActive, focusProgress: s.focusDuration <= 0 ? 1 : Math.min(1, ((typeof performance !== "undefined" ? performance.now() : Date.now()) - s.focusStartedAt) / s.focusDuration) });
    }
    lastFocusKeyRef.current = focusKey;
    const previousPoint = previousFocusRef.current?.point ?? (previousStation ? stationPoint(previousStation) : null);
    const rotation = focusRotationForPoint(point);
    const targetRotX = clampFocusLatitude(rotation.rotX);
    const shortestDeltaY = Math.atan2(Math.sin(rotation.rotY - s.rotY), Math.cos(rotation.rotY - s.rotY));
    const targetRotY = s.rotY + shortestDeltaY;
    const rotationAngularDistance = Math.min(Math.PI, Math.abs(shortestDeltaY) + Math.abs(targetRotX - s.rotX) * 0.7);
    const stationAngularDistance = angularDistanceBetweenPoints(previousPoint, point);
    const angularDistance = stationAngularDistance ?? rotationAngularDistance;
    const targetZoom = mobile ? (fast ? 1.18 : 1.12) : (fast ? 1.2 : 1.08);
    const iosWebKit = isIOSWebKit();
    const focusDuration = resolveFocusDuration({ disabledMotion: s.disabledMotion, fast, mobile, angularDistance, iosWebKit });
    if (!s.disabledMotion && focusDuration < (iosWebKit ? IOS_MINIMUM_FOCUS_DURATION_MS : MINIMUM_FOCUS_DURATION_MS)) warnGlobeFocus("focusDuration below minimum", { selectionVersion, label: point.label, focusDuration, minimumFocusDuration: iosWebKit ? IOS_MINIMUM_FOCUS_DURATION_MS : MINIMUM_FOCUS_DURATION_MS, reducedMotion: s.disabledMotion, fast, fastFlagSource: "BlueMarbleGlobe.teleporting prop", mobile, iosWebKit });
    debugGlobeFocus("focusRotationForPoint", { selectionVersion, label: point.label, latitude: point.lat, longitude: point.lng, rotX: rotation.rotX / DEG, rotY: rotation.rotY / DEG });
    s.focusToken += 1;
    s.activeFocusToken = s.focusToken;
    s.activeSelectionVersion = selectionVersion;
    s.activeFocusIdentityKey = focusKey;
    s.verificationPending = true;
    s.correctiveFocusRan = false;
    s.verifiedPointKey = "";
    s.travelStartX = s.rotX;
    s.travelStartY = s.rotY;
    s.travelStartZoom = s.zoom;
    s.travelActive = !s.disabledMotion;
    s.progressMilestones = new Set<number>();
    s.landingPulseStartedAt = 0;
    wrapRef.current?.setAttribute("data-globe-travel-active", String(!s.disabledMotion));
    window.dispatchEvent(new CustomEvent("waveatlas:globe-travel", { detail: { active: !s.disabledMotion, iosWebKit, startedAt: Date.now(), selectionVersion } }));
    debugGlobeFocus("focusPoint", { selectionVersion, fastFlagSource: "BlueMarbleGlobe.teleporting prop", minimumFocusDuration: MINIMUM_FOCUS_DURATION_MS, primaryEasing: "easeInOutCubic", arrivalEasing: "easeOutQuart", previousStation: previousFocusRef.current?.name ?? previousStation?.name ?? null, previousLat: previousPoint?.lat ?? null, previousLng: previousPoint?.lng ?? null, previousRotX: s.rotX / DEG, previousRotY: s.rotY / DEG, previousZoom: s.zoom, nextStation: station.name, nextLat: point.lat, nextLng: point.lng, startRotation: { rotX: s.travelStartX / DEG, rotY: s.travelStartY / DEG }, targetRotation: { rotX: targetRotX / DEG, rotY: targetRotY / DEG }, computedTargetRotX: targetRotX / DEG, computedTargetRotY: targetRotY / DEG, targetZoom, shortestDeltaY: shortestDeltaY / DEG, angularDistance: angularDistance / DEG, stationAngularDistance: stationAngularDistance === null ? null : stationAngularDistance / DEG, rotationAngularDistance: rotationAngularDistance / DEG, iosWebKit, browser: describeBrowser(), focusDuration, durationNearZero: focusDuration <= 16, mobile, reducedMotion: s.disabledMotion, fast, correctionPass: false, geoSource: point.geoSource, geoPrecision: point.geoPrecision, stages: ["zoom-out", "shortest-path-rotation", "final-centered-approach", "landing-pulse"] });
    s.targetY = targetRotY;
    s.targetX = targetRotX;
    s.targetZoom = targetZoom;
    s.focusStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    s.focusDuration = focusDuration;
    if (s.disabledMotion) { debugGlobeFocus("focusPoint reduced-motion snap", { selectionVersion, label: point.label, targetRotX: s.targetX / DEG, targetRotY: s.targetY / DEG, targetZoom: s.targetZoom }); s.rotX = s.targetX; s.rotY = s.targetY; s.zoom = s.targetZoom; }
    previousFocusRef.current = { name: station.name, point };
  }, [mobile, previousStation, selectionVersion, station.name, stationFocusIdentityKey]);

  useEffect(() => { fallbackRef.current = onFallback; }, [onFallback]);
  useEffect(() => { streetZoomRequestRef.current = onStreetZoomRequest; streetZoomTriggeredRef.current = false; }, [onStreetZoomRequest, station.id]);
  const requestStreetZoom = useCallback((zoom: number, reason: string) => {
    if (streetZoomTriggeredRef.current) return;
    const point = runtimeRef.current.currentPoint;
    if (!point) return;
    streetZoomTriggeredRef.current = true;
    if (process.env.NODE_ENV !== "production") console.info("[WaveAtlas] atlas view transition", { fromView: "globe", toView: "map", activeStation: station.name, coordinates: { lat: point.lat, lng: point.lng }, zoomLevel: zoom, transitionReason: reason, preservedContext: true });
    streetZoomRequestRef.current?.({ lat: point.lat, lng: point.lng, zoom, stationId: station.station_uuid || station.id, reason });
  }, [station.id, station.name, station.station_uuid]);

  useEffect(() => {
    runtimeRef.current = { currentPoint, selectionVersion, focusIdentityKey: stationFocusIdentityKey, stationName: station.name, stationCity: station.city || station.state, stationCountry: station.country, stationLabel, basemap: effectiveBasemap, teleporting, labels: globeLabels, landShapes, signalFeatures: signalConstellation.visibleSignals, signalClusters: signalConstellation.clusters };
  }, [effectiveBasemap, currentPoint, globeLabels, landShapes, selectionVersion, stationFocusIdentityKey, signalConstellation, station.city, station.country, station.name, station.state, stationLabel, teleporting]);

  useEffect(() => {
    if (typeof window === "undefined" || !shouldRenderPhotorealisticBasemap(effectiveBasemap)) return;
    let mounted = true;
    let retryTimer = 0;
    const quality = resolveGlobeQualityTier(mobile, getDeviceProfile().lowPower);
    const runLoad = () => {
      textureRecoveryStatusRef.current = textureRetryAttemptRef.current ? `retrying (${textureRetryAttemptRef.current})` : "loading";
      setTextureRecoveryStatus(textureRecoveryStatusRef.current);
      void loadPhotorealisticTextures(quality, (key, status) => {
        if (!mounted) return;
        setTextureStatus((prev) => ({ ...prev, [key]: status }));
      }).then((bundle) => {
        if (!mounted) return;
        textureBundleRef.current = bundle;
        setTextureStatus(bundle.status);
        if (bundle.fallbackReason) {
          textureRecoveryStatusRef.current = "recovering";
          setTextureRecoveryStatus("recovering");
          const attempt = textureRetryAttemptRef.current++;
          const delay = Math.min(TEXTURE_RETRY_MAX_MS, TEXTURE_RETRY_BASE_MS * 2 ** attempt);
          if (globeDebugEnabled()) setRendererDiagnosticsSnapshot({ mode: "blueMarble-fallback", quality, fps: 0, frameTimeMs: 0, textureStatus: bundle.status, fallbackReason: bundle.fallbackReason, recoveryStatus: `retry in ${Math.round(delay / 1000)}s` });
          retryTimer = window.setTimeout(runLoad, delay);
          return;
        }
        textureRetryAttemptRef.current = 0;
        textureRecoveryStatusRef.current = "available";
        setTextureRecoveryStatus("available");
        photorealisticFallbackNotifiedRef.current = false;
        if (globeDebugEnabled()) setRendererDiagnosticsSnapshot({ mode: "photorealistic-texture", quality, fps: 0, frameTimeMs: 0, textureStatus: bundle.status, fallbackReason: null, recoveryStatus: "available" });
      });
    };
    runLoad();
    return () => { mounted = false; window.clearTimeout(retryTimer); };
  }, [effectiveBasemap, mobile]);

  useEffect(() => {
    let mounted = true;
    loadLandShapes()
      .then((shapes) => { if (mounted) setLandShapes(shapes); })
      .catch(() => { if (mounted) setLandShapes([]); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const profile = getDeviceProfile();
    const iosWebKit = isIOSWebKit();
    debugGlobeDecision({ selectedView: "globe", viewport: `${window.innerWidth}x${window.innerHeight}`, visualViewport: window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop, offsetLeft: window.visualViewport.offsetLeft, scale: window.visualViewport.scale } : null, device: profile.mobile ? "mobile" : "desktop", browser: describeBrowser(), iosWebKit, userAgent: navigator.userAgent, lowPower: profile.lowPower, webglSupport: profile.webgl, reducedMotion: prefersReducedMotion(), fallbackReason: null });
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d", { alpha: true });
      if (ctx) debugGlobeDecision({ selectedView: "globe", canvasContext: "2d", initialization: "success", viewport: `${window.innerWidth}x${window.innerHeight}` });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Canvas globe initialization failed.";
      console.warn("[WaveAtlas globe] canvas initialization failed", { reason, timestamp: Date.now() });
      fallbackRef.current?.(reason);
      return;
    }
    if (!ctx) {
      console.warn("[WaveAtlas globe] canvas initialization failed", { reason: "Canvas globe context unavailable.", timestamp: Date.now() });
      fallbackRef.current?.("Canvas globe context unavailable.");
      return;
    }
    state.current.disabledMotion = prefersReducedMotion();
    debugGlobeFocus("reducedMotion detection", { reducedMotion: state.current.disabledMotion, mediaQuery: "(prefers-reduced-motion: reduce)" });
    setReady(true);
    let raf = 0;
    let throttleTimer = 0;
    let lastFrame = 0;
    let then = performance.now();
    let painted = false;
    const transitionStats = { active: false, startedAt: 0, frameCount: 0, droppedFrames: 0, maxFrameGap: 0, totalFrameGap: 0, startSize: null as CanvasSize | null, canvasSizeChanged: false, resizeEvents: [] as string[] };
    const fallbackTimer = mobile ? window.setTimeout(() => { if (!painted) fallbackRef.current?.("Globe view is optimized for this device using map mode."); }, MOBILE_FALLBACK_MS) : 0;

    const project = (lat: number, lng: number, projection: D3GeoProjection, diagnostics?: RendererDiagnostics): GlobeProjection => {
      const projected = projection([lng, lat]);
      if (!projected) {
        if (diagnostics) diagnostics.hiddenPointSkips += 1;
        return { x: Number.NaN, y: Number.NaN, z: -1, vector: { x: Number.NaN, y: Number.NaN, z: -1 }, projection };
      }
      const z = globeDepthFromProjection({ lat, lng }, projection);
      return { x: projected[0], y: projected[1], z, vector: { x: Number.NaN, y: Number.NaN, z }, projection };
    };

    const labelBoxes: Array<{ left: number; right: number; top: number; bottom: number; active: boolean }> = [];
    const drawLabel = (label: GlobeLabel, projection: D3GeoProjection, options: { force?: boolean } = {}) => {
      const p = project(label.lat, label.lng, projection);
      const active = Boolean(label.active || label.kind === "active");
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.z < (active ? -0.08 : 0.03)) return false;
      const kind = label.kind ?? (active ? "active" : "station");
      const fontSize = active ? (mobile ? 12 : 13) : kind === "country" ? (mobile ? 9 : 10) : kind === "city" ? (mobile ? 8 : 9) : (mobile ? 8 : 9);
      const weight = active ? 800 : kind === "country" ? 700 : 600;
      const y = p.y - (active ? (mobile ? 24 : 28) : kind === "station" ? 16 : 0);
      ctx.save();
      ctx.font = `${weight} ${fontSize}px var(--font-sans), Inter, system-ui, sans-serif`;
      const width = Math.min(ctx.measureText(label.label).width, mobile ? 132 : 180);
      const padX = active ? 8 : 5;
      const padY = active ? 5 : 3;
      const box = { left: p.x - width / 2 - padX, right: p.x + width / 2 + padX, top: y - fontSize / 2 - padY, bottom: y + fontSize / 2 + padY, active };
      const collides = labelBoxes.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
      if (collides && !active && !options.force) { ctx.restore(); return false; }
      labelBoxes.push(box);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = active ? 4.5 : 3;
      ctx.strokeStyle = active ? "rgba(2,6,23,0.92)" : "rgba(2,6,23,0.78)";
      ctx.strokeText(label.label, p.x, y, mobile ? 132 : 180);
      ctx.fillStyle = active ? "rgba(255,255,255,0.98)" : kind === "country" ? "rgba(226,232,240,0.66)" : kind === "city" ? "rgba(186,230,253,0.68)" : "rgba(209,250,229,0.74)";
      ctx.fillText(label.label, p.x, y, mobile ? 132 : 180);
      ctx.restore();
      return true;
    };

    const drawProgressiveLabels = (projection: D3GeoProjection, activeBeacon: GlobePoint | null, runtime: GlobeRuntime, zoom: number) => {
      labelBoxes.length = 0;
      const labels: GlobeLabel[] = [];
      if (activeBeacon) labels.push({ ...activeBeacon, label: runtime.stationLabel, active: true, kind: "active", priority: 1000 });
      if (zoom <= 1.48) {
        const countryLimit = mobile ? 7 : zoom < 1.1 ? 12 : 22;
        for (const shape of runtime.landShapes) {
          if (!shape.code || !(shape.code in isoCountryCentroids)) continue;
          const centroid = isoCountryCentroids[shape.code as keyof typeof isoCountryCentroids] ?? shape.centroid;
          labels.push({ lat: centroid.lat, lng: centroid.lng, label: shape.name, kind: "country", priority: Math.max(0, 180 - Math.abs(centroid.lat)) });
          if (labels.filter((item) => item.kind === "country").length >= countryLimit * 2) break;
        }
      }
      if (zoom >= 1.18 && zoom < 1.9) {
        const cityLimit = mobile ? 5 : 12;
        for (const city of CITY_LIGHTS.slice(0, cityLimit + 6)) labels.push({ ...city, kind: "city", priority: 120 - (activeBeacon ? angularDistanceDegrees(city, activeBeacon) : 0) });
      }
      if (activeBeacon && zoom >= 1.72) {
        const stationLimit = mobile ? 3 : 8;
        const nearbyStations = runtime.signalFeatures
          .map((feature): GlobeLabel => ({ lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0], label: feature.properties.name, kind: "station", priority: feature.properties.priority - angularDistanceDegrees({ lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0] }, activeBeacon) * 2 }))
          .filter((label) => angularDistanceDegrees(label, activeBeacon) <= (zoom >= 1.95 ? 24 : 14))
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .slice(0, stationLimit);
        labels.push(...nearbyStations);
      }
      for (const label of labels.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) drawLabel(label, projection, { force: Boolean(label.active) });
    };

    const drawFrame = (now: number) => {
      const frameMs = mobile || profile.lowPower ? MOBILE_FRAME_MS : DESKTOP_FRAME_MS;
      if (now - lastFrame < frameMs - 1) { raf = requestAnimationFrame(draw); return; }
      lastFrame = now;
      const rawDt = now - then;
      const dt = iosWebKit && state.current.travelActive ? Math.min(IOS_FRAME_DELTA_CLAMP_MS, rawDt) : Math.min(50, rawDt);
      then = now;
      if (state.current.travelActive) {
        if (!transitionStats.active) { transitionStats.active = true; transitionStats.startedAt = now; transitionStats.frameCount = 0; transitionStats.droppedFrames = 0; transitionStats.maxFrameGap = 0; transitionStats.totalFrameGap = 0; transitionStats.startSize = stableSizeRef.current; transitionStats.canvasSizeChanged = false; transitionStats.resizeEvents = []; }
        transitionStats.frameCount += 1; transitionStats.maxFrameGap = Math.max(transitionStats.maxFrameGap, rawDt); transitionStats.totalFrameGap += rawDt; if (rawDt > 34) transitionStats.droppedFrames += Math.max(1, Math.floor(rawDt / 16.7) - 1);
      }
      const size = stableSizeRef.current;
      const dpr = size?.dpr ?? Math.min(mobile || profile.lowPower ? 1.25 : 2, window.devicePixelRatio || 1);
      const w = Math.max(1, size?.cssWidth ?? Math.floor(wrap.clientWidth));
      const h = Math.max(1, size?.cssHeight ?? Math.floor(wrap.clientHeight));
      const pixelWidth = size?.pixelWidth ?? Math.floor(w * dpr);
      const pixelHeight = size?.pixelHeight ?? Math.floor(h * dpr);
      if (transitionStats.active && transitionStats.startSize && (transitionStats.startSize.cssWidth !== w || transitionStats.startSize.cssHeight !== h || transitionStats.startSize.pixelWidth !== pixelWidth || transitionStats.startSize.pixelHeight !== pixelHeight)) transitionStats.canvasSizeChanged = true;
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        if (!(iosWebKit && state.current.travelActive && stableSizeRef.current)) { canvas.width = pixelWidth; canvas.height = pixelHeight; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; }
      }
      const runtime = runtimeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = state.current;
      const focusElapsed = s.focusStartedAt ? now - s.focusStartedAt : s.focusDuration;
      const focusProgress = s.focusDuration <= 0 ? 1 : Math.min(1, focusElapsed / s.focusDuration);
      if (s.disabledMotion) {
        s.rotX = s.targetX; s.rotY = s.targetY; s.zoom = s.targetZoom;
      } else if (s.travelActive && focusProgress < 1) {
        const zoomOutEnd = 0.24;
        const approachStart = 0.72;
        const rotateProgress = iosWebKit ? easeInOutCubic(focusProgress) : focusProgress < zoomOutEnd ? easeInOutCubic(focusProgress / zoomOutEnd) * 0.08 : focusProgress < approachStart ? 0.08 + easeInOutCubic((focusProgress - zoomOutEnd) / (approachStart - zoomOutEnd)) * 0.76 : 0.84 + easeOutQuart((focusProgress - approachStart) / (1 - approachStart)) * 0.16;
        const zoomOut = Math.max(0.86, s.travelStartZoom - (mobile ? 0.1 : 0.14));
        const stagedZoom = focusProgress < approachStart ? lerp(s.travelStartZoom, zoomOut, easeOutQuart(Math.min(1, focusProgress / approachStart))) : lerp(zoomOut, s.targetZoom, easeOutQuart((focusProgress - approachStart) / (1 - approachStart)));
        s.rotX = lerp(s.travelStartX, s.targetX, rotateProgress);
        s.rotY = lerp(s.travelStartY, s.targetY, rotateProgress);
        s.zoom = stagedZoom;
      } else {
        s.rotX = s.targetX; s.rotY = s.targetY; s.zoom = s.targetZoom;
        if (s.travelActive) { s.travelActive = false; s.landingPulseStartedAt = now; }
      }
      const activeFocusVerified = runtime.currentPoint ? s.verifiedPointKey === runtime.focusIdentityKey : true;
      if (s.activeFocusIdentityKey !== runtime.focusIdentityKey && s.travelActive) { debugGlobeFocus("stale transition cancelled", { activeFocusIdentityKey: s.activeFocusIdentityKey, runtimeFocusIdentityKey: runtime.focusIdentityKey, activeSelectionVersion: s.activeSelectionVersion, runtimeSelectionVersion: runtime.selectionVersion, travelActive: s.travelActive }); s.travelActive = false; }
      if (globeDebugEnabled() && s.focusStartedAt && s.activeSelectionVersion === runtime.selectionVersion) {
        for (const milestone of [0, 25, 50, 75, 100]) {
          if (focusProgress >= milestone / 100 && !s.progressMilestones.has(milestone)) {
            s.progressMilestones.add(milestone);
            debugGlobeFocus("animation progress", { selectionVersion: runtime.selectionVersion, station: runtime.stationName, progressPercent: milestone, focusProgress, rotX: s.rotX / DEG, rotY: s.rotY / DEG, zoom: s.zoom, targetRotX: s.targetX / DEG, targetRotY: s.targetY / DEG, targetZoom: s.targetZoom, travelActive: s.travelActive });
          }
        }
      }
      if (!runtime.currentPoint && !s.dragging && !s.disabledMotion && !s.hidden && focusProgress >= 1 && activeFocusVerified) s.targetY += (mobile ? 0.00016 : 0.00035) * (runtime.teleporting ? (mobile ? 1.4 : 2.6) : 1);
      const r = Math.min(w, h) * (mobile ? 0.46 : 0.34) * s.zoom;
      const cx = w / 2, cy = mobile ? h * 0.42 : h / 2;
      const viewportDebug = mobile || globeDebugEnabled() ? readMobileViewport(wrap, canvas) : null;
      const usableBounds = viewportDebug?.usableBounds ?? { left: 0, top: 0, right: w, bottom: h };
      const targetScreenX = cx;
      const targetScreenY = cy;

      const textureBundle = textureBundleRef.current;
      const requiredTextureKeys: GlobeTextureKey[] = ["day", "night", "clouds", "detail"];
      const requiredTexturesLoaded = requiredTextureKeys.every((key) => textureBundle.status[key] === "loaded" && textureBundle.images[key]);
      const requiredTextureFailed = requiredTextureKeys.some((key) => textureBundle.status[key] === "failed") || Boolean(textureBundle.fallbackReason);
      const userSelectedBasemap = runtime.basemap;
      const wantsPhotorealistic = shouldRenderPhotorealisticBasemap(userSelectedBasemap);
      let photorealisticPreview = wantsPhotorealistic && requiredTexturesLoaded && !requiredTextureFailed;
      let effectiveRenderBasemap: GlobeBasemapKey = wantsPhotorealistic && !photorealisticPreview ? "blueMarble" : userSelectedBasemap;
      drawSpaceBackdrop(ctx, { width: w, height: h, cx, cy, radius: r, now, mobile, lowPower: profile.lowPower, reducedMotion: s.disabledMotion, basemap: effectiveRenderBasemap });
      const frameStartedAt = performance.now();
      const rendererDiagnostics: RendererDiagnostics = {
        drawCalls: 0,
        projectedPolygons: 0,
        hiddenPointSkips: 0,
        frameTimeMs: 0,
        estimatedFps: 0,
        beforeDrawCalls: photorealisticPreview ? runtime.landShapes.length * (resolveGlobeQualityTier(mobile, profile.lowPower) === "mobile" ? 2 : 3) : 0,
        beforeProjectedPolygons: photorealisticPreview ? runtime.landShapes.length * (resolveGlobeQualityTier(mobile, profile.lowPower) === "mobile" ? 2 : 3) : 0,
      };
      const globeQuality = resolveGlobeQualityTier(mobile, profile.lowPower);
      const bg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.55);
      bg.addColorStop(0, effectiveRenderBasemap === "night" ? "rgba(125,92,255,0.16)" : effectiveRenderBasemap === "signal" ? "rgba(0,214,143,0.12)" : "rgba(0,214,143,0.18)"); bg.addColorStop(0.64, "rgba(3,12,27,0.10)"); bg.addColorStop(1, "rgba(3,8,20,0)");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      const ocean = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.44, r * 0.12, cx, cy, r * 1.12);
      if (effectiveRenderBasemap === "night") { ocean.addColorStop(0, "#111827"); ocean.addColorStop(0.55, "#050816"); ocean.addColorStop(1, "#01030a"); }
      else if (effectiveRenderBasemap === "signal") { ocean.addColorStop(0, "#08213a"); ocean.addColorStop(0.55, "#031225"); ocean.addColorStop(1, "#010814"); }
      else { ocean.addColorStop(0, "#1f6f9d"); ocean.addColorStop(0.42, "#0c3b67"); ocean.addColorStop(1, "#031327"); }
      const projection = buildGlobeProjection(w, h, r, state.current.rotX, state.current.rotY, cx, cy)
        .precision(mobile || profile.lowPower ? 0.85 : 0.45);
      if (photorealisticPreview) {
        try {
          drawPhotorealisticSurface(ctx, { projection, cx, cy, r, now, quality: globeQuality, landShapes: runtime.landShapes, mobile, lowPower: profile.lowPower, reducedMotion: s.disabledMotion, diagnostics: rendererDiagnostics, textures: textureBundleRef.current });
        } catch (error) {
          photorealisticPreview = false;
          effectiveRenderBasemap = "blueMarble";
          if (process.env.NODE_ENV !== "production") console.warn("[WaveAtlas globe] photorealistic render fallback", error);
          photorealisticFallbackNotifiedRef.current = true;
          ctx.fillStyle = ocean; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
      } else {
        ctx.fillStyle = ocean; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      if (!photorealisticPreview && runtime.landShapes.length) {
        const path = geoPath(projection, ctx);
        const shapesToDraw = runtime.landShapes;

        ctx.fillStyle = photorealisticPreview ? "rgba(57,118,74,0.88)" : effectiveRenderBasemap === "night" ? "rgba(30,41,59,0.78)" : effectiveRenderBasemap === "signal" ? "rgba(18,52,70,0.66)" : "rgba(42,92,78,0.82)";
        for (const shape of shapesToDraw) {
          ctx.beginPath();
          path(shape.feature);
          ctx.fill("evenodd");
        }

        ctx.strokeStyle = photorealisticPreview ? "rgba(234,244,255,0.28)" : effectiveRenderBasemap === "night" ? "rgba(125,211,252,0.25)" : effectiveRenderBasemap === "signal" ? "rgba(125,211,252,0.38)" : "rgba(125,211,252,0.30)";
        ctx.lineWidth = mobile || profile.lowPower ? 0.42 : 0.65;
        for (const shape of shapesToDraw) {
          ctx.beginPath();
          path(shape.feature);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = effectiveRenderBasemap === "signal" ? "rgba(56,189,248,0.24)" : effectiveRenderBasemap === "night" ? "rgba(148,163,184,0.055)" : "rgba(147,197,253,0.09)"; ctx.lineWidth = mobile || profile.lowPower ? 0.45 : 0.7;
      const latStep = mobile || profile.lowPower ? 30 : 15;
      const lngStep = mobile || profile.lowPower ? 30 : 15;
      if (!photorealisticPreview) {
        for (let lat = -75; lat <= 75; lat += latStep) { ctx.beginPath(); let started = false; for (let lng = -180; lng <= 180; lng += 4) { const p = project(lat, lng, projection); if (p.z < -0.02) { started = false; continue; } started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); started = true; } ctx.stroke(); }
        for (let lng = -180; lng < 180; lng += lngStep) { ctx.beginPath(); let started = false; for (let lat = -85; lat <= 85; lat += 3) { const p = project(lat, lng, projection); if (p.z < -0.02) { started = false; continue; } started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); started = true; } ctx.stroke(); }
      }
      if (photorealisticPreview) {
        const lights = mobile || profile.lowPower ? CITY_LIGHTS.slice(0, 9) : CITY_LIGHTS;
        for (const light of lights) { const p = project(light.lat, light.lng, projection, rendererDiagnostics); if (p.z < -0.02) continue; const nightBoost = Math.max(0.15, 1 - Math.max(0, p.z) * 0.65); const glow = (1 + Math.max(0, p.z) * 1.2) * nightBoost; ctx.fillStyle = "rgba(251,191,36,0.24)"; ctx.beginPath(); ctx.arc(p.x, p.y, 4.8 * glow, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,244,180,0.78)"; ctx.beginPath(); ctx.arc(p.x, p.y, 1.05 * glow, 0, TAU); ctx.fill(); }
        drawCountryBoundaries(ctx, { projection, landShapes: runtime.landShapes, quality: globeQuality, mobile, lowPower: profile.lowPower, diagnostics: rendererDiagnostics });
      }
      if (effectiveRenderBasemap === "night") {
        const lights = mobile || profile.lowPower ? CITY_LIGHTS.slice(0, 9) : CITY_LIGHTS;
        for (const light of lights) { const p = project(light.lat, light.lng, projection, rendererDiagnostics); if (p.z < -0.02) continue; const glow = 1 + Math.max(0, p.z) * 1.8; ctx.fillStyle = "rgba(251,191,36,0.24)"; ctx.beginPath(); ctx.arc(p.x, p.y, 5.5 * glow, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,244,180,0.88)"; ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 * glow, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
      if (photorealisticPreview) {
        ctx.save();
        ctx.strokeStyle = "rgba(125,211,252,0.34)"; ctx.lineWidth = mobile ? 5 : 8; ctx.beginPath(); ctx.arc(cx, cy, r + (mobile ? 3 : 5), 0, TAU); ctx.stroke();
        const halo = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.28);
        halo.addColorStop(0, "rgba(96,165,250,0.22)"); halo.addColorStop(1, "rgba(96,165,250,0)");
        ctx.fillStyle = halo; ctx.fillRect(cx - r * 1.35, cy - r * 1.35, r * 2.7, r * 2.7);
        ctx.restore();
      }
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      const liveSignalBucket = s.zoom < 1.16 ? "world" : s.zoom < 1.45 ? "continent" : s.zoom < 1.9 ? "country" : "city";
      const liveCenter = globeCenterFromRotation(s.rotX, s.rotY);
      const liveSignalKey = `${stations.length}:${station.station_uuid || station.id}:${liveSignalBucket}:${Math.round(liveCenter.centerLat / 10)}:${Math.round(liveCenter.centerLng / 10)}`;
      if (!s.travelActive && signalRefreshKeyRef.current !== liveSignalKey) {
        signalRefreshKeyRef.current = liveSignalKey;
        const maxSignals = liveSignalBucket === "world" ? 0 : mobile ? (liveSignalBucket === "city" ? 250 : 110) : (liveSignalBucket === "city" ? 640 : 220);
        const nextSignals = buildSignalFeatures({ stations, currentStation: station, globeVisibleHemisphere: liveCenter, globeScale: s.zoom, favoriteIds: readGlobeFavoriteSet(), maxSignals, debug: DEBUG_SIGNALS });
        runtime.signalFeatures = nextSignals.visibleSignals;
        runtime.signalClusters = nextSignals.clusters;
        if (DEBUG_SIGNALS || process.env.NODE_ENV !== "production") console.debug("[WaveAtlas signals] refresh", { view: "globe", activeStation: station.name, zoomLevel: s.zoom, bucket: liveSignalBucket, renderedSignals: nextSignals.visibleSignals.length, renderedClusters: nextSignals.clusters.length, stats: nextSignals.stats });
      }
      if (runtime.signalClusters.length && s.zoom >= 1.16 && s.zoom < 1.9) {
        for (const cluster of runtime.signalClusters.slice(0, mobile ? 42 : 80)) {
          const p = project(cluster.lat, cluster.lng, projection);
          if (p.z < 0.02) continue;
          const radius = Math.min(mobile ? 15 : 20, 5 + Math.sqrt(cluster.count) * (mobile ? 1.45 : 2.05));
          ctx.fillStyle = "rgba(0,214,143,0.23)"; ctx.beginPath(); ctx.arc(p.x, p.y, radius * 2.15, 0, TAU); ctx.fill();
          ctx.fillStyle = "rgba(0,214,143,0.84)"; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, TAU); ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.64)"; ctx.lineWidth = 0.7; ctx.stroke();
        }
      }
      if (runtime.signalFeatures.length && s.zoom >= 1.45) {
        const majorOnly = s.zoom < 1.9;
        for (const feature of runtime.signalFeatures.slice(0, majorOnly ? (mobile ? 36 : 72) : runtime.signalFeatures.length)) {
          const [lng, lat] = feature.geometry.coordinates;
          const p = project(lat, lng, projection);
          if (p.z < 0.04) continue;
          const favorite = feature.properties.favorite;
          if (favorite) { ctx.strokeStyle = "rgba(255,215,0,0.9)"; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.arc(p.x, p.y, mobile ? 5.8 : 7.8, 0, TAU); ctx.stroke(); }
          ctx.fillStyle = feature.properties.status === "community" ? "#48C7FF" : feature.properties.status === "unverified" ? "#D4A64A" : "#00D68F";
          ctx.globalAlpha = majorOnly ? 0.8 : 0.9; ctx.beginPath(); ctx.arc(p.x, p.y, majorOnly ? (mobile ? 2.3 : 3.1) : (mobile ? 1.95 : 2.8), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      const activeBeacon = runtime.currentPoint;
      if (activeBeacon) {
        const p = project(activeBeacon.lat, activeBeacon.lng, projection);
        const deltaX = p.x - targetScreenX;
        const deltaY = p.y - targetScreenY;
        const frontFacing = p.z > 0.08;
        const withinTarget = Number.isFinite(p.x) && Number.isFinite(p.y) && frontFacing && p.x >= usableBounds.left && p.x <= usableBounds.right && p.y >= usableBounds.top && p.y <= usableBounds.bottom && Math.hypot(deltaX, deltaY) <= (mobile ? 36 : 54);
        const pointKey = runtime.focusIdentityKey;
        if (focusProgress >= 1 && s.verificationPending && !s.dragging) {
          if (!withinTarget && !s.correctiveFocusRan) {
            const frontCorrectionY = frontFacing ? 0 : Math.atan2(Math.sin(focusRotationForPoint(activeBeacon).rotY - s.targetY), Math.cos(focusRotationForPoint(activeBeacon).rotY - s.targetY));
            const horizontalCorrection = Number.isFinite(deltaX) ? deltaX / Math.max(1, r * Math.max(0.35, Math.abs(p.z))) : 0;
            const verticalCorrection = Number.isFinite(deltaY) ? -deltaY / Math.max(1, r) : 0;
            s.targetY += frontCorrectionY + horizontalCorrection;
            s.targetX = Math.max(-70 * DEG, Math.min(70 * DEG, s.targetX + verticalCorrection));
            s.focusStartedAt = now;
            s.travelStartX = s.rotX;
            s.travelStartY = s.rotY;
            s.travelStartZoom = s.zoom;
            s.travelActive = !s.disabledMotion;
            s.focusDuration = s.disabledMotion ? 0 : (iosWebKit ? IOS_POST_FOCUS_CORRECTION_DURATION_MS : POST_FOCUS_CORRECTION_DURATION_MS);
            s.correctiveFocusRan = true;
            debugGlobeFocus("post-focus corrective pass", { snapDirectly: s.disabledMotion, correctionMode: s.disabledMotion ? "instant" : "animated", correctionDuration: s.focusDuration, correctionPass: true, station: runtime.stationName, city: runtime.stationCity, country: runtime.stationCountry, selectionVersion: runtime.selectionVersion, stationLat: activeBeacon.lat, stationLng: activeBeacon.lng, derivedGlobePoint: activeBeacon, targetRotation: { rotX: s.targetX / DEG, rotY: s.targetY / DEG }, actualProjectedX: p.x, actualProjectedY: p.y, targetX: targetScreenX, targetY: targetScreenY, deltaX, deltaY, frontFacing, correctiveFocusRan: true, usableBounds });
          } else {
            s.verificationPending = false;
            s.verifiedPointKey = pointKey;
            debugGlobeFocus("post-focus verified", { snapDirectly: false, station: runtime.stationName, city: runtime.stationCity, country: runtime.stationCountry, selectionVersion: runtime.selectionVersion, stationLat: activeBeacon.lat, stationLng: activeBeacon.lng, derivedGlobePoint: activeBeacon, targetRotation: { rotX: s.targetX / DEG, rotY: s.targetY / DEG }, actualProjectedX: p.x, actualProjectedY: p.y, targetX: targetScreenX, targetY: targetScreenY, deltaX, deltaY, frontFacing, correctiveFocusRan: s.correctiveFocusRan, usableBounds });
          }
        }
        if (globeDebugEnabled() && now - debugOverlayTickRef.current > 250) {
          debugOverlayTickRef.current = now;
          const country = nearestCountry(activeBeacon.lat, activeBeacon.lng);
          setDebugOverlay({ stationLat: activeBeacon.lat, stationLng: activeBeacon.lng, screenX: p.x, screenY: p.y, targetScreenX, targetScreenY, deltaX, deltaY, usableBounds, canvasCenter: { x: cx, y: cy }, rotX: s.rotX / DEG, rotY: s.rotY / DEG, selectedCountry: country?.name ?? null, frontFacing, correctiveFocusRan: s.correctiveFocusRan, d3InputOrder: "[longitude, latitude]" });
        }
        const logKey = `${runtime.stationName}:${activeBeacon.lat}:${activeBeacon.lng}:${Math.round(p.x)}:${Math.round(p.y)}:${Math.round(p.z * 1000)}`;
        if (lastCoordinateLogRef.current !== logKey) {
          lastCoordinateLogRef.current = logKey;
          debugGlobeCoordinates({ station: runtime.stationName, selectionVersion: runtime.selectionVersion, label: runtime.stationLabel, latitude: activeBeacon.lat, longitude: activeBeacon.lng, d3ProjectionInput: [activeBeacon.lng, activeBeacon.lat], d3ProjectionInputOrder: "[longitude, latitude]", rotation: { rotX: s.rotX / DEG, rotY: s.rotY / DEG, d3Rotate: projection.rotate() }, computed3DVector: p.vector, renderedMarkerPosition: { x: p.x, y: p.y, z: p.z }, beaconScreenX: p.x, beaconScreenY: p.y, targetScreenX, targetScreenY, deltaX, deltaY, focusProgress, driftEnabled: !s.dragging && !s.disabledMotion && !s.hidden && focusProgress >= 1 && activeFocusVerified, canvas: { width: w, height: h, devicePixelRatio: dpr, pixelWidth, pixelHeight }, viewport: viewportDebug });
        }
        const settledKey = `${runtime.stationName}:${activeBeacon.lat}:${activeBeacon.lng}:${Math.round(s.focusStartedAt)}`;
        if (focusProgress >= 1 && settledFocusLogRef.current !== settledKey) {
          settledFocusLogRef.current = settledKey;
          debugGlobeFocus("animation settled projection", { station: runtime.stationName, selectionVersion: runtime.selectionVersion, label: runtime.stationLabel, beaconScreenX: p.x, beaconScreenY: p.y, targetScreenX, targetScreenY, deltaX, deltaY, focusProgress, driftEnabled: false, canvasWidth: w, canvasHeight: h, devicePixelRatio: dpr, visualViewportHeight: viewportDebug?.visualViewport ? viewportDebug.visualViewport.height : null, safeAreaBottomEstimate: viewportDebug?.safeAreaBottomEstimate ?? null, dockRect: viewportDebug?.dockRect ?? null, playerRect: viewportDebug?.playerRect ?? null, usableBounds });
        }
        if (p.z > -0.05) {
          const approachVisibility = s.disabledMotion ? 1 : Math.min(1, Math.max(0.18, (focusProgress - 0.5) / 0.42));
          drawActiveStationBeacon(ctx, p.x, p.y, { now, mobile, lowPower: profile.lowPower, reducedMotion: s.disabledMotion, visibility: approachVisibility, landingPulseStartedAt: s.landingPulseStartedAt });
          if (approachVisibility > 0.72 && !(iosWebKit && s.travelActive)) drawProgressiveLabels(projection, activeBeacon, runtime, s.zoom);
        }
      }
      ctx.restore();
      if (globeDebugEnabled() && activeBeacon) {
        const projected = projectGlobePoint(activeBeacon, { rotX: s.rotX, rotY: s.rotY }, { width: w, height: h, radius: r, centerX: cx, centerY: cy });
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.strokeRect(usableBounds.left, usableBounds.top, usableBounds.right - usableBounds.left, usableBounds.bottom - usableBounds.top);
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(125,211,252,0.95)";
        ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke();
        ctx.strokeStyle = "rgba(251,191,36,0.95)";
        ctx.beginPath(); ctx.moveTo(targetScreenX - 16, targetScreenY); ctx.lineTo(targetScreenX + 16, targetScreenY); ctx.moveTo(targetScreenX, targetScreenY - 16); ctx.lineTo(targetScreenX, targetScreenY + 16); ctx.stroke();
        ctx.fillStyle = "rgba(255,56,56,0.95)";
        ctx.beginPath(); ctx.arc(projected.x, projected.y, 4.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(255,56,56,0.85)";
        ctx.beginPath(); ctx.moveTo(projected.x, projected.y); ctx.lineTo(targetScreenX, targetScreenY); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = photorealisticPreview ? "rgba(96,165,250,0.58)" : "rgba(0,214,143,0.55)"; ctx.lineWidth = photorealisticPreview ? 1.8 : 1.4; ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, TAU); ctx.stroke();
      if (photorealisticPreview) {
        rendererDiagnostics.frameTimeMs = performance.now() - frameStartedAt;
        rendererDiagnostics.estimatedFps = rendererDiagnostics.frameTimeMs > 0 ? 1000 / rendererDiagnostics.frameTimeMs : 0;
        if (globeDebugEnabled() && now - diagnosticsTickRef.current > 1000) {
          diagnosticsTickRef.current = now;
          setRendererDiagnosticsSnapshot({ mode: photorealisticPreview ? "photorealistic-texture" : effectiveRenderBasemap, quality: globeQuality, fps: Number(rendererDiagnostics.estimatedFps.toFixed(1)), frameTimeMs: Number(rendererDiagnostics.frameTimeMs.toFixed(2)), textureStatus: textureBundleRef.current.status, fallbackReason: textureBundleRef.current.fallbackReason ?? null, recoveryStatus: textureRecoveryStatusRef.current });
          console.debug("[WaveAtlas renderer diagnostics]", {
            before: { drawCalls: rendererDiagnostics.beforeDrawCalls, projectedPolygons: rendererDiagnostics.beforeProjectedPolygons },
            after: { drawCalls: rendererDiagnostics.drawCalls, projectedPolygons: rendererDiagnostics.projectedPolygons, hiddenPointSkips: rendererDiagnostics.hiddenPointSkips, frameTimeMs: Number(rendererDiagnostics.frameTimeMs.toFixed(2)), estimatedFps: Number(rendererDiagnostics.estimatedFps.toFixed(1)) },
          });
        }
      }
      painted = true;
      if (transitionStats.active && !s.travelActive) {
        const avgGap = transitionStats.frameCount ? transitionStats.totalFrameGap / transitionStats.frameCount : 0;
        const projected = activeBeacon ? projectGlobePoint(activeBeacon, { rotX: s.rotX, rotY: s.rotY }, { width: w, height: h, radius: r, centerX: cx, centerY: cy }) : null;
        debugGlobeFocus("transition ended", { selectionVersion: runtime.selectionVersion, iosWebKit, endedAt: Date.now(), durationMs: now - transitionStats.startedAt, frameCount: transitionStats.frameCount, averageFps: avgGap ? 1000 / avgGap : null, maxFrameGap: transitionStats.maxFrameGap, droppedFrames: transitionStats.droppedFrames, canvasSizeChanged: transitionStats.canvasSizeChanged, resizeEvents: transitionStats.resizeEvents, finalBeaconDelta: projected ? { x: projected.x - targetScreenX, y: projected.y - targetScreenY } : null });
        wrap.setAttribute("data-globe-travel-active", "false");
        window.dispatchEvent(new CustomEvent("waveatlas:globe-travel", { detail: { active: false, iosWebKit, endedAt: Date.now(), selectionVersion: runtime.selectionVersion } }));
        transitionStats.active = false;
      }
      if (s.hidden) return;
      raf = requestAnimationFrame(draw);
    };
    const draw = (now: number) => {
      try {
        drawFrame(now);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Globe render loop failed.";
        if (process.env.NODE_ENV !== "production") console.error("[WaveAtlas globe] render error", error);
        fallbackRef.current?.(reason);
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const syncCanvasSize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(mobile || profile.lowPower ? 1.25 : 2, window.devicePixelRatio || 1);
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      stableSizeRef.current = { cssWidth, cssHeight, pixelWidth: Math.floor(cssWidth * dpr), pixelHeight: Math.floor(cssHeight * dpr), dpr };
    };
    const debouncedSyncCanvasSize = (eventName = "resize") => { if (state.current.travelActive) { transitionStats.resizeEvents.push(eventName); warnGlobeFocus("viewport/layout event during transition", { eventName, iosWebKit, visualViewport: window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop, offsetLeft: window.visualViewport.offsetLeft, scale: window.visualViewport.scale } : null, canvasSize: stableSizeRef.current }); if (iosWebKit) return; } window.clearTimeout(throttleTimer); throttleTimer = window.setTimeout(syncCanvasSize, mobile ? 160 : 80); };
    syncCanvasSize();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => debouncedSyncCanvasSize("ResizeObserver")) : null;
    resizeObserver?.observe(wrap);
    const onOrientationChange = () => debouncedSyncCanvasSize("orientationchange");
    const onWindowResize = () => debouncedSyncCanvasSize("window.resize");
    const onVisualViewportResize = () => debouncedSyncCanvasSize("visualViewport.resize");
    const onVisualViewportScroll = () => debouncedSyncCanvasSize("visualViewport.scroll");
    window.addEventListener("orientationchange", onOrientationChange, { passive: true });
    window.addEventListener("resize", onWindowResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onVisualViewportResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", onVisualViewportScroll, { passive: true });
    const onVisibility = () => { state.current.hidden = document.hidden; if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(draw);
    return () => { document.removeEventListener("visibilitychange", onVisibility); resizeObserver?.disconnect(); window.removeEventListener("orientationchange", onOrientationChange); window.removeEventListener("resize", onWindowResize); window.visualViewport?.removeEventListener("resize", onVisualViewportResize); window.visualViewport?.removeEventListener("scroll", onVisualViewportScroll); window.clearTimeout(throttleTimer); if (fallbackTimer) window.clearTimeout(fallbackTimer); cancelAnimationFrame(raf); raf = 0; };
  }, [focusPoint, mobile, station, stations]);

  useEffect(() => focusPoint(currentPoint, teleporting), [currentPoint, focusPoint, stationFocusIdentityKey, teleporting]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { event.preventDefault(); const s = state.current; debugGlobeFocus("user drag cancelled transition", { selectionVersion, station: station.name, travelActive: s.travelActive, focusDuration: s.focusDuration }); s.travelActive = false; s.focusDuration = 0; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); pinchDistance.current = null; s.dragging = true; s.lastX = event.clientX; s.lastY = event.clientY; s.downX = event.clientX; s.downY = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); };
  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => { const s = state.current; if (!s.dragging) return; event.preventDefault(); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const activePointers = Array.from(pointers.current.values()); if (activePointers.length >= 2) { const [a, b] = activePointers; const distance = Math.hypot(a.x - b.x, a.y - b.y); if (pinchDistance.current) { s.targetZoom = Math.max(0.82, Math.min(1.8, s.targetZoom + (distance - pinchDistance.current) * 0.003)); if (s.targetZoom >= 1.68) requestStreetZoom(s.targetZoom, "pinch street/city threshold"); } pinchDistance.current = distance; return; } const dx = event.clientX - s.lastX; const dy = event.clientY - s.lastY; const rotation = rotateFromDrag({ rotX: s.targetX, rotY: s.targetY }, dx, dy, mobile); s.targetX = rotation.rotX; s.targetY = rotation.rotY; s.lastX = event.clientX; s.lastY = event.clientY; };
  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    pointers.current.delete(event.pointerId);
    pinchDistance.current = null;
    const s = state.current; s.dragging = pointers.current.size > 0;
    if (Math.hypot(event.clientX - s.downX, event.clientY - s.downY) > 8) return;
    const rect = event.currentTarget.getBoundingClientRect(); const r = Math.min(rect.width, rect.height) * (mobile ? 0.46 : 0.34) * s.zoom; const point = invertGlobePoint(event.clientX - rect.left, event.clientY - rect.top, { rotX: s.rotX, rotY: s.rotY }, { width: rect.width, height: rect.height, radius: r, centerX: rect.width / 2, centerY: mobile ? rect.height * 0.42 : rect.height / 2 }); if (!point) return;
    const country = nearestCountry(point.lat, point.lng); if (country) onCountrySelect?.(country);
  };
  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => { event.preventDefault(); const s = state.current; s.targetZoom = Math.max(0.82, Math.min(1.8, s.targetZoom - event.deltaY * 0.001)); if (s.targetZoom >= 1.68) requestStreetZoom(s.targetZoom, "wheel street/city threshold"); };
  const diagnosticsOverlay: RendererDiagnosticsSnapshot | null = rendererDiagnosticsSnapshot ?? (shouldRenderPhotorealisticBasemap(effectiveBasemap) ? { mode: "texture-loading", quality: resolveGlobeQualityTier(mobile, false), fps: 0, frameTimeMs: 0, textureStatus, fallbackReason: null, recoveryStatus: textureRecoveryStatus } : null);

  return <div ref={wrapRef} data-globe-travel-active="false" className={`${mobile ? "waveatlas-globe-shell fixed inset-0 h-[100dvh] min-h-[100dvh] w-full max-w-[100vw] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" : "relative h-full min-h-[620px]"} w-full overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(0,214,143,.16),transparent_24%),linear-gradient(135deg,#020617,#07111f_48%,#031713)] shadow-2xl`}>
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel} aria-label="Interactive audio tourism globe" role="img" />
    <div className={`${mobile ? "hidden" : "left-6 top-20 xl:left-8"} pointer-events-none absolute z-20 rounded-full border border-emerald-300/20 bg-slate-950/55 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200 ${mobile ? "shadow-none backdrop-blur-sm" : "shadow-lg backdrop-blur-xl"}`}>{GLOBE_STYLE_COPY[effectiveBasemap]} · zoom in for Atlas Streets · tap to tune</div>
    <div className={`${mobile ? "hidden" : "bottom-28 right-6 xl:right-8"} pointer-events-none absolute z-20 max-w-xs rounded-3xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs text-ivory/75 shadow-2xl backdrop-blur-xl`}><b className="block text-white">Audio Tourism layer</b><span>{ready ? `Live beacon: ${currentPoint?.label ?? station.country}` : "Preparing texture-driven globe…"}</span></div>
    {globeDebugEnabled() && diagnosticsOverlay ? <div className="pointer-events-none absolute right-4 top-28 z-30 rounded-2xl border border-sky-300/25 bg-slate-950/80 p-3 font-mono text-[10px] leading-5 text-sky-100 shadow-2xl backdrop-blur-xl">
      <div>renderer: {diagnosticsOverlay.mode}</div>
      <div>quality: {diagnosticsOverlay.quality}</div>
      <div>fps: {diagnosticsOverlay.fps}</div>
      <div>frame: {diagnosticsOverlay.frameTimeMs}ms</div>
      <div>textures: {(Object.entries(diagnosticsOverlay.textureStatus) as Array<[GlobeTextureKey, GlobeTextureStatus]>).map(([key, value]) => `${key}:${value}`).join(" · ")}</div>
      <div>fallback: {diagnosticsOverlay.fallbackReason ?? "none"}</div>
      <div>recovery: {diagnosticsOverlay.recoveryStatus}</div>
    </div> : null}
    {globeDebugEnabled() && debugOverlay ? <div className="pointer-events-none absolute bottom-4 left-4 z-30 rounded-2xl border border-emerald-300/30 bg-slate-950/80 p-3 font-mono text-[10px] leading-5 text-emerald-100 shadow-2xl backdrop-blur-xl">
      <div>station lat/lng: {debugOverlay.stationLat?.toFixed(4)}, {debugOverlay.stationLng?.toFixed(4)}</div>
      <div>screen x/y: {debugOverlay.screenX?.toFixed(1)}, {debugOverlay.screenY?.toFixed(1)}</div>
      <div>target x/y: {debugOverlay.targetScreenX.toFixed(1)}, {debugOverlay.targetScreenY.toFixed(1)}</div>
      <div>delta x/y: {debugOverlay.deltaX?.toFixed(1)}, {debugOverlay.deltaY?.toFixed(1)}</div>
      <div>usable: {Math.round(debugOverlay.usableBounds.left)},{Math.round(debugOverlay.usableBounds.top)} → {Math.round(debugOverlay.usableBounds.right)},{Math.round(debugOverlay.usableBounds.bottom)}</div>
      <div>rotX/rotY: {debugOverlay.rotX.toFixed(2)}°, {debugOverlay.rotY.toFixed(2)}°</div>
      <div>front-facing: {String(debugOverlay.frontFacing)}</div>
      <div>corrective pass: {String(debugOverlay.correctiveFocusRan)}</div>
      <div>d3 input: {debugOverlay.d3InputOrder}</div>
      <div>selected country: {debugOverlay.selectedCountry ?? "—"}</div>
    </div> : null}
  </div>;
}
