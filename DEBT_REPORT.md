# WaveAtlas Debt Report

## Repo archaeology findings

### Dead components removed
- Removed unused presence/passport/attribution experiments from `components/WaveAtlasApp.tsx`:
  - `AroundMePanel`
  - `SignalPassportPanel`
  - `PresenceCompanion`
  - `RadioDial`
  - `DeveloperAttribution`
  - `AboutWaveAtlasModal`
- Removed their local-only helpers where they were no longer referenced:
  - `LISTENER_HOME`
  - `PASSPORT_KEY`
  - `PassportEntry`
  - `distanceKm`
  - `readPassport`
  - `passportBadges`
  - `useSignalPassport`

### Abandoned EarthDial files
- No standalone `EarthDial` or `Earth Dial` files were found in the repo.
- The old desktop `RadioDial` experiment duplicated the current Signal Dial direction and has been deleted.

### Duplicate station logic
- Station search/selection still exists in three UI paths:
  - local desktop station cards
  - grouped remote search results
  - mobile search results
- Country station loading and deep-link station insertion both mutate `stationPool`; this should remain one source of truth if the product continues to simplify.

### Unused hooks and stores
- No separate hooks directory was found.
- One Zustand store (`usePlayer`) remains and is actively used as the audio source of truth.
- Removed the unused local passport hook.

### Stale or temporary APIs
- API routes are still broad for the current minimal UI surface:
  - `app/api/ai/discover/route.ts`
  - `app/api/agents/station-steward/route.ts`
  - `app/api/stations/trending/route.ts`
  - `app/api/stations/active/route.ts`
  - validation and source-oracle support routes
- These may be useful foundations, but they are not all visible in the simplified primary interface.

### Debug code and hidden z-index hacks
- No `console.*`, `TODO`, or `FIXME` debug statements were found.
- Multiple high `z-*` layers remain in `components/WaveAtlasApp.tsx` for mobile sheets, search, dial preview, splash, and bottom navigation. They work, but the layering model should be consolidated into named layout tiers.

### Unused CSS and visual clutter
- `app/globals.css` should be audited next against the now-deleted panels and the current mobile-first shell.
- The desktop interface still has secondary station cards and search-result panels that can compete with the map when open.

### Duplicate ranking and utility functions
- `getTrendingRank` still lives in the UI component and ranks client-side for the station intelligence panel.
- Server-side station ranking utilities also exist in `lib/station-ranking.ts`; long term, ranking should be server-owned and UI should only render provided ranks.

## Recommended next subtraction pass
1. Move candidate selection and station pool mutation out of `WaveAtlasApp.tsx` into a single source module.
2. Collapse mobile and desktop search result rendering to one result component.
3. Consolidate `z-index` values into named CSS custom properties or Tailwind tokens.
4. Remove or hide desktop station cards by default so Earth, Search, Signal Dial, Mini Player, and Bottom Nav dominate.
5. Audit API routes against current product surface before deleting server code.
