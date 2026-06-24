# WaveAtlas Safe Debris Audit

Branch: `chore/safe-debris-audit`
Date: 2026-06-24
Mode: YCOMBINATOR safe cleanup

## Scope

This audit checks for repository debris without changing core behavior. The protected systems are playback, station selection, teleport routing, map centering, globe focus, Daily brief rendering, station data, and stream validation.

## Confirmed findings

### 1. Active beacon marker needed stronger containment metadata

The active station beacon is correctly shared between the map and globe through `ActiveStationBeacon` and `signal-beacon-engine`. The map path renders a DOM marker while the globe path renders through canvas. Because the DOM marker contains multiple animated rings, glow layers, and drop shadows, the marker benefits from explicit isolation metadata so its visual stack does not blend unpredictably with nearby map overlays.

Action taken:

- Added `isolation: isolate` to the active marker element.
- Added explicit marker `zIndex` metadata.
- Added `aria-hidden="true"` because the beacon is decorative and should not pollute the accessibility tree.

Files changed:

- `components/ActiveStationBeacon.tsx`

Why this is safe:

- No playback logic changed.
- No station selection logic changed.
- No geospatial coordinate logic changed.
- No CSS animation was removed.
- No map or globe rendering path was replaced.

### 2. Legacy panel and Street View cleanup was already handled

Recent repository history shows prior cleanup around hidden Daily brief drawer content and Street View simplification. No additional deletion was performed in this pass because deletion without full import graph proof would be risky.

Action taken:

- No file deletion.

## Suspected findings requiring local validation

These should be validated with a local clone before removal:

1. `package.json` uses several `latest` dependency ranges. This is not UI debris, but it is build stability debris because future installs can drift.
2. `app/globals.css` contains dense single-line CSS, making future beacon and mobile layout fixes harder to review.
3. The map view renders `SignalConstellationLayer`, atmosphere overlays, grid overlays, terminator, and cloud layer near the active beacon. These may visually read as debris if the active marker pulse expands over them.

No action was taken on these items because they require visual QA and build validation.

## No-action findings

- `ActiveStationBeacon` should remain because it is the shared map beacon entry point.
- `drawActiveStationBeacon` should remain because the globe imports it for canvas rendering.
- `signal-beacon-engine` should remain because it centralizes beacon travel and pulse rendering.
- `signal-constellations` should remain because it drives active and ambient radio signal features.

## Required verification before merge

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Manual QA:

1. Select a station in map view and confirm the beacon centers correctly.
2. Confirm the beacon still pulses like a radio signal.
3. Confirm the globe still renders the active beacon.
4. Confirm mobile iPhone viewport does not show visual debris around the beacon.
5. Confirm Daily brief and playback controls still work.

## Rollback

Rollback is simple: revert the commit that modifies `components/ActiveStationBeacon.tsx` or delete this audit branch.
