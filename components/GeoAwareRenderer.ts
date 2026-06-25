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

export function geoAwareRendererEnabled() {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_GEOAWARE_RENDERER === "true";
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
  addStops(bathymetry, [[0, "rgba(125,211,252,0.18)"], [0.45, "rgba(14,165,233,0.08)"], [1, "rgba(2,6,23,0.34)"]]);
  ctx.fillStyle = bathymetry;
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

  if (!performanceMode) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.1;
    for (let i = -1; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.2 + i * r * 0.75 + cloudShift - r * 1.2, cy - r * 0.22 + i * r * 0.16, r * 0.62, r * 0.09, -0.28, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  const terminator = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  addStops(terminator, [[0, "rgba(255,255,255,0.22)"], [0.36, "rgba(255,255,255,0.04)"], [0.68, "rgba(2,6,23,0.2)"], [1, "rgba(0,0,0,0.66)"]]);
  ctx.fillStyle = terminator;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const specular = ctx.createRadialGradient(cx - r * 0.43, cy - r * 0.45, 0, cx - r * 0.43, cy - r * 0.45, r * 0.72);
  addStops(specular, [[0, "rgba(255,255,255,0.34)"], [0.2, "rgba(186,230,253,0.13)"], [1, "rgba(255,255,255,0)"]]);
  ctx.fillStyle = specular;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  ctx.save();
  ctx.lineWidth = performanceMode ? 5 : 8;
  ctx.strokeStyle = basemap === "night" ? "rgba(96,165,250,0.42)" : "rgba(125,211,252,0.48)";
  if (!performanceMode) {
    ctx.shadowColor = basemap === "signal" ? "rgba(0,214,143,0.5)" : "rgba(56,189,248,0.42)";
    ctx.shadowBlur = 24;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r + (performanceMode ? 2 : 3), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
