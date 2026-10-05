import { earthVector } from "./earth-lighting";
import { geoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";

let states: GeoPermissibleObjects | null = null;
let statesPromise: Promise<GeoPermissibleObjects> | null = null;

/** Separate local chunk: state detail does not delay the initial satellite globe. */
export function loadStateBoundaries(): Promise<GeoPermissibleObjects> {
  if (states) return Promise.resolve(states);
  if (!statesPromise) {
    statesPromise = import("./data/natural-earth-states.json")
      .then((module) => {
        states = module.default as unknown as GeoPermissibleObjects;
        return states;
      })
      .catch((error) => { statesPromise = null; throw error; });
  }
  return statesPromise;
}

export function globeBoundaryStyle(zoom: number, mobile: boolean) {
  const detail = Math.min(1, Math.max(0, (zoom - 1.18) / 0.24));
  return {
    countryAlpha: 0.72,
    countryWidth: mobile ? 0.85 : 1.05,
    stateAlpha: detail * 0.44,
    stateWidth: mobile ? 0.50 : 0.65,
  };
}

type PreparedLine = { coordinates: number[][]; center: number[]; horizon: number; chord: number };
const prepared = new WeakMap<object, PreparedLine[]>();
function visibleStateLines(collection: GeoPermissibleObjects, projection: GeoProjection, ctx: CanvasRenderingContext2D): GeoPermissibleObjects {
  let lines = prepared.get(collection);
  if (!lines) {
    const data = collection as unknown as { features: Array<{ geometry: { coordinates: number[][][] } }> };
    lines = data.features.flatMap((feature) => feature.geometry.coordinates.map((coordinates) => {
      const vectors = coordinates.map(([lng, lat]) => earthVector(lat, lng));
      const sum = vectors.reduce<number[]>((a, v) => a.map((value, i) => value + v[i]), [0, 0, 0]);
      const length = Math.hypot(...sum);
      const center = length > 1e-8 ? sum.map((v) => v / length) : [0, 0, 1];
      const minDot = Math.min(...vectors.map((v) => v.reduce((value, x, i) => value + x * center[i], 0)));
      // Short great-circle segments stay within a hemisphere-sized spherical cap.
      // Larger/degenerate caps remain eligible so clipping never loses valid lines.
      const horizon = length < 1e-8 || minDot <= 0 ? -1 : -Math.sqrt(Math.max(0, 1 - minDot * minDot)) - 0.001;
      return { coordinates, center, horizon, chord: Math.sqrt(Math.max(0, 2 - 2 * minDot)) };
    }));
    prepared.set(collection, lines);
  }
  const [lng, lat] = projection.rotate();
  const camera = earthVector(-lat, -lng);
  const longitude = -lng * Math.PI / 180, latitude = -lat * Math.PI / 180;
  const east = [Math.cos(longitude), 0, -Math.sin(longitude)];
  const north = [-Math.sin(latitude) * Math.sin(longitude), Math.cos(latitude), -Math.sin(latitude) * Math.cos(longitude)];
  const [cx, cy] = projection.translate();
  const scale = projection.scale();
  const transform = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  const width = ctx.canvas && transform ? ctx.canvas.width / Math.max(0.001, transform.a) : Infinity;
  const height = ctx.canvas && transform ? ctx.canvas.height / Math.max(0.001, transform.d) : Infinity;
  const coordinates = lines.filter((line) => {
    const depth = line.center.reduce((sum, v, i) => sum + v * camera[i], 0);
    if (depth < line.horizon) return false;
    const extent = line.chord * scale;
    if (extent < 0.7) return false;
    const x = cx + scale * line.center.reduce((sum, v, i) => sum + v * east[i], 0);
    const y = cy - scale * line.center.reduce((sum, v, i) => sum + v * north[i], 0);
    return x + extent >= 0 && x - extent <= width && y + extent >= 0 && y - extent <= height;
  }).map((line) => line.coordinates);
  return { type: "MultiLineString", coordinates } as GeoPermissibleObjects;
}

export function drawGlobeBoundaries(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  countries: GeoPermissibleObjects[],
  stateBoundaries: GeoPermissibleObjects | null,
  zoom: number,
  mobile: boolean,
) {
  const style = globeBoundaryStyle(zoom, mobile);
  const path = geoPath(projection, ctx);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (stateBoundaries && style.stateAlpha > 0) {
    ctx.beginPath();
    path(visibleStateLines(stateBoundaries, projection, ctx));
    ctx.strokeStyle = `rgba(8,17,29,${style.stateAlpha * 0.85})`;
    ctx.lineWidth = style.stateWidth + 1.1;
    ctx.stroke();
    ctx.setLineDash([2.5, 2]);
    ctx.strokeStyle = `rgba(240,212,153,${style.stateAlpha})`;
    ctx.lineWidth = style.stateWidth;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  for (const country of countries) path(country);
  // A narrow dark underlay keeps white borders legible over desert, ice, and clouds.
  ctx.strokeStyle = "rgba(8,17,29,0.48)";
  ctx.lineWidth = style.countryWidth + 1.2;
  ctx.stroke();
  ctx.strokeStyle = `rgba(241,248,255,${style.countryAlpha})`;
  ctx.lineWidth = style.countryWidth;
  ctx.stroke();
  ctx.restore();
}
