# WaveAtlas Safe Debris Audit

Date: 2026-06-24
Branch: `chore/safe-debris-audit-direct`
Mode: Non-destructive audit

## Executive summary

This pass intentionally avoids deleting files, rewriting runtime logic, or changing playback, navigation, map, globe, or station behavior. The current repository is moving quickly, and the safest first step is to document confirmed debris and risk zones before applying surgical cleanup.

## Confirmed findings

### 1. Active station beacon is now shared, but still has two rendering surfaces

The map renders the active station beacon through `components/ActiveStationBeacon.tsx`. The globe renders through `drawActiveStationBeacon`, exported from the same component and backed by `lib/signal-beacon-engine.ts`.

This is directionally correct because the visual identity is centralized, but the DOM marker path and canvas drawing path can still drift visually. Any cleanup must preserve this shared engine and avoid replacing it with another beacon implementation.

Relevant files:

- `components/ActiveStationBeacon.tsx`
- `lib/signal-beacon-engine.ts`
- `components/BlueMarbleGlobe.tsx`
- `app/globals.css`
- `components/WaveAtlasApp.tsx`

### 2. Beacon debris is most likely visual overlap, not broken data

The map view places several visual systems in the same canvas area:

- `SignalConstellationLayer`
- `ActiveStationBeacon`
- `map-atmosphere-overlay`
- grid overlay
- `day-night-terminator`
- `cloud-layer`

Because the beacon CSS uses visible overflow, multiple drop shadows, glow layers, and expanding rings, the surrounding layers can make the pulse look like debris, especially on mobile and dense desktop map views.

Recommended safe cleanup: isolate the active beacon visually rather than removing map systems. Prefer CSS containment, z-index discipline, lighter inactive constellation opacity near the active station, and reduced halo spill on mobile.

### 3. Debug infrastructure exists and should remain gated

The codebase includes debug pathways for layout, signals, globe, teleport, playback, and beacon diagnostics. These are useful during this phase and should not be broadly removed. The safe standard is to keep every debug path behind `NEXT_PUBLIC_WAVEATLAS_DEBUG_*` or development-only guards.

Recommended safe cleanup: remove only unconditional production console output if found in a follow-up pass.

### 4. Dependency drift risk exists

`package.json` uses `latest` for several dependencies. That is not visual debris, but it is build-governance debris. Future installs may shift versions without an intentional upgrade.

Recommended safe cleanup: do not pin or upgrade dependencies in the same PR as visual cleanup. Handle dependency governance separately.

## Suspected findings requiring follow-up verification

These should not be deleted until confirmed with a full import/reference graph:

- old UI drawer remnants from prior Daily brief iterations
- obsolete Street View references after removal work
- unused utility rail variants from recent desktop control changes
- unused CSS selectors from prior globe/map experiments
- stale component exports retained for backward compatibility

## No-action findings

Do not remove these during debris cleanup:

- `ActiveStationBeacon`
- `signal-beacon-engine`
- `signal-constellations`
- `navigation-engine`
- `map-camera`
- `NewspaperBrief`
- `BlueMarbleGlobe`
- `WaveAtlasApp`
- Supabase migrations
- curated station data
- branding assets

## Recommended next PR

Create a small follow-up PR named something like `fix/isolate-map-beacon-visual-debris` with only these changes:

1. Keep `ActiveStationBeacon` mounted in map view.
2. Keep `drawActiveStationBeacon` used by globe view.
3. Add a dedicated beacon isolation class for MapLibre DOM markers.
4. Reduce mobile halo spill without weakening the radio-signal pulse.
5. Confirm the constellation layer does not visually stack directly over the active station.
6. Do not alter station selection, teleport, navigation, playback, geotruth, or stream validation logic.

## Validation required before merge

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Manual checks:

- select a station on desktop map view and verify the beacon centers correctly
- select a station on iPhone viewport and verify smooth travel
- confirm the beacon still pulses like radio emission
- confirm globe beacon still renders during travel and arrival
- confirm Daily brief still appears and remains readable
- confirm playback controls still work

## Governance note

This audit is intentionally conservative. WaveAtlas should not be cleaned like a junk drawer. It should be cleaned like an aircraft cockpit: remove only what is proven unnecessary, because one loose wire can ground the flight.
