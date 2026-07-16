import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildGlobeProjection,
  fixtureProjectsToFocusedCenter,
  focusRotationForPoint,
  invertGlobePoint,
  projectGlobePoint,
  GLOBE_COORDINATE_FIXTURES,
} from "../lib/globe-math";
import {
  readRendererFeatureFlags,
  shouldUsePhotorealisticPreview,
} from "../lib/globe-renderer-adapter";

const screen = { width: 1000, height: 1000, radius: 300 };

for (const fixture of GLOBE_COORDINATE_FIXTURES) {
  const projected = fixtureProjectsToFocusedCenter(fixture, screen);
  assert.equal(
    projected.centered,
    true,
    `${fixture.label} should focus to globe center for camera/search centering`,
  );

  const rotation = focusRotationForPoint(fixture);
  const marker = projectGlobePoint(fixture, rotation, screen);
  assert.ok(
    marker.z > 0.999999,
    `${fixture.label} beacon should be front-facing at focus`,
  );
  assert.ok(
    Math.abs(marker.x - screen.width / 2) < 0.000001,
    `${fixture.label} marker x should align`,
  );
  assert.ok(
    Math.abs(marker.y - screen.height / 2) < 0.000001,
    `${fixture.label} marker y should align`,
  );

  const inverted = invertGlobePoint(marker.x, marker.y, rotation, screen);
  assert.ok(inverted, `${fixture.label} label projection should invert`);
  assert.ok(
    Math.abs(inverted.lat - fixture.lat) < 0.000001,
    `${fixture.label} inverted latitude should match`,
  );
  assert.ok(
    Math.abs(inverted.lng - fixture.lng) < 0.000001,
    `${fixture.label} inverted longitude should match`,
  );
}

const teleportStart = { lat: 6.5244, lng: 3.3792, label: "Lagos" };
const teleportEnd = { lat: 35.6762, lng: 139.6503, label: "Tokyo" };
const startRotation = focusRotationForPoint(teleportStart);
const endRotation = focusRotationForPoint(teleportEnd);
const startProjection = projectGlobePoint(teleportEnd, startRotation, screen);
const endProjection = projectGlobePoint(teleportEnd, endRotation, screen);
assert.ok(
  endProjection.z > startProjection.z,
  "teleport movement should improve destination visibility",
);
assert.ok(
  Math.abs(endProjection.x - screen.width / 2) < 0.000001,
  "teleport destination should center horizontally",
);
assert.ok(
  Math.abs(endProjection.y - screen.height / 2) < 0.000001,
  "teleport destination should center vertically",
);

const d3Projection = buildGlobeProjection(
  screen.width,
  screen.height,
  screen.radius,
  endRotation.rotX,
  endRotation.rotY,
);
assert.deepEqual(
  d3Projection.rotate().map((value) => Math.round(value * 1000) / 1000),
  [-teleportEnd.lng, -teleportEnd.lat, 0].map(
    (value) => Math.round(value * 1000) / 1000,
  ),
  "D3 projection should preserve [longitude, latitude] rotation contract",
);

assert.deepEqual(
  readRendererFeatureFlags({}),
  {
    rendererKind: "canvas2d",
    photorealisticPreview: false,
    forceLegacyCanvas: true,
  },
  "legacy renderer should be default rollback",
);
assert.equal(
  shouldUsePhotorealisticPreview(
    readRendererFeatureFlags({
      NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER: "preview",
    }),
  ),
  false,
  "preview flag alone should not override rollback",
);
assert.equal(
  shouldUsePhotorealisticPreview(
    readRendererFeatureFlags({
      NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER: "preview",
      NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER: "false",
    }),
  ),
  true,
  "preview requires explicit rollback opt-out",
);
assert.equal(
  readRendererFeatureFlags({
    NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER: "preview",
    NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER: "false",
  }).rendererKind,
  "photorealistic-preview",
  "browser-inlined preview flags should activate the renderer adapter",
);

const blueMarble = readFileSync("components/BlueMarbleGlobe.tsx", "utf8");
assert.match(
  blueMarble,
  /type CloudSystem = \{[\s\S]*lat: number;[\s\S]*lng: number;[\s\S]*lobes: CloudLobe\[\]/,
  "cloud rendering must use anchored multi-lobe cloud systems",
);
assert.match(
  blueMarble,
  /type CloudLobe = \{[\s\S]*x: number;[\s\S]*y: number;[\s\S]*width: number;[\s\S]*height: number;[\s\S]*alpha: number;[\s\S]*rotation: number/,
  "cloud lobes must include irregular geometry and opacity fields",
);
assert.doesNotMatch(
  blueMarble,
  /type CloudParticle|buildCloudParticles|cloud\.radius|cloud\.stretch/,
  "single-ellipse cloud particles must not remain in the renderer",
);
assert.match(
  blueMarble,
  /CLOUD_SYSTEMS_FULL = 58/,
  "desktop cloud system budget should remain explicit and deterministic",
);
assert.match(
  blueMarble,
  /CLOUD_SYSTEMS_REDUCED = 22/,
  "reduced iPhone cloud system budget should be lower than desktop",
);
assert.match(
  blueMarble,
  /CLOUD_LOBES_FULL_MIN = 4/,
  "desktop systems should support more lobes",
);
assert.match(
  blueMarble,
  /CLOUD_LOBES_REDUCED_MIN = 3/,
  "reduced systems should use fewer lobes than desktop",
);
assert.match(
  blueMarble,
  /options\.now - clouds\.lastDriftAt/,
  "cloud drift must be based on frame delta from lastDriftAt",
);
assert.match(
  blueMarble,
  /Math\.min\(CLOUD_MAX_DRIFT_DELTA_MS, options\.now - clouds\.lastDriftAt\)/,
  "long page suspension must clamp cloud drift delta",
);
assert.match(
  blueMarble,
  /!options\.reducedMotion && !options\.travelActive && !options\.hidden/,
  "reduced motion, hidden documents, and globe travel must pause cloud drift",
);
assert.match(
  blueMarble,
  /resetCloudDriftClock\(cloudLayer\);[\s\S]*event: "pageshow"/,
  "pageshow must reset the drift clock without hidden-time accumulation",
);
assert.match(
  blueMarble,
  /addEventListener\("contextlost", onContextLost\)/,
  "Canvas 2D contextlost listener must be registered",
);
assert.match(
  blueMarble,
  /removeEventListener\("contextlost", onContextLost\)/,
  "Canvas 2D contextlost listener must be cleaned up",
);
assert.doesNotMatch(
  blueMarble,
  /webglcontextlost/,
  "cloud canvas lifecycle must not use WebGL context loss events",
);
assert.match(
  blueMarble,
  /const supportsCanvasContextLost = "oncontextlost" in canvas/,
  "Canvas context loss support must be feature-detected",
);
assert.match(
  blueMarble,
  /sustained total frame cost/,
  "diagnostics must describe sustained total frame cost, not cloud-only render cost",
);
assert.match(
  blueMarble,
  /CLOUD_SLOW_WINDOWS_BEFORE_DOWNGRADE = 3/,
  "cloud quality downgrade must require multiple sustained slow windows",
);
const cloudDrawIndex = blueMarble.indexOf("drawPhotorealisticCloudLayer(ctx");
const boundaryDrawIndex = blueMarble.indexOf(
  "drawPhotorealisticCountryBoundaries(ctx",
  cloudDrawIndex,
);
const beaconDrawIndex = blueMarble.indexOf(
  "drawActiveStationBeacon(ctx",
  cloudDrawIndex,
);
assert.ok(
  cloudDrawIndex >= 0 &&
    boundaryDrawIndex > cloudDrawIndex &&
    beaconDrawIndex > cloudDrawIndex,
  "labels, borders, and beacon must render above clouds",
);
  const onContextLostIndex = blueMarble.indexOf("const onContextLost");
  const documentEventListenerIndex = blueMarble.indexOf(
    "document.addEventListener",
    onContextLostIndex,
  );
  assert.ok(
    onContextLostIndex >= 0,
    "const onContextLost must exist in BlueMarbleGlobe.tsx",
  );
  assert.ok(
    documentEventListenerIndex > onContextLostIndex,
    "document.addEventListener must exist after const onContextLost",
  );
  assert.doesNotMatch(
    blueMarble.slice(onContextLostIndex, documentEventListenerIndex),
    /fallbackRef|onFallback/,
    "cloud context loss must disable clouds without invoking globe fallback",
  );

console.log("renderer regression checks passed");
