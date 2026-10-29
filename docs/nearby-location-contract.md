# Explore Nearby location contract

`Explore Nearby` is a location-scoped action. It must never silently become worldwide discovery when listener location is unavailable.

Rules:
- Nearby requests require validated coordinates.
- Intentional worldwide teleport must include an anchor station.
- `global=true` without an anchor is rejected with `LOCATION_REQUIRED`.
- No station inventory ordering may substitute for listener location.
- If device location is unavailable, the UI should ask for location permission or manual destination selection rather than selecting a global station.
