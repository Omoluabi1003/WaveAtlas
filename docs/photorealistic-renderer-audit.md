# WaveAtlas photorealistic renderer audit

## Scope

This audit was completed before introducing any renderer migration code. The current globe remains the default fallback; no station logic, GeoAware search, beacon behavior, teleport logic, Audio Tourism, Daily Passport, country polygons, OSM layers, labels, or interaction systems were changed.

## Current instantiation points

- `WaveAtlasApp` dynamically imports `BlueMarbleGlobe`, making the canvas globe the only globe renderer instantiated by the application shell.
- `WaveAtlasMap` instantiates MapLibre separately for OSM/vector map workflows; it owns country-click selection, active station beacon overlays, signal constellations, camera controls, and map-to-globe transitions.
- `BlueMarbleGlobe` owns a 2D canvas draw loop, Natural Earth boundary loading, D3 orthographic projection, active beacon drawing, progressive labels, live signal points, city-light styling, and focus/teleport animation.

## Coupling inventory

| System | Rendering dependency | Migration concern |
| --- | --- | --- |
| Beacon animation | Both map and globe project station coordinates and render `ActiveStationBeacon`/`drawActiveStationBeacon`. | Projection parity is critical. |
| Teleport | `teleporting` alters focus duration, drift, and transition diagnostics in the canvas globe. | Renderer must consume the same state without changing queue/business logic. |
| Camera navigation | MapLibre camera is isolated in `useMapCameraController`; globe camera uses `globe-math`. | Safe if adapter preserves `focusRotationForPoint` and projection contracts. |
| Search centering | Map search state calls map camera methods; country selection passes centroids into station APIs/app state. | Do not move search logic into renderer. |
| Labels | Globe labels are built from land shapes, city-light fixtures, active point, and nearby stations. | Label projection must remain deterministic. |
| Station positioning | `resolveStationGeo` and `geotruth` resolve business coordinates before rendering. | Safe to render differently only after coordinate inputs remain unchanged. |
| Audio Tourism | `BlueMarbleGlobe` loading copy references Audio Tourism; app audio state is outside renderer. | Visual-only changes should not touch playback/queue code. |
| Daily Passport / Daily panels | Rendered in app panels outside globe. | No renderer dependency. |
| Country selection | MapLibre feature queries and globe nearest-country click logic produce `CountryResult`. | Renderer must not alter country APIs or selection callbacks. |
| OSM layers | MapLibre style layers are separate from canvas globe. | Photorealistic work should not modify OSM/map layers. |

## Independent visual surfaces

Materials, lighting, atmosphere, water/ocean color, cloud overlays, city-light visual density, and shader-like canvas effects are currently concentrated in `BlueMarbleGlobe`'s draw loop. They can be changed independently from business logic only if the app keeps passing the same station, station list, basemap, selection version, teleport flag, and callbacks.

## Risk classification

**Migration risk: medium.** The business logic is mostly outside the draw loop, but the current canvas renderer is tightly coupled to projection verification, focus correction, label projection, signal rendering, and beacon placement. A blind replacement risks misaligned beacons and broken teleport/search centering. The safest path is an adapter that preserves projection contracts and keeps the legacy canvas renderer forced by default.

## Safe integration path

1. Keep `BlueMarbleGlobe` as the production renderer.
2. Add a renderer adapter contract that captures runtime state and projection expectations.
3. Gate any photorealistic renderer behind `NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER=preview`.
4. Keep rollback enabled with `NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER=true` by default.
5. Add regression checks around coordinate/projection contracts before implementing WebGL/Three materials.

## Recommendation

Proceed only with preview-only photorealistic rendering after adapter tests pass. Do not replace the production renderer until parity is proven for camera alignment, marker placement, beacon position, teleport movement, search centering, and label projection.
