import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { marqueeOffsetAt, resolveMarqueeTiming } from "../lib/marquee-motion";

const timing = resolveMarqueeTiming(360, 36, 1200);
assert.equal(timing.distancePx, 360);
assert.equal(timing.travelMs, 10000);
assert.equal(timing.cycleMs, 12400);
assert.equal(marqueeOffsetAt(0, timing), 0);
assert.equal(marqueeOffsetAt(1200, timing), 0);
assert.equal(marqueeOffsetAt(6200, timing), -180);
assert.equal(marqueeOffsetAt(11200, timing), -360);
assert.equal(marqueeOffsetAt(12400, timing), 0);

const invalid = resolveMarqueeTiming(Number.NaN, Number.NaN, Number.NaN);
assert.equal(invalid.distancePx, 0);
assert.equal(marqueeOffsetAt(500, invalid), 0);

const component = readFileSync("components/common/AutoMarqueeText.tsx", "utf8");
assert.match(component, /track\.animate\(/, "WAAPI must be the primary marquee engine");
assert.match(component, /startRafFallback/, "requestAnimationFrame fallback must remain available");
assert.match(component, /window\.addEventListener\("pageshow"/, "iOS bfcache/page restore must restart the marquee");
assert.match(component, /document\.addEventListener\("visibilitychange"/, "foreground restore must restart the marquee");
assert.match(component, /visualViewport\?\.addEventListener\("scroll"/, "iOS address-bar viewport movement must trigger remeasurement");
assert.match(component, /MEASURE_RETRY_MS/, "first-paint layout retries must remain enabled");
assert.match(component, /maskImage: "none", WebkitMaskImage: "none"/, "Safari mask compositing must not own the animation surface");
assert.match(component, /animation: "none"/, "legacy global CSS animation must be disabled for the runtime engine");
assert.match(component, /prefers-reduced-motion: reduce/, "accessibility motion preference must remain respected");
assert.doesNotMatch(component, /style jsx global/, "runtime motion must not depend on dynamically injected keyframes");

console.log("iOS marquee motion regression checks passed.");
