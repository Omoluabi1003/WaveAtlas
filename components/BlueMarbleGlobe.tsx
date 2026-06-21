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

type GlobePoint = { lat: number; lng: number; label: string };
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
};

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const LAND_GEOJSON_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
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

function lowPowerDevice() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  return (nav.deviceMemory ?? 8) <= 3 || (nav.hardwareConcurrency ?? 8) <= 4;
}

export default function BlueMarbleGlobe({ station, teleporting = false, onCountrySelect, onFallback }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [landShapes, setLandShapes] = useState<LandShape[]>([]);
  const state = useRef({ rotX: -10 * DEG, rotY: 0, zoom: 1, targetX: -10 * DEG, targetY: 0, targetZoom: 1, dragging: false, lastX: 0, lastY: 0, downX: 0, downY: 0, disabledMotion: false });
  const currentPoint = useMemo(() => stationPoint(station), [station]);
  const stationLabel = useMemo(() => [station.city || station.state, station.country].filter(Boolean).join(", ") || station.name, [station]);

  const focusPoint = useCallback((point: GlobePoint | null, fast = false) => {
    if (!point) return;
    state.current.targetY = -point.lng * DEG;
    state.current.targetX = Math.max(-65 * DEG, Math.min(65 * DEG, point.lat * DEG * 0.62));
    state.current.targetZoom = fast ? 1.22 : 1.08;
  }, []);

  useEffect(() => {
    let mounted = true;
    loadLandShapes()
      .then((shapes) => { if (mounted) setLandShapes(shapes); })
      .catch(() => { if (mounted) setLandShapes([]); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lowPowerDevice()) {
      onFallback?.("Low-power device keeps the 2D atlas active.");
      return;
    }
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      onFallback?.("Canvas globe context unavailable.");
      return;
    }
    state.current.disabledMotion = prefersReducedMotion();
    setReady(true);
    focusPoint(currentPoint, true);
    let raf = 0;
    let then = performance.now();

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
      const dt = Math.min(32, now - then);
      then = now;
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr); canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const s = state.current;
      const ease = s.disabledMotion ? 1 : 0.045 * (dt / 16);
      s.rotX += (s.targetX - s.rotX) * ease;
      s.rotY += (s.targetY - s.rotY) * ease;
      s.zoom += (s.targetZoom - s.zoom) * ease;
      if (!s.dragging && !s.disabledMotion) s.targetY += 0.00035 * (teleporting ? 2.6 : 1);
      const r = Math.min(w, h) * 0.34 * s.zoom;
      const cx = w / 2, cy = h / 2;

      const bg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.55);
      bg.addColorStop(0, "rgba(0,214,143,0.18)"); bg.addColorStop(0.64, "rgba(3,12,27,0.10)"); bg.addColorStop(1, "rgba(3,8,20,0)");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      const ocean = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.44, r * 0.12, cx, cy, r * 1.12);
      ocean.addColorStop(0, "#173b55"); ocean.addColorStop(0.48, "#071d33"); ocean.addColorStop(1, "#020817");
      ctx.fillStyle = ocean; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      if (landShapes.length) {
        ctx.fillStyle = "rgba(63,129,102,0.50)";
        ctx.strokeStyle = "rgba(196,245,222,0.26)";
        ctx.lineWidth = 0.75;
        for (const shape of landShapes) {
          ctx.beginPath();
          for (const ring of shape.rings) drawRing(ring, w, h, r);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.strokeStyle = "rgba(147,197,253,0.07)"; ctx.lineWidth = 0.7;
      for (let lat = -75; lat <= 75; lat += 15) { ctx.beginPath(); for (let lng = -180; lng <= 180; lng += 4) { const p = project(lat, lng, w, h, r); if (p.z < -0.02) continue; lng === -180 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); } ctx.stroke(); }
      for (let lng = -180; lng < 180; lng += 15) { ctx.beginPath(); let started = false; for (let lat = -85; lat <= 85; lat += 3) { const p = project(lat, lng, w, h, r); if (p.z < -0.02) { started = false; continue; } started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); started = true; } ctx.stroke(); }
      if (s.zoom > 1.28) {
        const visibleLabels = landShapes.filter((shape) => shape.code && isoCountryCentroids[shape.code]).slice(0, 70);
        for (const shape of visibleLabels) {
          const centroid = isoCountryCentroids[shape.code as keyof typeof isoCountryCentroids] ?? shape.centroid;
          drawLabel(shape.name, centroid.lat, centroid.lng, w, h, r);
        }
      }
      if (currentPoint) { const p = project(currentPoint.lat, currentPoint.lng, w, h, r); if (p.z > -0.05) { const pulse = s.disabledMotion ? 1 : 1 + Math.sin(now / 180) * 0.22; ctx.fillStyle = "rgba(229,57,53,0.22)"; ctx.beginPath(); ctx.arc(p.x, p.y, 18 * pulse, 0, TAU); ctx.fill(); ctx.fillStyle = "#ff3838"; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU); ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke(); drawLabel(stationLabel, currentPoint.lat, currentPoint.lng, w, h, r, true); } }
      ctx.restore();
      ctx.strokeStyle = "rgba(0,214,143,0.55)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, TAU); ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [currentPoint, focusPoint, landShapes, onFallback, stationLabel, teleporting]);

  useEffect(() => focusPoint(currentPoint, teleporting), [currentPoint, focusPoint, teleporting]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { const s = state.current; s.dragging = true; s.lastX = event.clientX; s.lastY = event.clientY; s.downX = event.clientX; s.downY = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); };
  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => { const s = state.current; if (!s.dragging) return; const dx = event.clientX - s.lastX; const dy = event.clientY - s.lastY; s.targetY += dx * 0.006; s.targetX = Math.max(-70 * DEG, Math.min(70 * DEG, s.targetX + dy * 0.004)); s.lastX = event.clientX; s.lastY = event.clientY; };
  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const s = state.current; s.dragging = false;
    if (Math.hypot(event.clientX - s.downX, event.clientY - s.downY) > 8) return;
    const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left - rect.width / 2; const y = rect.height / 2 - (event.clientY - rect.top); const r = Math.min(rect.width, rect.height) * 0.34 * s.zoom; const nx = x / r; const ny = y / r; if (nx * nx + ny * ny > 1) return;
    const nz = Math.sqrt(1 - nx * nx - ny * ny); const sinX = Math.sin(s.rotX); const cosX = Math.cos(s.rotX); const worldY = ny * cosX + nz * sinX; const worldZ = nz * cosX - ny * sinX; const lat = Math.asin(worldY) / DEG; const lng = (Math.atan2(nx, worldZ) - s.rotY) / DEG; const normalizedLng = ((lng + 540) % 360) - 180; const country = nearestCountry(lat, normalizedLng); if (country) onCountrySelect?.(country);
  };
  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => { event.preventDefault(); const s = state.current; s.targetZoom = Math.max(0.82, Math.min(1.65, s.targetZoom - event.deltaY * 0.001)); };

  return <div ref={wrapRef} className="relative h-full min-h-[620px] w-full overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(0,214,143,.16),transparent_24%),linear-gradient(135deg,#020617,#07111f_48%,#031713)] shadow-2xl">
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onWheel={handleWheel} aria-label="Interactive audio tourism globe" role="img" />
    <div className="pointer-events-none absolute left-6 top-20 z-20 rounded-full border border-emerald-300/20 bg-slate-950/55 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200 shadow-lg backdrop-blur-xl xl:left-8">Blue Marble Globe · drag, zoom, tap to tune</div>
    <div className="pointer-events-none absolute bottom-28 right-6 z-20 max-w-xs rounded-3xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs text-ivory/75 shadow-2xl backdrop-blur-xl xl:right-8"><b className="block text-white">Audio Tourism layer</b><span>{ready ? `Live beacon: ${currentPoint?.label ?? station.country}` : "Preparing procedural globe…"}</span></div>
  </div>;
}
