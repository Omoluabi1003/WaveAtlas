import { geoPath, type GeoPermissibleObjects, type GeoProjection as D3GeoProjection } from "d3-geo";

import type { GlobeBasemapKey } from "@/components/BlueMarbleGlobe";

type RendererLandShape = { feature: GeoPermissibleObjects };

type GeoAwareRendererOptions = {
  ctx: CanvasRenderingContext2D;
  projection: D3GeoProjection;
  landShapes: RendererLandShape[];
  width: number;
  height: number;
  cx: number;
  cy: number;
  radius: number;
  now: number;
  basemap: GlobeBasemapKey;
  mobile: boolean;
  lowPower: boolean;
  reducedMotion: boolean;
};

let loggedGeoAwareFlagState = false;
let loggedGeoAwareDrawCall = false;

export function geoAwareRendererEnabled() {
  try {
    const enabled = process.env.NEXT_PUBLIC_GEOAWARE_RENDERER === "true";
    if (process.env.NODE_ENV === "development" && !loggedGeoAwareFlagState) {
      loggedGeoAwareFlagState = true;
      console.debug("[WaveAtlas GeoAwareRenderer] enabled", { enabled });
    }
    return enabled;
  } catch {
    return false;
  }
}

function addStops(gradient: CanvasGradient, stops: Array<[number, string]>) {
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
}

/**
 * Canvas-only visual renderer inspired by GeoAware Bible's premium Earth pass.
 * It intentionally owns only the globe material, atmosphere, lighting, and
 * texture-like effects; WaveAtlas projection, hit-testing, labels, stations,
 * polygons, and navigation continue to be drawn by the caller.
 */
export function drawGeoAwareEarthRenderer(options: GeoAwareRendererOptions) {
  const { ctx, projection, landShapes, width, height, cx, cy, radius: r, now, basemap, mobile, lowPower, reducedMotion } = options;
  if (process.env.NODE_ENV === "development" && !loggedGeoAwareDrawCall) {
    loggedGeoAwareDrawCall = true;
    console.debug("[WaveAtlas GeoAwareRenderer] drawGeoAwareEarthRenderer() called", { basemap, mobile, lowPower, reducedMotion });
  }
  const path = geoPath(projection, ctx);
  const performanceMode = mobile || lowPower;
  const dayMode = basemap !== "night";
  const cloudShift = reducedMotion ? 0 : ((now * (performanceMode ? 0.0012 : 0.0022)) % (r * 0.75));

  ctx.save();
  const aura = ctx.createRadialGradient(cx - r * 0.18, cy - r * 0.24, r * 0.72, cx, cy, r * 1.86);
  addStops(aura, [
    [0, dayMode ? "rgba(56,189,248,0.16)" : "rgba(96,165,250,0.13)"],
    [0.5, dayMode ? "rgba(14,165,233,0.07)" : "rgba(99,102,241,0.055)"],
    [1, "rgba(2,6,23,0)"],
  ]);
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  const ocean = ctx.createRadialGradient(cx - r * 0.42, cy - r * 0.46, r * 0.08, cx + r * 0.18, cy + r * 0.2, r * 1.2);
  if (basemap === "night") {
    addStops(ocean, [[0, "#172554"], [0.38, "#07111f"], [0.72, "#020617"], [1, "#00030a"]]);
  } else if (basemap === "signal") {
    addStops(ocean, [[0, "#0e7490"], [0.34, "#075985"], [0.68, "#082f49"], [1, "#03101f"]]);
  } else {
    addStops(ocean, [[0, "#38bdf8"], [0.22, "#0ea5e9"], [0.5, "#0369a1"], [0.78, "#0c4a6e"], [1, "#061523"]]);
  }
  ctx.fillStyle = ocean;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const bathymetry = ctx.createRadialGradient(cx + r * 0.25, cy + r * 0.18, r * 0.08, cx, cy, r * 1.1);
  addStops(bathymetry, [[0, "rgba(186,230,253,0.24)"], [0.34, "rgba(14,165,233,0.11)"], [0.72, "rgba(15,23,42,0.2)"], [1, "rgba(2,6,23,0.46)"]]);
  ctx.fillStyle = bathymetry;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const deepOcean = ctx.createLinearGradient(cx - r * 0.75, cy - r * 0.9, cx + r * 0.72, cy + r * 0.88);
  addStops(deepOcean, [[0, "rgba(255,255,255,0.16)"], [0.22, "rgba(56,189,248,0.08)"], [0.58, "rgba(8,47,73,0.1)"], [1, "rgba(0,0,0,0.34)"]]);
  ctx.fillStyle = deepOcean;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  ctx.fillStyle = basemap === "night" ? "rgba(22,32,50,0.86)" : basemap === "signal" ? "rgba(28,92,78,0.78)" : "rgba(58,122,82,0.9)";
  for (const shape of landShapes) {
    ctx.beginPath();
    path(shape.feature);
    ctx.fill("evenodd");
  }

  ctx.save();
  ctx.globalCompositeOperation = dayMode ? "overlay" : "screen";
  ctx.fillStyle = dayMode ? "rgba(250,204,21,0.12)" : "rgba(251,191,36,0.18)";
  for (const shape of landShapes) {
    ctx.beginPath();
    path(shape.feature);
    ctx.fill("evenodd");
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = performanceMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.24)";
  ctx.lineWidth = performanceMode ? 0.8 : 1.35;
  const cloudBands = performanceMode ? 2 : 5;
  for (let i = 0; i < cloudBands; i += 1) {
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.98 + i * r * 0.58 + cloudShift, cy - r * 0.28 + i * r * 0.13, r * (performanceMode ? 0.42 : 0.58), r * 0.055, -0.24, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const terminator = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  addStops(terminator, [[0, "rgba(255,255,255,0.34)"], [0.26, "rgba(255,255,255,0.08)"], [0.58, "rgba(15,23,42,0.16)"], [0.82, "rgba(2,6,23,0.52)"], [1, "rgba(0,0,0,0.78)"]]);
  ctx.fillStyle = terminator;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const limbDepth = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.02);
  addStops(limbDepth, [[0, "rgba(255,255,255,0)"], [0.68, "rgba(255,255,255,0.02)"], [0.88, "rgba(14,165,233,0.14)"], [1, "rgba(0,0,0,0.42)"]]);
  ctx.fillStyle = limbDepth;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const specular = ctx.createRadialGradient(cx - r * 0.43, cy - r * 0.45, 0, cx - r * 0.43, cy - r * 0.45, r * 0.72);
  addStops(specular, [[0, "rgba(255,255,255,0.34)"], [0.2, "rgba(186,230,253,0.13)"], [1, "rgba(255,255,255,0)"]]);
  ctx.fillStyle = specular;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  ctx.save();
  ctx.lineWidth = performanceMode ? 6 : 10;
  ctx.strokeStyle = basemap === "night" ? "rgba(96,165,250,0.56)" : "rgba(125,211,252,0.68)";
  if (!performanceMode) {
    ctx.shadowColor = basemap === "signal" ? "rgba(0,214,143,0.5)" : "rgba(56,189,248,0.42)";
    ctx.shadowBlur = 34;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r + (performanceMode ? 2 : 3), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.lineWidth = performanceMode ? 1.5 : 2.4;
  ctx.strokeStyle = basemap === "signal" ? "rgba(0,214,143,0.34)" : "rgba(224,242,254,0.42)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.01, cy - r * 0.01, r - (performanceMode ? 1.5 : 2.5), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
