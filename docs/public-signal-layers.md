# World signal layers

WaveAtlas now adapts the public-signal globe concept demonstrated by [God's Eye View](https://github.com/ankitkat/gods-eye). This is an independent integration into the existing Canvas/D3 and MapLibre renderers. No source code, models, or bundled datasets were copied from that project. Existing radio stations, streams, imagery and Brief remain intact.

Open the persistent **World signals** control in the upper-right corner. On mobile, use the **World** shortcut alongside Settings in the header. It opens a bottom sheet with a fixed close button and scrollable layer controls. The empty atlas offers a compact upper-right entry before a station is selected. The control is available before selecting a station, as well as in globe and street views. Enable the desired layers; select a station to see their map markers. All layers default off and retain their selections when switching views in the current session. Tap a marker to inspect its report, source, coordinates and observation time. The contacts roster orders up to 30 reports by distance from the listening station. Locate moves the view without selecting a different radio station. Close collapses the panel; switching a layer off removes its markers. The moving ISS position updates periodically, without synthetic interpolation or trails.

| Layer | Provider | Scope | Refresh |
| --- | --- | --- | --- |
| Earthquakes | [USGS](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) | Up to 200 newest magnitude 2.5+ reports from the past week | 5 minutes |
| Natural events | [NASA EONET v3](https://eonet.gsfc.nasa.gov/docs/v3) | Up to 200 curated open events from the past 30 days; latest point geometry for each event | 5 minutes |
| Space station | [Where the ISS at?](https://wheretheiss.at/w/developer) | ISS position calculated by the provider, not direct flight telemetry | 30 seconds |

The backend only requests fixed provider URLs and uses timeouts, bounded normalization and Next's shared fetch cache. Browser requests share an in-flight refresh across mounted views and pause while hidden. Failed sources show an unavailable state and remove their markers; there are no simulated fallbacks. Expired snapshots and ISS positions older than two minutes are hidden. Quake/event dates describe the report, not the time the feed was checked. NASA open status is a curated classification, not confirmation of current on-site conditions. These layers are exploratory context, not emergency alerts.

Aircraft, vessel AIS, arbitrary satellites and public camera integrations are outside this first delivery. They require separate provider selection, coverage verification and, for many sources, credentials or commercial terms. No placeholder controls are presented for those layers. Existing Esri, NASA imagery, climate and destination context are reused rather than replaced.

Validation: `npm run test:public-signals`, `npm run typecheck`, `npm run lint`, `npm run build`, plus the existing renderer and geographic-selection regressions. Manual review: enable each layer, inspect markers, locate contacts, close the panel, switch basemaps and views, confirm station playback stays selected, and confirm unavailable providers remain labeled.

## Verification results

Production build, TypeScript, ESLint, public-signal adapter/API/state regression tests, renderer regressions, playback media-session regressions and background-agent regressions passed. All three upstream providers responded HTTP 200 during endpoint checks. The existing geographic-selection regression fails at line 69 in both this branch and unchanged main (commit `50dc99d`), so it is a pre-existing failure. Browser visual/interaction verification could not run because the available Playwright browser executable could not be downloaded in this environment. Perform the manual review above before deployment.

The panel is rendered outside map/globe clipping and stacking contexts. Its open state is shared across responsive layouts and view transitions, and each portaled entry is explicitly hidden outside its intended breakpoint.

Mobile uses one entry point per screen, with no duplicate floating feature card over the globe. The sheet dims the atlas, respects the bottom safe area, supports backdrop/Escape dismissal, traps keyboard focus and restores it on close. Locate dismisses the sheet before moving the atlas.
