# WaveAtlas renderer roadmap

## Known good baseline

PR #239, **"Add photorealistic globe preview with safe rollback"**, is the Known Good Renderer Baseline for the WaveAtlas globe renderer. Keep this baseline intact until each renderer improvement below ships as its own deployable, reversible, and visually verified PR.

The PR #239 baseline keeps the existing 2D canvas globe as the default rollback path. Photorealistic rendering remains preview-only behind `NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER=preview` plus `NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER=false`; the default user-facing globe style remains Blue Marble, with Night Globe and Signal Globe preserved as fallback styles.

## Renderer stability rules

Every future renderer PR must:

1. Modify only one visual subsystem at a time.
2. Be independently deployable without depending on another unmerged renderer PR.
3. Be reversible with a small rollback that does not affect station, audio, search, country, Daily Passport, Audio Tourism, map, or teleport behavior.
4. Include visual verification notes for globe load, beacon alignment, station projection, search centering, teleport destination, labels, country interaction, radio playback, and map mode.
5. Keep fallback styles available: Blue Marble Globe, Night Globe, and Signal Globe.
6. Avoid render-loop state mutation, diagnostics-driven rerenders, heavy per-frame texture sampling, and texture loading that can block the globe from rendering.

## Staged follow-up PRs

1. **Country boundaries** — Improve boundary styling only. Do not change textures, lighting, labels, station projection, search, teleport, or map logic.
2. **Day texture** — Add one static day texture path with a deterministic canvas fallback. Do not add night lights, clouds, normal maps, per-frame texture sampling, or default promotion.
3. **Cloud layer** — Add an optional cloud overlay after the day texture is stable. Keep it independently disableable.
4. **Night lights** — Add night-light visuals only after day texture and clouds are stable. Keep Blue Marble, Night Globe, and Signal Globe as fallback styles.
5. **Atmosphere** — Tune atmosphere and directional lighting only. Do not introduce new imagery or interaction changes.
6. **Performance optimization** — Optimize draw frequency, caching, memory, and mobile behavior as a standalone PR with before/after measurements.
7. **Diagnostics** — Add renderer diagnostics outside the hot path. Diagnostics must not update React state from every animation frame.
8. **Default promotion** — Promote Photorealistic Globe only after the previous stages are stable in preview and manual verification confirms all WaveAtlas interactions remain unchanged.

## Verification checklist

Before any renderer PR merges, verify:

- Globe loads without freezing or failing.
- Active beacon aligns with the selected station.
- Station projection and labels stay attached to their coordinates.
- Search centering and teleport destination both center the intended location.
- Country click/selection still works.
- Daily Passport and Audio Tourism panels are unchanged.
- Radio playback continues through globe/map transitions.
- Map mode and map-to-globe/globe-to-map transitions are unchanged.
