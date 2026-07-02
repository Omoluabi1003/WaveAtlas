# Globe Tap-to-Play Regression Report

## Scope

This report documents the Git-history-backed regression analysis for globe tap-to-play: tap a visible globe location, rotate the globe and active beacon to the destination, start the nearest playable radio station, update the player, and update destination context/Daily Passport through the existing station-selection pipeline.

## Verified commits

- Last verified working commit: `73a9bdf` (`Make photorealistic globe default and restore globe click tuning`). This commit restored the `BlueMarbleGlobe` `onStationSelect` callback and wired both mobile and desktop globe instances to `setScopedStationAndDestination`, so a globe tap could enter the normal playback/destination pipeline.
- First broken commit: `e68410d` (`Build texture-driven photorealistic globe`). This commit removed `onStationSelect` from `BlueMarbleGlobe` and reduced `handlePointerUp` back to country selection only, so taps could change country context without selecting/playing a station.
- Regression merge commit: `f9c2d85` (`Promote photorealistic globe default with resilient fallback`) carried the broken photorealistic globe path forward onto the default renderer line before `73a9bdf` restored click tuning.
- Later restoration hardening commits: `1a13935`, `3ca06d1`, `1ec92ed`, and `b745805` corrected geometry alignment, country fallback selection, and selected-station destination targeting without introducing new interaction architecture.

## Files responsible

- `components/BlueMarbleGlobe.tsx`
  - Owns pointer down/move/up handling, `invertGlobePoint` use, country resolution, station ranking, `onStationSelect`, `focusPoint`, and active beacon rendering.
- `components/WaveAtlasApp.tsx`
  - Owns the `setScopedStationAndDestination` callback passed to the globe and the downstream call to `setCurrentStationAndDestination`.

## Function-level execution path

1. `handlePointerUp` ignores drag gestures, converts the pointer to local screen coordinates, resolves the tapped globe point with `invertGlobePoint`, and rejects back-facing points.
2. `countryAtPoint` uses loaded Natural Earth land shapes, with `nearestCountry` as a fallback, to resolve country context for the tapped location.
3. `rankStationsNearPoint` first ranks playable, non-GeoAudio stations with real station/city coordinates within 350 km of the tap.
4. If there is no nearby point-level station, `rankPlayableStationsInCountry` ranks playable stations in the resolved country and preserves the selected station's resolved point for diagnostics.
5. `handlePointerUp` calls `onStationSelect(selected, candidates, label)` when a playable station is found. It only calls `onCountrySelect` when no playable station is available for the tap.
6. `WaveAtlasApp` passes `onStationSelect` to mobile and desktop `BlueMarbleGlobe` instances. The callback inserts candidates into the station pool where needed and calls `setScopedStationAndDestination`.
7. `setScopedStationAndDestination` de-duplicates the selected station and candidates, filters to playable stream URLs, starts a scoped search session, and calls `setCurrentStationAndDestination`.
8. `setCurrentStationAndDestination` updates active station/destination state and the player. This is the shared path that drives globe focus, beacon movement, player UI, and destination/Daily Passport context.
9. After the active station changes, `stationPoint` resolves the station destination, `currentPoint` changes, and `focusPoint` rotates/zooms the globe to the selected destination while the active station beacon follows the selected station coordinates.

## Behavioral difference: working vs. broken

### Working at `73a9bdf`

- `BlueMarbleGlobe` accepted an `onStationSelect` prop.
- `handlePointerUp` resolved the tap through `invertGlobePoint`, ranked candidate stations, and called `onStationSelect` for the selected station.
- `WaveAtlasApp` wired both mobile and desktop globe instances to `setScopedStationAndDestination`.
- The selected station became the active station, which caused player state, destination context, globe `focusPoint`, and the active beacon to update through the existing shared selection pipeline.

### Broken at `e68410d` / carried by `f9c2d85`

- `BlueMarbleGlobe` no longer exposed/used `onStationSelect`.
- `handlePointerUp` only called `onCountrySelect` after country resolution.
- Because no station entered `setScopedStationAndDestination`, playback did not start, player state did not move to the nearest playable station, and station-driven destination context/Daily Passport updates did not occur.

## Root cause

The regression was caused by removing the station-selection callback from the globe tap path while building/promoting the photorealistic globe renderer. The renderer still resolved a tapped country, but it no longer forwarded a selected playable station into the app's established `setScopedStationAndDestination` pipeline. This broke playback and all station-derived destination updates even when globe geometry and country selection still appeared to work.

## Minimal restoration patch

Restore the prior working interaction, not a new interaction model:

1. Keep `BlueMarbleGlobe`'s `onStationSelect?: (station, candidates, label) => void` prop.
2. In `handlePointerUp`, after `invertGlobePoint` and country resolution, rank station candidates using the local station pool.
3. Prefer true nearby station coordinates; when none are within range, fall back to playable stations in the resolved country.
4. Call `onStationSelect` with the selected station and candidates; only fall back to `onCountrySelect` when no playable station is found.
5. Keep mobile and desktop globe wiring pointed at `setScopedStationAndDestination`.

This restoration is represented by `73a9bdf` and subsequently hardened by `b745805`; it does not modify renderer geometry, search layout, beacon rendering, playback internals, or station-ranking architecture beyond the restored globe-tap selection path.

## Risk assessment

- Low architectural risk: the fix uses the existing station-selection and playback pipeline instead of adding a new click-to-tune subsystem.
- Medium data-quality risk: country fallback depends on the current station pool having playable stations for the tapped country.
- Low rendering risk: no globe drawing, projection, beacon renderer, or layout redesign is required for the restoration.
- Regression risk to monitor: future renderer rewrites can again preserve country selection while accidentally dropping `onStationSelect`; this report should be used as a checklist for renderer changes.

## Regression test checklist

- Tap a visible land location with a known station within 350 km; verify the selected station starts playback and the player updates.
- Tap a visible country area without a nearby station but with playable country stations; verify country fallback selects and plays a station from that country.
- Tap ocean/no-country or a country with no playable station; verify no speculative playback begins and country-only behavior remains graceful.
- Drag the globe and release; verify drag gestures do not trigger station selection.
- Tap a back-facing/invalid projected point; verify no selection or playback occurs.
- Verify desktop and mobile globe instances both pass `onStationSelect` into `setScopedStationAndDestination`.
- Verify active station changes still drive `focusPoint`, active beacon coordinates, player state, and Daily Passport/destination context.
