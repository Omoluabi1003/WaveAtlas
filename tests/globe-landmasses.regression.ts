import assert from "node:assert/strict";
import { geoContains, geoOrthographic, geoPath, type GeoPermissibleObjects } from "d3-geo";
import countries from "../lib/data/natural-earth-countries.json";

// The bundled geography must work even when external fetching is unavailable.
const originalFetch = globalThis.fetch;
globalThis.fetch = (() => { throw new Error("Boundary network is unavailable"); }) as typeof fetch;
try {
  assert.equal(countries.type, "FeatureCollection");
  assert.equal(countries.features.length, 177);
  const fixtures: Array<[string, number, number]> = [
    ["NG", 8, 9], ["US", -100, 40], ["BR", -50, -10],
    ["CN", 105, 35], ["AU", 135, -25], ["DE", 10, 51], ["ZA", 25, -30],
  ];
  for (const [code, lng, lat] of fixtures) {
    const country = countries.features.find((feature) => feature.properties.ISO_A2 === code);
    assert.ok(country, `${code} country geometry is bundled`);
    const geometry = country as unknown as GeoPermissibleObjects;
    assert.ok(geoContains(geometry, [lng, lat]), `${code} retains country hit geometry`);
    const projection = geoOrthographic().rotate([-lng, -lat]).translate([200, 200]).scale(180).clipAngle(90);
    const path = geoPath(projection)(geometry);
    assert.ok(path && path.length > 20, `${code} produces visible land on the focused globe`);
    assert.ok(!/NaN|Infinity/.test(path), `${code} projection stays finite`);
  }
  const walkCoordinates = (value: unknown): void => {
    assert.ok(Array.isArray(value), "Coordinates are arrays");
    if (typeof value[0] === "number") {
      const [lng, lat] = value as number[];
      assert.ok(Number.isFinite(lng) && Math.abs(lng) <= 180);
      assert.ok(Number.isFinite(lat) && Math.abs(lat) <= 90);
    } else value.forEach(walkCoordinates);
  };
  for (const feature of countries.features) {
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry.type));
    walkCoordinates(feature.geometry.coordinates);
  }
  console.log("Bundled landmasses: all 177 countries valid; continent rendering and country hits pass with networking disabled.");
} finally {
  globalThis.fetch = originalFetch;
}
