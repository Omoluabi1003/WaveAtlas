# Atlas Journey

Open **Atlas Journey** under the desktop brand or **Journey** beside mobile search. Routes work worldwide using station city locations and explicitly approximate country centres. Saved and shared journeys open as paused previews.

## Flight experience

The globe uses the existing local NASA day/night/cloud textures with solar lighting. WebGL renders the surface when available; an inverse spherical texture projection preserves the satellite view without GPU support. The generic twin-engine aircraft is a shaded mesh with a tapered fuselage, swept wings, engines, cockpit and tail. Route, aerial and following camera views change its viewing angle. The scene remains a simulated flight map rather than an aircraft navigation instrument or terrain flight simulator.

The flight estimate is `great-circle distance × 1.04 / cruise speed + 25 minutes`, with a default 850 km/h cruise and a climb/descent allowance. Lagos to Dubai is approximately 7h 37m with this model. It is an adjustable planning estimate, not a verified airline schedule. Enter an airline's duration in minutes to drive schedule-based remaining flight time and estimated arrival. UTC arrival is anchored when the journey begins. Preview remaining time is displayed separately: four minutes at the default preview pace, accelerated with 2×/4×. Flight estimates do not claim live winds, operational routing, airport delays or live flight tracking.

## Sound and Atlas

Beginning a journey enables automatic regional tuning and the Atlas spoken guide. The route's sampled countries are prefetched with three bounded lookup workers, at most 15 countries, 60 results each, and a 30-country session cache. Abort signals stop old-route lookups. Located, active stations within 800 km form the listening queue. Recently checked healthy signals take priority over stale entries. Country-centroid station fallbacks are excluded. Handoffs occur as the route moves into another station region; the current signal continues across oceans and stretches without a local candidate. Manual Listen disables automatic tuning until it is re-enabled.

Atlas uses the existing repository-canonical Omoluabi worker and PCM player. Departure, country-crossing and arrival guidance appears in captions and is spoken when the personal voice is available. Narrations finish before the next queued announcement. Conversation has priority over touring. Radio continues during model preparation and is held exclusively during audible narration, returning only after playback completes. Pause, route reset, close and guide mute cancel tour narration. A 30-second tour preparation deadline releases stalled speech and reports the issue in the journey; no unrelated fallback voice is substituted. Voice-model readiness and first-generation speed still depend on device and cached assets.

## Radio connectivity and coverage

Amuludun FM 99.1 Moniya Ibadan and Gold FM 95.5 Ilesa use audio sources extracted from their official FRCN players. Nine directly checked Middle East sources cover UAE, Saudi Arabia, Qatar, Oman, Jordan and Lebanon. Searching “Middle East” or “Gulf” returns country-scoped regional results. Dubai Eye and Virgin Radio Dubai preserve their official UAE identities and regional access limitations rather than directory URLs pointing to unrelated UK stations.

Known curated station names return directly without a geocoder/directory round trip. Directory requests use bounded, hedged mirrors and shared in-flight caching. Likely result hosts receive limited preconnection hints. The player reuses an existing stream across status/volume changes. Safari uses native HLS; other supported browsers dynamically load the free Apache-licensed HLS.js engine for playlist stations. Broadcaster geographic blocks, CORS policies and upstream delays can still prevent or slow playback.

## Validation

- `npm run test:journey`: route geometry, ETA model, regional itinerary, direct station search, correct restricted UAE identities, six-country coverage, directory hedging, connection reuse and native HLS.
- `npm run test:journey:browser`: actual UI, satellite texture loading, aircraft animation, pause/seek/cameras, automatic departure MP3 and destination HLS playback, audio focus held until narration ends, entered schedule, saved/shared routes, nested Brief, mobile layouts and runtime errors. Requires Chromium and ffmpeg. Providers and voice-worker output are deterministic fixtures; tests validate voice routing and completion, not the sound or speed of the real voice model.
- Production build, TypeScript, targeted ESLint and existing radio/geography/media-session/voice regressions.

The journey loads on demand, caps canvas pixel density, reduces render frequency for reduced-motion preferences, and pauses simulation advancement in background tabs. Routes and textures need no paid API. Live radio and current reports remain subject to provider availability.
