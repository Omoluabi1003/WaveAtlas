import assert from "node:assert/strict";
import { geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";
import subdivisions from "../lib/data/natural-earth-states.json";
import countries from "../lib/data/natural-earth-countries.json";
import { drawGlobeBoundaries, globeBoundaryStyle, loadStateBoundaries } from "../lib/globe-boundaries";

async function main() {
assert.equal(globeBoundaryStyle(1, false).stateAlpha, 0, "World view stays free of subdivision clutter");
assert.ok(globeBoundaryStyle(1.3, false).stateAlpha > 0, "Subdivisions appear before the street-map transition");
assert.ok(globeBoundaryStyle(1.5, true).stateWidth < globeBoundaryStyle(1.5, true).countryWidth);
assert.ok(globeBoundaryStyle(1, true).countryAlpha >= 0.7, "Country borders are clear at world scale");
for (const [code, lng, lat] of [["NGA", 8, 9], ["USA", -84, 30.5], ["COG", 15, -1], ["CHN", 105, 35], ["BRA", -50, -10], ["AUS", 135, -25]] as const) {
  const region = subdivisions.features.find((feature) => feature.properties.country === code);
  assert.ok(region && region.geometry.coordinates.length > 0, `${code} has real subdivision geometry`);
  const projection = geoOrthographic().rotate([-lng, -lat]).scale(300).translate([400, 400]);
  const path = geoPath(projection)(region as unknown as GeoPermissibleObjects);
  assert.ok(path && path.length > 30 && !/NaN|Infinity/.test(path), `${code} boundaries project visibly`);
}
const us = subdivisions.features.find((feature) => feature.properties.country === "USA")!;
assert.ok(us.geometry.coordinates.flat().some(([lng, lat]) => lng > -87.7 && lng < -80 && lat > 30.25 && lat < 31.05), "Florida's northern state boundary is retained");
for (const feature of subdivisions.features) for (const line of feature.geometry.coordinates) {
  assert.ok(line.length >= 2);
  for (const [lng, lat] of line) {
    assert.ok(Number.isFinite(lng) && Math.abs(lng) <= 180);
    assert.ok(Number.isFinite(lat) && Math.abs(lat) <= 90);
  }
}
const strokes: Array<{ color: string; width: number; dashed: boolean }> = [];
let dashed = false;
const ctx = {
  strokeStyle: "", lineWidth: 0, lineJoin: "", lineCap: "",
  save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, closePath() {},
  setLineDash(value: number[]) { dashed = value.length > 0; },
  stroke(this: { strokeStyle: string; lineWidth: number }) { strokes.push({color: this.strokeStyle, width: this.lineWidth, dashed}); },
} as unknown as CanvasRenderingContext2D;
const projection = geoOrthographic().rotate([-8, -9]);
const countryShapes = countries.features as unknown as GeoPermissibleObjects[];
drawGlobeBoundaries(ctx, projection, countryShapes, null, 1.4, false);
assert.equal(strokes.length, 2, "Country borders render even with missing subdivision data");
strokes.length = 0;
drawGlobeBoundaries(ctx, projection, countryShapes, subdivisions as unknown as GeoPermissibleObjects, 1.4, false);
assert.equal(strokes.length, 4);
assert.equal(strokes[1].dashed, true, "Subdivision lines are visually distinct");
assert.equal(strokes[3].dashed, false, "National borders remain solid");
assert.ok(strokes[3].width > strokes[1].width);
const originalFetch = globalThis.fetch;
globalThis.fetch = (() => { throw new Error("External networking is disabled"); }) as typeof fetch;
try {
  const loaded = await loadStateBoundaries();
  assert.equal(loaded.type, "FeatureCollection");
  assert.equal(await loadStateBoundaries(), loaded, "Local geometry is reused across globe mounts");
} finally { globalThis.fetch = originalFetch; }
console.log("Country/state borders: global coverage fixtures, Florida geometry, zoom hierarchy, fallback, and local loading pass.");

}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
