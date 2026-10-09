# Atlas Journey

Atlas Journey is a free virtual flight through WaveAtlas geography. Open **Atlas Journey** under the desktop brand, or **Journey** beside mobile search. The first featured route is Lagos to Dubai. Country-centre endpoints are explicitly marked as approximate; searching can also retrieve station city locations through the existing station search API.

The aircraft follows a great-circle route on a projected globe rendered entirely in the browser from the existing Natural Earth country dataset. Route, aerial and following camera views are available. Begin, pause, resume, reset, seek and 1×/2×/4× pace controls affect the simulation. The default virtual journey lasts four minutes. Distances describe the great-circle route; the arrival countdown is simulation time, not an airline estimate. No live flight data or airport operational data is implied.

Located, active radio stations within 800 km are offered alongside the journey. Country-centroid station fallbacks are excluded from nearby recommendations because they do not establish a station's physical position. A bounded country lookup uses the existing station API when the simulated aircraft crosses a mapped country; 60 results per lookup, a 15-country session cache, and abort signals prevent unbounded requests and stale responses. Listening is a deliberate user action through the existing player. Opening a station's destination Brief pauses the journey and returns to the same route when closed.

Save stores up to six validated routes on the device. Share creates a root URL with validated departure and destination data. Shared journeys open as previews and require a user action to start. Malformed, oversized, invalid-coordinate or effectively identical endpoint links are ignored. Device storage and clipboard failures have usable fallback messages and a copyable link.

The journey bundle loads only when opened. The animation cleans up its frame callbacks and observers on close, caps canvas pixel density at 2×, updates React progress four times per second, reduces canvas drawing frequency for reduced-motion preferences, and freezes simulation advancement while the page is hidden. Flight geometry does not need a network connection after loading. Radio, station discovery and current Brief reports still need connectivity and remain subject to existing provider availability and hosting limits.

Validation:

- `npm run test:journey` checks route distance/progress, date-line and antipodal handling, geography, link validation and nearby-station eligibility.
- `npm run test:journey:browser` exercises the actual application through Playwright. Set `WAVEATLAS_TEST_URL` for a running server, or `WAVEATLAS_JOURNEY_START_SERVER=1` to start a development server. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing browser installation. External providers are deterministic fixtures, while the actual UI, canvas, existing player and Brief render.
