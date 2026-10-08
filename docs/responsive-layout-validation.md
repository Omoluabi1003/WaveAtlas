# Desktop layout and Atlas Voice validation

The globe remains the primary view and keeps its existing rotation and navigation.
The desktop shell reserves rows for the header, workspace, transient notifications, and player. The workspace has only the utility rail, the globe/map, and
an optional contextual drawer. Atlas Voice is a 40px circular player control immediately before volume, with
no persistent sidebar or standalone row. Content
can shrink with `minmax(0, …)` and scroll when needed without horizontal clipping.

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
the modal layer. The existing mobile overlay layout is retained above 650 CSS pixels of height;
shorter screens use reachable scroll rows.

The existing hidden Daily Passport card also computed local time during static
rendering. Its initial clock and daily selection now match server HTML, then
resolve from the browser after hydration, avoiding stale-time mismatches.

Atlas has a compact, permanent **Talk to Atlas** entry with runtime readiness and
an **Atlas help** action. The introduction and contextual examples are inside the
on-demand capability sheet, so they do not cover the globe on mobile. The first-use
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

Earlier sidebar implementation validation, recorded on 2026-10-08: production build, TypeScript, lint, and all
28 existing regression suites passed. The full browser run passed 713 geometry
cases with no console errors or hydration failures. A further 143 critical-size
and panel cases passed with strict document-width containment, and a separate
640-case sweep confirmed `scrollWidth <= clientWidth` without pixel tolerance.
All 640 desktop state/size/zoom screenshots were visually reviewed, along with
mobile, capability-sheet, listening, and open station-detail views. Lint retains
one existing effect-dependency warning in `AtlasAssistant`; it reports no errors.

## Globe-first correction

The earlier sidebar implementation passed overflow checks but reduced the globe's
available width and covered too much of the mobile globe. It has been removed.
Voice controls now share a compact desktop footer row with notifications and use
a compact mobile header entry. Help content appears only when explicitly opened.

The earth now fits the usable canvas rectangle at all automatic station-focus
zoom levels. Mobile measurements use visible controls within the current shell;
voice readiness is no longer mistaken for a station notification covering the
bottom of the canvas. Controls in separate short-screen scroll rows do not subtract
space from the globe. The short-screen layout applies up to 650 CSS pixels of
height so small portrait phones also retain a useful globe size. Rotation, navigation, station selection, deliberate user
zoom, voice inference, PCM output and radio audio focus remain unchanged.

The browser regression additionally requires the closed-drawer desktop scene to
keep at least 80% of workspace width, a usable scene height, and a compact voice
entry. Renderer checks ensure the complete earth fits phone, landscape and desktop
bounds at automatic focus zooms, while deliberate user zoom remains available.

Correction validation on 2026-10-08: the full matrix passed 713 cases; a further
143 critical cases passed after tightening desktop spacing and extending short
phone scrolling. The final compact mobile voice row passed another 29 cases,
including all six phone sizes, drawers, help, station details, microphone
activation boundaries and hydration. All runs had zero failures and no console
or hydration errors. Representative desktop, zoomed and phone screenshots were
visually reviewed. The full matrix captures are archived under the ignored
`test-results/globe-matrix/`; critical captures under `test-results/globe-critical/`;
the final checks are under `test-results/responsive/`.

The final production build and TypeScript passed. Lint passed with the existing
AtlasAssistant effect dependency warning. Renderer fitting, map basemaps, Atlas
particles, radio audio focus and PCM playback regression checks passed.

## Circular Atlas control and dominant globe

Atlas now sits beside volume and share in the player. It matches their circular
40px shape, uses a quiet accent while idle, and glows while listening, understanding
or speaking. Hover or keyboard focus reveals its label, readiness and help; activation
uses the existing assistant. There is no permanent Atlas strip or mobile header card.

At automatic focus zooms from 1 to 1.2, the globe diameter is 96% of the shorter
usable scene dimension. This makes it occupy almost all available height on wide
screens and almost all available width on phones, with 2% clearance at each edge.
The removed Atlas row also returns its entire height to the scene. Globe rotation,
station navigation, deliberate zoom in/out, voice inference and radio focus remain
unchanged. Renderer regressions explicitly verify the dominant default size and
continued zoom in/out, alongside full-earth containment.

Accepted circular-control layout validation on 2026-10-08: production build and
TypeScript passed; lint passed with the existing AtlasAssistant dependency warning.
All 143 critical desktop/zoom, drawer, help and mobile geometry cases passed with
zero console or hydration errors. Visual review confirmed the globe's full edges
and the Atlas button's placement alongside player controls. Renderer fitting and
zoom, Atlas particles, audio focus and PCM regression checks passed. Atlas help
and activation stop click propagation so they do not also open mobile station details.
Corner captions stay within 20% of scene width to leave the globe rim visible.
