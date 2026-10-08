# Desktop layout and Atlas Voice validation

The desktop application uses a grid shell: header, workspace, notifications,
and player. The workspace reserves columns for utilities, an open contextual
drawer, the map/globe, and Atlas. Content columns can shrink with `minmax(0, …)`
and scroll when needed; persistent controls do not cover the workspace.

The ancestor audit found these structural problems:

| Region | Previous constraint | Repair |
| --- | --- | --- |
| Desktop root | `h-screen` with `overflow-hidden`, independent fixed children | Grid rows reserve header/player space; bounded content regions scroll |
| Search/navigation | Viewport offsets and translate-based positioning | Header and utility column participate in layout |
| Drawer | Fixed top/bottom offsets and off-screen collapse transform | Dedicated workspace column; one scroll region includes its header |
| Globe/map | 620px minimum height, regardless of remaining workspace | Fill the measured scene with a zero minimum height |
| Empty-state card | Unsafe vertical centering when the card is taller than its scroll region | Safe alignment starts oversized content at the reachable top |
| Globe captions | Independent absolute offsets, unbounded text | A bounded caption layer wraps and scrolls |
| Player metadata | Fixed bottom overlay and single-line marquee | Flow footer with wrapping desktop metadata; mobile marquees retained |
| Mobile station sheet | Always mounted, “closed” with a 680px translation | Mount only while open; animate relative to its own height |
| Open mobile station sheet | Navigation covers sheet controls; long station text truncates | Sheet occupies the modal layer and its metadata wraps |
| Short/zoomed mobile view | Header, player, notification and navigation overlap | One intentionally scrollable shell reflows those regions |
| Short/zoomed desktop view | Wrapped player leaves an impractically small workspace | The shell scrolls while the workspace keeps a usable minimum height |

Overflow, fixed/min/max heights, viewport units, absolute/fixed positions,
transforms, negative margins, offsets, grid/flex minimum sizes, breakpoints,
z-index, and nested scroll ancestors were inspected. Canvas/decorative layers
still use absolute positioning inside the scene; dialogs intentionally occupy
the modal layer. Existing mobile layout is retained at normal phone heights.

The existing hidden Daily Passport card also computed local time during static
rendering. Its initial clock and daily selection now match server HTML, then
resolve from the browser after hydration, avoiding stale-time mismatches.

Atlas has a permanent labelled **Talk to Atlas** entry, identity, runtime
readiness, contextual examples, and a compact capability sheet. The first-use
invitation retires after actual input, including typed input, and remains retired
across reloads. Previewing capabilities does not start recognition or speech.
Missing recognition, denied microphone access, or unavailable voice output is
reported truthfully while the existing transcript remains available. The voice
model, identity, PCM output, recognition capture, particle renderer, and radio
focus/restore implementation are retained.

## Reproduce browser validation

Use Node 22 as in CI. Install dependencies with `npm ci` and install the full
Chromium browser with `npx playwright install chromium`, or provide an installed
Chromium through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Start a production instance in a separate terminal:

```sh
RADIO_BROWSER_API_BASE=http://127.0.0.1:1/json npm run build
RADIO_BROWSER_API_BASE=http://127.0.0.1:1/json npm run start -- --hostname 127.0.0.1
```

The unreachable Radio Browser override selects the application's supported
catalog fallback for deterministic layout checks. Run:

```sh
npm run test:responsive
# For this cloud image's installed browser:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:responsive
```

`WAVEATLAS_TEST_URL` changes the application origin. The default test covers
all 8 desktop widths × 8 heights × 5 browser zoom factors, in empty and selected
station states, plus drawers/capability previews at the seven critical sizes,
six mobile sizes, and opening/closing station details. Browser zoom is changed
through Chromium's Settings API and verified through `devicePixelRatio`; it is
not CSS scaling or pinch emulation. A quick critical-size run is available with
`WAVEATLAS_GEOMETRY_QUICK=1`.
Set `WAVEATLAS_GEOMETRY_VISUAL=1` to capture all 640 desktop state/size/zoom
screenshots alongside the geometry checks for a complete visual review.

Assertions read actual rectangles, inspect clipping ancestors, check text in
clipped containers, reject content above an unreachable scroll origin, detect
region intersections and document overflow, and
scroll controls into view before hit-testing them against covering layers.
Closed disclosure content is excluded with browser visibility checks; declared
mobile text marquees are intentional. The test also verifies microphone
activation boundaries, denied-permission text recovery, persistent discovery,
and absence of console errors/hydration failures, including client clock drift
relative to static server HTML.

`test-results/responsive/results.json` and PNGs belong to the current run and
are ignored by Git. Inspect the critical-size and mobile screenshots alongside
the assertions. External feeds, media, recognition events, and voice-worker
readiness use fixtures; this test does not certify live radio hosts, physical
microphones, or model inference. Existing voice, PCM, lifecycle, audio-focus,
map/globe, station, and other regression suites cover those implementation paths.

The Geo Selection regression now explicitly rejects a synthetic US station at
zero coordinates after GeoTruth corrects it to the distant US centroid, then
uses a valid Accra station to test nearby fallback. Its source assertions also
follow the existing WAAPI/RAF marquee implementation. Production geography and
marquee motion were not changed.

Validation recorded on 2026-10-08: production build, TypeScript, lint, and all
28 existing regression suites passed. The full browser run passed 713 geometry
cases with no console errors or hydration failures. A further 143 critical-size
and panel cases passed with strict document-width containment, and a separate
640-case sweep confirmed `scrollWidth <= clientWidth` without pixel tolerance.
All 640 desktop state/size/zoom screenshots were visually reviewed, along with
mobile, capability-sheet, listening, and open station-detail views. Lint retains
one existing effect-dependency warning in `AtlasAssistant`; it reports no errors.
