# Country-aware station sharing and social cards

New station shares use exactly `Listen to {stationName} on WaveAtlas.`, two newlines, and the canonical station URL. Native sharing sends one text payload rather than separate text and URL values, preventing duplicate links. Clipboard fallback copies the same complete message. All station names remain unchanged in metadata and shared text.

`lib/country-metadata.ts` normalizes station country fields through the ISO country list and exact aliases. It returns one country code, display name and local flag asset; unknown countries receive neutral globe branding. Local flag-icons SVGs cover all 249 ISO countries. No flag or country API is called during rendering.

Next.js 16's native `opengraph-image.tsx` route creates a cached 1200×630 card independently of page rendering and playback. The card reuses Atlas Compass branding, local Noto fonts, a secondary flag, country label, station name, valid location and explicit frequency units. Long names wrap with bounded sizing. Arabic presentation shaping and Unicode bidi ordering are confined to card display; metadata and share messages retain the original strings. Server-only font and shaping dependencies do not enter the station player bundle.

Station metadata includes absolute canonical URLs, station-specific Open Graph/Twitter descriptions and the dynamic image. Metadata is returned in the initial response, including for messaging crawlers. Legacy query links use the same metadata builder. Missing stations retain existing not-found behavior. The embedded-browser proxy leaves social image requests untouched.

Validation:

- 56 regression suites passed, including all-country asset checks, Japanese/Nigerian/Congo/Arabic/long-name/neutral card rendering, Unicode share-message spacing, station resolution and existing Atlas features.
- `npm run typecheck`, `npm run lint`, and `npm run build` passed. Lint retains one existing AtlasAssistant hook warning.
- Desktop and mobile Chromium production checks verify exact station restoration, fresh-page navigation, saved-station precedence, native and clipboard message equality, query links, history, refresh, and silent hydration.
- Direct crawler requests verify metadata in the initial HTML head and successful 1200×630 PNG responses for Tokyo FM, Premier FM, and Radio Mucodec.
- Generated Japanese, Yoruba/French, Congo, Arabic, long-name and neutral cards were visually inspected for typography and overlap.

Reproduce:

```sh
npm run test:station-social
npm run test:station-links
WAVEATLAS_TEST_URL=http://127.0.0.1:3014 npm run test:station-links:browser
```

Native sharing is stubbed in automated browser tests. Platform preview caches and physical Safari/messaging-app behavior still require device verification after deployment.
