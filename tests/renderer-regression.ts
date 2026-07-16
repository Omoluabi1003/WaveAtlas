import assert from "node:assert/strict";
import { buildGlobeProjection, fixtureProjectsToFocusedCenter, focusRotationForPoint, invertGlobePoint, projectGlobePoint, GLOBE_COORDINATE_FIXTURES } from "../lib/globe-math";
import { readRendererFeatureFlags, shouldUsePhotorealisticPreview } from "../lib/globe-renderer-adapter";
import { readFileSync } from "node:fs";
import { advanceCloudDrift, CLOUD_CONTEXT_LOST_EVENT, CLOUD_DESKTOP_DRIFT_SPEED, CLOUD_MAX_DRIFT_DELTA_MS, type CloudLayerState } from "../components/BlueMarbleGlobe";

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
assert.equal(shouldUsePhotorealisticPreview(readRendererFeatureFlags({ NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER: "preview" })), false, "preview flag alone should not override rollback");
assert.equal(shouldUsePhotorealisticPreview(readRendererFeatureFlags({ NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER: "preview", NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER: "false" })), true, "preview requires explicit rollback opt-out");
assert.equal(readRendererFeatureFlags({ NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER: "preview", NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER: "false" }).rendererKind, "photorealistic-preview", "browser-inlined preview flags should activate the renderer adapter");

const makeCloudLayer = (overrides: Partial<CloudLayerState> = {}): CloudLayerState => ({
  quality: "full",
  resourceStatus: "ready",
  particles: [{ lat: 0, lng: 0, radius: 1, alpha: 1, stretch: 1 }],
  drift: 0,
  driftStatus: "paused",
  activatedAt: 1000,
  lastDriftAt: 1000,
  performanceStartedAt: 1000,
  frameCount: 0,
  totalFrameMs: 0,
  renderFrameMs: 0,
  slowWindows: 0,
  downgradeReason: null,
  iosReduced: false,
  contextLost: false,
  loadToken: 0,
  ...overrides,
});

const constantDrift = makeCloudLayer();
advanceCloudDrift(constantDrift, { now: 1016, mobile: false, reducedMotion: false, travelActive: false, documentHidden: false });
const firstDriftStep = constantDrift.drift;
advanceCloudDrift(constantDrift, { now: 1032, mobile: false, reducedMotion: false, travelActive: false, documentHidden: false });
const secondDriftStep = constantDrift.drift - firstDriftStep;
assert.ok(Math.abs(firstDriftStep - secondDriftStep) < 1e-12, "cloud drift should advance by a constant amount for equal frame deltas");

const suspendedDrift = makeCloudLayer();
advanceCloudDrift(suspendedDrift, { now: 61000, mobile: false, reducedMotion: false, travelActive: false, documentHidden: false });
assert.equal(suspendedDrift.drift, CLOUD_DESKTOP_DRIFT_SPEED * CLOUD_MAX_DRIFT_DELTA_MS, "long page suspension should clamp drift instead of causing a large jump");

const restoredDrift = makeCloudLayer({ lastDriftAt: 5000 });
advanceCloudDrift(restoredDrift, { now: 65000, mobile: false, reducedMotion: false, travelActive: false, documentHidden: true });
assert.equal(restoredDrift.lastDriftAt, 65000, "visibility restoration should reset lastDriftAt while hidden/paused");
advanceCloudDrift(restoredDrift, { now: 65016, mobile: false, reducedMotion: false, travelActive: false, documentHidden: false });
assert.equal(restoredDrift.drift, CLOUD_DESKTOP_DRIFT_SPEED * 16, "visibility restoration should resume from reset lastDriftAt without hidden-time drift");

const reducedMotionDrift = makeCloudLayer();
advanceCloudDrift(reducedMotionDrift, { now: 1040, mobile: false, reducedMotion: true, travelActive: false, documentHidden: false });
assert.equal(reducedMotionDrift.drift, 0, "reduced motion should prevent cloud drift");
assert.equal(reducedMotionDrift.driftStatus, "paused", "reduced motion should pause cloud drift");

const rendererSource = readFileSync("components/BlueMarbleGlobe.tsx", "utf8");
assert.equal(CLOUD_CONTEXT_LOST_EVENT, "contextlost", "2D canvas context loss event should be contextlost");
assert.equal((rendererSource.match(/addEventListener\(CLOUD_CONTEXT_LOST_EVENT/g) ?? []).length, 1, "only one 2D canvas context-loss listener should be registered");
assert.equal((rendererSource.match(/removeEventListener\(CLOUD_CONTEXT_LOST_EVENT/g) ?? []).length, 1, "only one 2D canvas context-loss listener should be removed");
assert.equal(rendererSource.includes("webglcontextlost"), false, "cloud renderer must not register WebGL context-loss events for a 2D canvas");
assert.match(rendererSource, /supportsCanvas2DContextLossEvents\(canvas\)/, "2D canvas context-loss support should be feature-detected");
assert.match(rendererSource, /const onContextLost = \(event: Event\) => \{[\s\S]*?cloudLayer\.quality = "disabled";[\s\S]*?cloudLayer\.resourceStatus = "failed";[\s\S]*?cloudLayer\.particles = \[\];[\s\S]*?debugClouds/, "cloud context loss should disable only cloud resources");
assert.equal(rendererSource.includes("fallbackRef.current?.(reason)"), true, "render-loop errors still use globe fallback");
assert.equal(/onContextLost[\s\S]*fallbackRef\.current/.test(rendererSource), false, "cloud context loss must not trigger globe fallback");
assert.match(rendererSource, /sustained total frame cost/, "performance diagnostic should describe sustained total frame cost");
assert.equal(rendererSource.includes("sustained cloud frame cost"), false, "performance diagnostic should not attribute total app frame cost exclusively to clouds");

console.log("renderer regression checks passed");
