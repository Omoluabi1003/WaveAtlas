import assert from "node:assert/strict";
import { buildGlobeProjection, fixtureProjectsToFocusedCenter, focusRotationForPoint, invertGlobePoint, projectGlobePoint, GLOBE_COORDINATE_FIXTURES } from "../lib/globe-math";
import { readRendererFeatureFlags, shouldUsePhotorealisticPreview } from "../lib/globe-renderer-adapter";

const screen = { width: 1000, height: 1000, radius: 300 };

for (const fixture of GLOBE_COORDINATE_FIXTURES) {
  const projected = fixtureProjectsToFocusedCenter(fixture, screen);
  assert.equal(projected.centered, true, `${fixture.label} should focus to globe center for camera/search centering`);

  const rotation = focusRotationForPoint(fixture);
  const marker = projectGlobePoint(fixture, rotation, screen);
  assert.ok(marker.z > 0.999999, `${fixture.label} beacon should be front-facing at focus`);
  assert.ok(Math.abs(marker.x - screen.width / 2) < 0.000001, `${fixture.label} marker x should align`);
  assert.ok(Math.abs(marker.y - screen.height / 2) < 0.000001, `${fixture.label} marker y should align`);

  const inverted = invertGlobePoint(marker.x, marker.y, rotation, screen);
  assert.ok(inverted, `${fixture.label} label projection should invert`);
  assert.ok(Math.abs(inverted.lat - fixture.lat) < 0.000001, `${fixture.label} inverted latitude should match`);
  assert.ok(Math.abs(inverted.lng - fixture.lng) < 0.000001, `${fixture.label} inverted longitude should match`);
}

const teleportStart = { lat: 6.5244, lng: 3.3792, label: "Lagos" };
const teleportEnd = { lat: 35.6762, lng: 139.6503, label: "Tokyo" };
const startRotation = focusRotationForPoint(teleportStart);
const endRotation = focusRotationForPoint(teleportEnd);
const startProjection = projectGlobePoint(teleportEnd, startRotation, screen);
const endProjection = projectGlobePoint(teleportEnd, endRotation, screen);
assert.ok(endProjection.z > startProjection.z, "teleport movement should improve destination visibility");
assert.ok(Math.abs(endProjection.x - screen.width / 2) < 0.000001, "teleport destination should center horizontally");
assert.ok(Math.abs(endProjection.y - screen.height / 2) < 0.000001, "teleport destination should center vertically");

const d3Projection = buildGlobeProjection(screen.width, screen.height, screen.radius, endRotation.rotX, endRotation.rotY);
assert.deepEqual(d3Projection.rotate().map((value) => Math.round(value * 1000) / 1000), [-teleportEnd.lng, -teleportEnd.lat, 0].map((value) => Math.round(value * 1000) / 1000), "D3 projection should preserve [longitude, latitude] rotation contract");

assert.deepEqual(readRendererFeatureFlags({}), { rendererKind: "canvas2d", photorealisticPreview: false, forceLegacyCanvas: true }, "legacy renderer should be default rollback");
assert.equal(shouldUsePhotorealisticPreview(readRendererFeatureFlags({ NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER: "preview" })), true, "preview flag activates the renderer adapter unless rollback is forced");
assert.equal(shouldUsePhotorealisticPreview(readRendererFeatureFlags({ NEXT_PUBLIC_VERCEL_ENV: "preview" })), true, "Vercel preview deployments should show the photorealistic renderer");
assert.equal(shouldUsePhotorealisticPreview(readRendererFeatureFlags({ NEXT_PUBLIC_VERCEL_ENV: "preview", NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER: "true" })), false, "forced legacy remains an instant rollback in preview");
assert.equal(shouldUsePhotorealisticPreview(readRendererFeatureFlags({ NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER: "preview", NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER: "false" })), true, "preview requires explicit rollback opt-out");
assert.equal(readRendererFeatureFlags({ NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER: "preview", NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER: "false" }).rendererKind, "photorealistic-preview", "browser-inlined preview flags should activate the renderer adapter");

console.log("renderer regression checks passed");
