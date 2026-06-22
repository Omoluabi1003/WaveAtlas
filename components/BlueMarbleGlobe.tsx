"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isoCountryCentroids, resolveStationGeo } from "@/lib/geotruth-resolver";
import { flagFor, type Station } from "@/lib/stations";

type CountryResult = {
  name: string;
  code: string;
  flag: string;
  centroid: { lat: number; lng: number };
  station_count: number;
};

export type GlobeBasemapKey = "blueMarble" | "night" | "signal";
type GlobePoint = { lat: number; lng: number; label: string };
type GlobeLabel = GlobePoint & { active?: boolean };
type GlobeRuntime = { currentPoint: GlobePoint | null; stationLabel: string; basemap: GlobeBasemapKey; teleporting: boolean; labels: GlobeLabel[]; landShapes: LandShape[] };
type CanvasSize = { cssWidth: number; cssHeight: number; pixelWidth: number; pixelHeight: number; dpr: number };
type LandRing = Array<[number, number]>;
type LandShape = { name: string; code?: string; rings: LandRing[]; centroid: { lat: number; lng: number } };
type NaturalEarthFeature = {
  type: "Feature";
  properties?: Record<string, string | number | null | undefined>;
  geometry?: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};
type NaturalEarthCollection = { type: "FeatureCollection"; features: NaturalEarthFeature[] };

type Props = {
  station: Station;
  previousStation?: Station;
  teleporting?: boolean;
  onCountrySelect?: (country: CountryResult) => void;
  onFallback?: (reason: string) => void;
  mobile?: boolean;
  basemap?: GlobeBasemapKey;
};

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const LAND_GEOJSON_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const MOBILE_FRAME_MS = 1000 / 30;
const DESKTOP_FRAME_MS = 1000 / 60;
const MOBILE_FALLBACK_MS = 2000;
let landPromise: Promise<LandShape[]> | null = null;
let landCache: LandShape[] | null = null;

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
  };
}

function loadLandShapes() {
  if (landCache) return Promise.resolve(landCache);
  if (!landPromise) {
    landPromise = fetch(LAND_GEOJSON_URL, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Natural Earth boundaries failed: ${response.status}`);
        return response.json() as Promise<NaturalEarthCollection>;
      })
      .then((collection) => {
        landCache = collection.features.map(normalizeLandFeature).filter((shape): shape is LandShape => Boolean(shape));
        return landCache;
      });
  }
  return landPromise;
}

function stationPoint(station?: Station): GlobePoint | null {
  if (!station) return null;
  const geo = resolveStationGeo(station);
  if (geo.lat === null || geo.lng === null) return null;
  return { lat: geo.lat, lng: geo.lng, label: station.city || station.state || station.country || station.name };
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
  if (process.env.NODE_ENV !== "development") return;
  console.info("[WaveAtlas globe]", details);
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

const GLOBE_STYLE_COPY: Record<GlobeBasemapKey, string> = {
  blueMarble: "Blue Marble Globe",
  night: "Night Globe",
  signal: "Signal Globe",
};

export default function BlueMarbleGlobe({ station, teleporting = false, onCountrySelect, onFallback, mobile = false, basemap = "blueMarble" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [landShapes, setLandShapes] = useState<LandShape[]>([]);
  const state = useRef({ rotX: -10 * DEG, rotY: 0, zoom: 1, targetX: -10 * DEG, targetY: 0, targetZoom: 1, dragging: false, lastX: 0, lastY: 0, downX: 0, downY: 0, disabledMotion: false, hidden: false });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const currentPoint = useMemo(() => stationPoint(station), [station]);
  const stationLabel = useMemo(() => [station.city || station.state, station.country].filter(Boolean).join(", ") || station.name, [station]);
  const globeLabels = useMemo<GlobeLabel[]>(() => currentPoint ? [{ ...currentPoint, label: stationLabel, active: true }] : [], [currentPoint, stationLabel]);
  const runtimeRef = useRef<GlobeRuntime>({ currentPoint, stationLabel, basemap, teleporting, labels: globeLabels, landShapes });
  const stableSizeRef = useRef<CanvasSize | null>(null);
  const fallbackRef = useRef(onFallback);

  const focusPoint = useCallback((point: GlobePoint | null, fast = false) => {
    if (!point) return;
    state.current.targetY = -point.lng * DEG;
    state.current.targetX = Math.max(-65 * DEG, Math.min(65 * DEG, point.lat * DEG * 0.62));
    state.current.targetZoom = fast ? 1.22 : 1.08;
  }, []);

  useEffect(() => { fallbackRef.current = onFallback; }, [onFallback]);

  useEffect(() => {
    runtimeRef.current = { currentPoint, stationLabel, basemap, teleporting, labels: globeLabels, landShapes };
  }, [basemap, currentPoint, globeLabels, landShapes, stationLabel, teleporting]);

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
    debugGlobeDecision({ selectedView: "globe", viewport: `${window.innerWidth}x${window.innerHeight}`, device: profile.mobile ? "mobile" : "desktop", lowPower: profile.lowPower, webglSupport: profile.webgl, fallbackReason: null });
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      fallbackRef.current?.("Canvas globe context unavailable.");
      return;
    }
    state.current.disabledMotion = prefersReducedMotion();
    setReady(true);
    let raf = 0;
    let throttleTimer = 0;
    let lastFrame = 0;
    let then = performance.now();
    let painted = false;
    const fallbackTimer = mobile ? window.setTimeout(() => { if (!painted) fallbackRef.current?.("Globe view is optimized for this device using map mode."); }, MOBILE_FALLBACK_MS) : 0;

    const project = (lat: number, lng: number, w: number, h: number, r: number) => {
      const phi = lat * DEG;
      const lambda = lng * DEG + state.current.rotY;
      const x = Math.cos(phi) * Math.sin(lambda);
      const y = Math.sin(phi) * Math.cos(state.current.rotX) - Math.cos(phi) * Math.cos(lambda) * Math.sin(state.current.rotX);
      const z = Math.sin(phi) * Math.sin(state.current.rotX) + Math.cos(phi) * Math.cos(lambda) * Math.cos(state.current.rotX);
      return { x: w / 2 + x * r, y: h / 2 - y * r, z };
    };

    const drawRing = (ring: LandRing, w: number, h: number, r: number) => {
      let started = false;
      for (let i = 0; i < ring.length; i += 1) {
        const [lng, lat] = ring[i];
        const p = project(lat, lng, w, h, r);
        const prev = i > 0 ? ring[i - 1] : null;
        const crossesDateLine = prev ? Math.abs(lng - prev[0]) > 180 : false;
        if (p.z < -0.04 || crossesDateLine) { started = false; continue; }
        started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        started = true;
      }
    };

    const drawLabel = (text: string, lat: number, lng: number, w: number, h: number, r: number, active = false) => {
      const p = project(lat, lng, w, h, r);
      if (p.z < -0.02) return;
      ctx.save();
      ctx.font = `${active ? 700 : 600} ${active ? 12 : 9}px var(--font-sans), Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const y = p.y - (active ? 26 : 0);
      ctx.lineWidth = active ? 4 : 3;
      ctx.strokeStyle = "rgba(2,6,23,0.86)";
      ctx.strokeText(text, p.x, y);
      ctx.fillStyle = active ? "rgba(255,255,255,0.96)" : "rgba(226,232,240,0.58)";
      ctx.fillText(text, p.x, y);
      ctx.restore();
    };

    const draw = (now: number) => {
      const frameMs = mobile || profile.lowPower ? MOBILE_FRAME_MS : DESKTOP_FRAME_MS;
      if (now - lastFrame < frameMs - 1) { raf = requestAnimationFrame(draw); return; }
      lastFrame = now;
      const dt = Math.min(50, now - then);
      then = now;
      const size = stableSizeRef.current;
      const dpr = size?.dpr ?? Math.min(mobile || profile.lowPower ? 1.25 : 2, window.devicePixelRatio || 1);
      const w = Math.max(1, size?.cssWidth ?? Math.floor(wrap.clientWidth));
      const h = Math.max(1, size?.cssHeight ?? Math.floor(wrap.clientHeight));
      const pixelWidth = size?.pixelWidth ?? Math.floor(w * dpr);
      const pixelHeight = size?.pixelHeight ?? Math.floor(h * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth; canvas.height = pixelHeight; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      }
      const runtime = runtimeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = state.current;
      const ease = s.disabledMotion ? 1 : 0.045 * (dt / 16);
      s.rotX += (s.targetX - s.rotX) * ease;
      s.rotY += (s.targetY - s.rotY) * ease;
      s.zoom += (s.targetZoom - s.zoom) * ease;
      if (!s.dragging && !s.disabledMotion && !s.hidden) s.targetY += (mobile ? 0.00016 : 0.00035) * (runtime.teleporting ? (mobile ? 1.4 : 2.6) : 1);
      const r = Math.min(w, h) * (mobile ? 0.39 : 0.34) * s.zoom;
      const cx = w / 2, cy = h / 2;

      const bg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.55);
      bg.addColorStop(0, runtime.basemap === "night" ? "rgba(125,92,255,0.16)" : runtime.basemap === "signal" ? "rgba(0,214,143,0.12)" : "rgba(0,214,143,0.18)"); bg.addColorStop(0.64, "rgba(3,12,27,0.10)"); bg.addColorStop(1, "rgba(3,8,20,0)");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      const ocean = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.44, r * 0.12, cx, cy, r * 1.12);
      if (runtime.basemap === "night") { ocean.addColorStop(0, "#111827"); ocean.addColorStop(0.55, "#050816"); ocean.addColorStop(1, "#01030a"); }
      else if (runtime.basemap === "signal") { ocean.addColorStop(0, "#08213a"); ocean.addColorStop(0.55, "#031225"); ocean.addColorStop(1, "#010814"); }
      else { ocean.addColorStop(0, "#1f6f9d"); ocean.addColorStop(0.42, "#0c3b67"); ocean.addColorStop(1, "#031327"); }
      ctx.fillStyle = ocean; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      if (runtime.landShapes.length) {
        ctx.fillStyle = runtime.basemap === "night" ? "rgba(28,38,52,0.72)" : runtime.basemap === "signal" ? "rgba(8,31,51,0.38)" : "rgba(74,142,88,0.68)";
        ctx.strokeStyle = runtime.basemap === "night" ? "rgba(251,191,36,0.22)" : runtime.basemap === "signal" ? "rgba(125,211,252,0.35)" : "rgba(226,255,236,0.36)";
        ctx.lineWidth = mobile || profile.lowPower ? 0.5 : 0.75;
        const shapesToDraw = mobile || profile.lowPower ? runtime.landShapes.slice(0, 130) : runtime.landShapes;
        for (const shape of shapesToDraw) {
          ctx.beginPath();
          for (const ring of shape.rings) drawRing(ring, w, h, r);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.strokeStyle = runtime.basemap === "signal" ? "rgba(56,189,248,0.24)" : runtime.basemap === "night" ? "rgba(148,163,184,0.055)" : "rgba(147,197,253,0.09)"; ctx.lineWidth = mobile || profile.lowPower ? 0.45 : 0.7;
      const latStep = mobile || profile.lowPower ? 30 : 15;
      const lngStep = mobile || profile.lowPower ? 30 : 15;
      for (let lat = -75; lat <= 75; lat += latStep) { ctx.beginPath(); for (let lng = -180; lng <= 180; lng += 4) { const p = project(lat, lng, w, h, r); if (p.z < -0.02) continue; lng === -180 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); } ctx.stroke(); }
      for (let lng = -180; lng < 180; lng += lngStep) { ctx.beginPath(); let started = false; for (let lat = -85; lat <= 85; lat += 3) { const p = project(lat, lng, w, h, r); if (p.z < -0.02) { started = false; continue; } started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); started = true; } ctx.stroke(); }
      if (!mobile && s.zoom > 1.28) {
        const visibleLabels = runtime.landShapes.filter((shape) => shape.code && isoCountryCentroids[shape.code]).slice(0, 70);
        for (const shape of visibleLabels) {
          const centroid = isoCountryCentroids[shape.code as keyof typeof isoCountryCentroids] ?? shape.centroid;
          drawLabel(shape.name, centroid.lat, centroid.lng, w, h, r);
        }
      }
      if (runtime.basemap === "night") {
        const lights = mobile || profile.lowPower ? CITY_LIGHTS.slice(0, 9) : CITY_LIGHTS;
        for (const light of lights) { const p = project(light.lat, light.lng, w, h, r); if (p.z < -0.02) continue; const glow = 1 + Math.max(0, p.z) * 1.8; ctx.fillStyle = "rgba(251,191,36,0.24)"; ctx.beginPath(); ctx.arc(p.x, p.y, 5.5 * glow, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,244,180,0.88)"; ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 * glow, 0, TAU); ctx.fill(); }
      }
      const activeBeacon = runtime.currentPoint;
      if (activeBeacon) { const p = project(activeBeacon.lat, activeBeacon.lng, w, h, r); if (p.z > -0.05) { const pulse = s.disabledMotion ? 1 : 1 + Math.sin(now / (mobile ? 360 : 180)) * (mobile ? 0.08 : 0.22); ctx.fillStyle = mobile || profile.lowPower ? "rgba(229,57,53,0.16)" : "rgba(229,57,53,0.22)"; ctx.beginPath(); ctx.arc(p.x, p.y, (mobile ? 13 : 18) * pulse, 0, TAU); ctx.fill(); ctx.fillStyle = "#ff3838"; ctx.beginPath(); ctx.arc(p.x, p.y, mobile ? 5 : 6, 0, TAU); ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke(); for (const label of runtime.labels) drawLabel(label.label, label.lat, label.lng, w, h, r, Boolean(label.active)); } }
      ctx.restore();
      ctx.strokeStyle = "rgba(0,214,143,0.55)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, TAU); ctx.stroke();
      painted = true;
      if (s.hidden) return;
      raf = requestAnimationFrame(draw);
    };
    const syncCanvasSize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(mobile || profile.lowPower ? 1.25 : 2, window.devicePixelRatio || 1);
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      stableSizeRef.current = { cssWidth, cssHeight, pixelWidth: Math.floor(cssWidth * dpr), pixelHeight: Math.floor(cssHeight * dpr), dpr };
    };
    const debouncedSyncCanvasSize = () => { window.clearTimeout(throttleTimer); throttleTimer = window.setTimeout(syncCanvasSize, mobile ? 160 : 80); };
    syncCanvasSize();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(debouncedSyncCanvasSize) : null;
    resizeObserver?.observe(wrap);
    window.addEventListener("orientationchange", debouncedSyncCanvasSize, { passive: true });
    window.addEventListener("resize", debouncedSyncCanvasSize, { passive: true });
    const onVisibility = () => { state.current.hidden = document.hidden; if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(draw);
    return () => { document.removeEventListener("visibilitychange", onVisibility); resizeObserver?.disconnect(); window.removeEventListener("orientationchange", debouncedSyncCanvasSize); window.removeEventListener("resize", debouncedSyncCanvasSize); window.clearTimeout(throttleTimer); if (fallbackTimer) window.clearTimeout(fallbackTimer); cancelAnimationFrame(raf); raf = 0; };
  }, [focusPoint, mobile]);

  useEffect(() => focusPoint(currentPoint, teleporting), [currentPoint, focusPoint, teleporting]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { const s = state.current; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); pinchDistance.current = null; s.dragging = true; s.lastX = event.clientX; s.lastY = event.clientY; s.downX = event.clientX; s.downY = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); };
  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => { const s = state.current; if (!s.dragging) return; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const activePointers = Array.from(pointers.current.values()); if (activePointers.length >= 2) { const [a, b] = activePointers; const distance = Math.hypot(a.x - b.x, a.y - b.y); if (pinchDistance.current) s.targetZoom = Math.max(0.82, Math.min(1.65, s.targetZoom + (distance - pinchDistance.current) * 0.003)); pinchDistance.current = distance; return; } const dx = event.clientX - s.lastX; const dy = event.clientY - s.lastY; s.targetY += dx * (mobile ? 0.0045 : 0.006); s.targetX = Math.max(-70 * DEG, Math.min(70 * DEG, s.targetX + dy * (mobile ? 0.003 : 0.004))); s.lastX = event.clientX; s.lastY = event.clientY; };
  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    pinchDistance.current = null;
    const s = state.current; s.dragging = pointers.current.size > 0;
    if (Math.hypot(event.clientX - s.downX, event.clientY - s.downY) > 8) return;
    const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left - rect.width / 2; const y = rect.height / 2 - (event.clientY - rect.top); const r = Math.min(rect.width, rect.height) * (mobile ? 0.39 : 0.34) * s.zoom; const nx = x / r; const ny = y / r; if (nx * nx + ny * ny > 1) return;
    const nz = Math.sqrt(1 - nx * nx - ny * ny); const sinX = Math.sin(s.rotX); const cosX = Math.cos(s.rotX); const worldY = ny * cosX + nz * sinX; const worldZ = nz * cosX - ny * sinX; const lat = Math.asin(worldY) / DEG; const lng = (Math.atan2(nx, worldZ) - s.rotY) / DEG; const normalizedLng = ((lng + 540) % 360) - 180; const country = nearestCountry(lat, normalizedLng); if (country) onCountrySelect?.(country);
  };
  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => { event.preventDefault(); const s = state.current; s.targetZoom = Math.max(0.82, Math.min(1.65, s.targetZoom - event.deltaY * 0.001)); };

  return <div ref={wrapRef} className={`${mobile ? "fixed inset-0 h-[100dvh] min-h-[100dvh] w-screen pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" : "relative h-full min-h-[620px]"} w-full overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(0,214,143,.16),transparent_24%),linear-gradient(135deg,#020617,#07111f_48%,#031713)] shadow-2xl`}>
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onWheel={handleWheel} aria-label="Interactive audio tourism globe" role="img" />
    <div className={`${mobile ? "left-4 top-[calc(env(safe-area-inset-top)+88px)] text-[9px]" : "left-6 top-20 xl:left-8"} pointer-events-none absolute z-20 rounded-full border border-emerald-300/20 bg-slate-950/55 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200 ${mobile ? "shadow-none backdrop-blur-sm" : "shadow-lg backdrop-blur-xl"}`}>{GLOBE_STYLE_COPY[basemap]} · drag, zoom, tap to tune</div>
    <div className={`${mobile ? "hidden" : "bottom-28 right-6 xl:right-8"} pointer-events-none absolute z-20 max-w-xs rounded-3xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs text-ivory/75 shadow-2xl backdrop-blur-xl`}><b className="block text-white">Audio Tourism layer</b><span>{ready ? `Live beacon: ${currentPoint?.label ?? station.country}` : "Preparing procedural globe…"}</span></div>
  </div>;
}
