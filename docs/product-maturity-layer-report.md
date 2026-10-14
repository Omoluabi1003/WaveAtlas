# WaveAtlas Product Maturity Layer

Implementation is under review. Do not merge until the browser recovery checks are completed.

The baseline at origin/main (66b70fa) passed 56 regression suites, lint (one existing AtlasAssistant dependency warning), type checking, and production build. The existing 56 suites still passed after integration; the new product-maturity core regression and social-card regression passed. The latest production build passed. The first browser failover run exposed pre-activation recovery; a guard now prevents recovery until user activation. The follow-up desktop/mobile run remains unverified.

## Implementation map

- WA-01: reliability normalization in lib/maturity/reliability.ts; compact player indicators and expanded destination details.
- WA-02: ranked verified station_sources/station_health endpoints, bounded FailoverCycle, endpoint override in the existing player, exponential backoff, signed low-confidence endpoint telemetry. Station UUID stays unchanged and the existing single Audio/AtlasAudioFocus gate is reused.
- WA-03: versioned device-local recent playback, favorites migration, capped preference signals, clear history and remove favorite controls; optional existing resume preference restores silently after canonical resolution. No coordinates are stored in listening memory.
- WA-04: StationDestination extends existing StationIntelligencePanel with GeoTruth-aware geography, local flag, approximate time, format/language, website, genuine frequency units, permission-gated distance, reliability and report action.
- WA-05: separate geographic journey definitions and recently verified canonical stop resolution; next/previous controls, unavailable-stop skipping and stable /journey/[journeyId] links. Existing Atlas flight journeys remain intact.
- WA-06: deterministic nearby/same-country/similar/pause/continue routing; existing intelligence and station services handle other intents. New instructions cancel stale voice requests and invalidate older station searches.
- WA-07: existing station OG/Twitter cards preserved; publisher-reviewed artwork on allowlisted public image hosts is optional, bounded and redirect-blocked, with existing compass fallback.
- WA-08: explainable country/language/verified-region coverage, quality ratios, recent-attempt penalties, balanced country discovery queue and coverage history snapshots. No population figures are fabricated where existing data is absent.
- WA-09: server validation, salted reporter hashes, atomic daily throttling, discreet reporting and low-confidence aggregation into review conflicts/source evidence; reports cannot modify canonical station records.
- WA-10: /ops server-authenticated dashboard reads canonical inventory, health, retirement/discovery data, runs, endpoint events, conflicts, pending reports, coverage history and provider evidence. Review and aggregate actions remain server-side. Missing backend data is explicitly unavailable.

## Files and routes

Created: lib/maturity/*; components/maturity/*; app/ops/page.tsx and actions.ts; app/api/ops/login/route.ts; app/api/stations/{streams,report,failover}/route.ts; app/api/journeys/[journeyId]/route.ts; app/journey/[journeyId]/page.tsx; tests/product-maturity.regression.ts; tests/product-maturity.browser.mjs.

Modified: WaveAtlasApp, WaveAtlasExperience, AtlasAssistant, station OG renderer, atlas-assistant/intelligence, stations, Station Steward, package manifests.

Reused: canonical fetchStationByUuid, Station Truth Mesh tables, Source Oracle authority conventions, GeoTruth, AtlasAudioFocus, radio-stream-player, media-session/context events, StationIntelligencePanel, existing responsive player and drawer, existing Atlas flight journeys, station sharing and social fonts/flags. Particle code is unchanged.

## Deployment setup and limitations

Apply additive supabase/migrations/20261013000000_product_maturity_layer.sql after the existing schema. New station_reports, station_failover_events and coverage_snapshots tables use RLS and service-role-only RPC grants. station_conflicts gains resolved_at. No production migration has been applied from this workspace.

Existing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for durable reports, evidence and operations data. Set OPS_SECRET to at least 32 cryptographically random characters for server-authenticated operations access. COMMUNITY_REPORT_SALT is recommended; otherwise the service-role key salts hashes. Existing Station Steward authorization/configuration remains required for scheduled write runs. Set these only as server environment variables in Vercel and redeploy. No paid API or consumer account is added.

The workspace has no production Supabase credentials. SQL RPC execution, authenticated production /ops, and live trusted alternate discovery require deployment verification. Login throttling is per instance; use platform rate limiting for additional distributed protection. Browser endpoint outcomes have low confidence and never become canonical truth without independent verification. Endpoint/metadata data can be unavailable or stale; journeys omit unverified stops. Physical Safari/messaging and unavailable microphone behavior require device verification. The browser failover check is not yet confirmed; PR remains draft.

## Security and performance

Service credentials never enter client components. Operations use signed HttpOnly SameSite cookies and constant-time secret comparison. Reports accept enumerated reasons, no free text, and hashed network identity. RPC transactions serialize rate checks. Community evidence is capped at 0.15 and browser endpoint evidence at 0.1. Artwork fetching permits only reviewed HTTPS image hosts, rejects redirects and limits time/bytes. UI extensions use dynamic imports, stable metadata is cached, and backup discovery does not block primary playback. Full backend inventory pagination is limited and reports partial/unavailable scopes honestly.
