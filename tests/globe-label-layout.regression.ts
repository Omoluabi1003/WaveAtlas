import assert from "node:assert/strict";
import { beaconLabelExclusion, labelsOverlap } from "../lib/globe-label-layout";

for (const mobile of [true, false]) {
  const beacon = beaconLabelExclusion(300, 500, mobile);
  const caption = { left: 240, right: 360, top: 469, bottom: 483 };
  const neighbouringCountry = { left: 280, right: 390, top: 493, bottom: 507 };
  assert.equal(labelsOverlap(caption, neighbouringCountry), false, "Old caption-only collision check misses the screenshot overlap");
  assert.equal(labelsOverlap(beacon, neighbouringCountry), true, "Country text through the active beacon is suppressed");
  assert.equal(labelsOverlap(beacon, { left: 400, right: 460, top: 493, bottom: 507 }), false, "Unrelated country labels remain visible");
  assert.equal(labelsOverlap(beacon, { left: 260, right: 340, top: 510, bottom: 520 }), true);
}
console.log("Globe label layout: neighbouring Congo label, beacon exclusion and distant country labels pass.");
