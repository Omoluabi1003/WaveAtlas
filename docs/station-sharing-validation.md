# Station sharing validation

Station links use the canonical station UUID (or the existing durable catalog ID), never a station name or stream URL. New shares use `https://wave-atlas.vercel.app/station/{id}`; existing `?station={id}` links remain supported, including station-aware metadata. Opening a shared station selects it without starting audio.

History inspection found the original query sharing implementation in `ac5ce8f` and the path route implementation in `2d98202`. The remaining gaps were redirect resolution, strict UUID equality checks that rejected redirected records, restricted query ID validation, automatic playback activation, and identity loss when opening the full atlas from the compatibility player.

Resolution reads Station Truth Mesh redirects before the canonical database record, follows exact unambiguous aliases, and rejects cycles or ambiguous aliases. Database metadata and streams take priority over seed snapshots. Exact seeds and Radio Browser UUID lookup remain available when the database is absent. No catalog writes or agent behavior changes are introduced.

Verification completed:

- 55 TypeScript regression suites passed using `node --import tsx`.
- `npm run lint` passed with one existing warning in `components/AtlasAssistant.tsx` (missing effect dependencies).
- `npm run typecheck` passed.
- `npm run build` passed.
- Desktop (1366×900) and mobile (390×844) Chromium checks against the production build passed: two real catalog stations, canonical share URLs, native share and clipboard equality, saved-station precedence, silent hydration, station preview metadata, query links, history restoration, and missing-station messaging.
- Resolver regression fixtures cover redirects, cycles, exact aliases, ambiguous aliases, updated names/streams, unavailable identities, duplicate names and Unicode names.

Run the browser checks against a running server:

```sh
WAVEATLAS_TEST_URL=http://127.0.0.1:3013 npm run test:station-links:browser
```

The browser test stubs native sharing, clipboard, external images and unrelated world-context requests; it uses real application pages and real catalog records. This does not replace manual device testing in Safari or third-party embedded messaging browsers. Supabase redirects were verified with schema-shaped fixtures; production credentials were unavailable in this workspace.
