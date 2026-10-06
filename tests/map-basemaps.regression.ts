import assert from "node:assert/strict";
import { basemapStyles } from "../lib/map-basemaps";
import { appearanceStreetBasemap } from "../lib/solar-appearance";

const publicHosts = new Set([
  "tiles.openfreemap.org", "services.arcgisonline.com", "tile.opentopomap.org", "gibs.earthdata.nasa.gov",
]);
function checkResources(value: unknown): void {
  if (typeof value === "string" && value.startsWith("https://")) {
    const url = new URL(value);
    assert(publicHosts.has(url.hostname), `Unreviewed map provider: ${url.hostname}`);
    assert.equal(url.username, "");
    assert.equal(url.password, "");
    assert.equal(url.search, "", "Map resources must not carry credentials");
  } else if (Array.isArray(value)) value.forEach(checkResources);
  else if (value && typeof value === "object") Object.values(value).forEach(checkResources);
}
for (const { style } of Object.values(basemapStyles)) checkResources(style);
for (const requested of ["atlasStreets", "atlas", "streets"] as const) {
  for (const appearance of ["day", "night"] as const) {
    const selected = appearanceStreetBasemap(requested, appearance) as keyof typeof basemapStyles;
    assert.equal(basemapStyles[selected].style, `https://tiles.openfreemap.org/styles/${appearance === "day" ? "liberty" : "dark"}`);
  }
}
console.log("Keyless map providers and day/night selection passed.");
