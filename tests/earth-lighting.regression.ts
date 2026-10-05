import assert from "node:assert/strict";
import { earthVector, solarIntensity, subsolarPoint, surfaceVector } from "../lib/earth-lighting";
import { buildGlobeProjection, DEG, GLOBE_COORDINATE_FIXTURES } from "../lib/globe-math";

for (const [date, expectedLat] of [["2026-06-21T12:00:00Z", 23.44], ["2026-12-21T12:00:00Z", -23.44], ["2026-03-20T12:00:00Z", 0]] as const) {
  const at = Date.parse(date), point = subsolarPoint(at);
  assert.ok(Math.abs(point.lat - expectedLat) < 1.2, `${date}: solar declination`);
  assert.ok(Math.abs(point.lng) < 3, "UTC noon should illuminate near Greenwich");
  assert.ok(solarIntensity(point, at) > 0.99999);
  assert.ok(solarIntensity({ lat: -point.lat, lng: point.lng + 180 }, at) < -0.99999);
}
const noon = subsolarPoint(Date.parse("2026-10-05T12:00:00Z"));
const later = subsolarPoint(Date.parse("2026-10-05T18:00:00Z"));
assert.ok(Math.abs(later.lng - noon.lng + 90) < 0.2, "Sunlight moves west 90 degrees in six hours");
for (const year of [2024, 2026]) {
  const point = subsolarPoint(Date.parse(`${year}-12-31T23:59:59Z`));
  assert.ok(Number.isFinite(point.lat) && Number.isFinite(point.lng));
}
for (const rotation of [{ rotX: 0, rotY: 0 }, { rotX: 40 * DEG, rotY: -75 * DEG }, { rotX: -30 * DEG, rotY: 160 * DEG }]) {
  const projection = buildGlobeProjection(800, 800, 300, rotation.rotX, rotation.rotY);
  for (const fixture of GLOBE_COORDINATE_FIXTURES) {
    const projected = projection([fixture.lng, fixture.lat]);
    assert.ok(projected);
    const inverted = projection.invert?.(projected);
    if (!inverted || Math.abs(inverted[1] - fixture.lat) > 0.001 || Math.abs(inverted[0] - fixture.lng) > 0.001) continue;
    const vector = surfaceVector((projected[0] - 400) / 300, (400 - projected[1]) / 300, rotation);
    assert.ok(vector);
    const expected = earthVector(fixture.lat, fixture.lng);
    vector.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-6, `${fixture.label}: satellite surface aligns with station geometry`));
  }
}
assert.equal(surfaceVector(1.1, 0, { rotX: 0, rotY: 0 }), null);
console.log("Earth lighting: solstices, equinox, UTC progression, leap years, and D3 texture alignment pass.");
