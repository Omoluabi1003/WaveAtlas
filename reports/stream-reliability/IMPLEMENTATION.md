# Stream reliability and catalog audit follow-up

## Outcome

Preserves all 61 canonical bundled radio stations. Adds bounded HLS master/media, M3U and PLS probing. Playlist text alone is never audio evidence. HLS stable URLs remain canonical; expiring segments are sampled only. CMAF requires an audio-track initialization map and media fragment; MPEG-TS evidence must come from an audio PES payload. Encrypted and byte-range HLS remain unknown.

Timeouts, access restrictions and unsupported formats are inconclusive rather than failed-station evidence. Only endpoint 404/410 responses increment unavailable counters. Inconclusive discovery probes do not enter failed-endpoint cooldowns. Unknown health has no ranking penalty and is exposed honestly in reliability/status summaries.

Health audit and discovery duplicate checks now include Republic Congo. Discovery preserves inventory, deduplicates canonical records and requires HTTPS supplied/resolved endpoints for new additions. Existing HTTP-only stations are retained for official-source repair.

## Catalog findings

- 61 canonical radio stations and 61 unique endpoints.
- 5 HTTP-only endpoints require authoritative HTTPS review.
- 31 stations lack broadcaster homepages; these need source review before URL repairs.
- No fresh committed health records; all 61 are unknown in this static audit.
- No station URL has been guessed or replaced. No new stations have been published without live evidence.

Live broadcaster probing is blocked by this workspace's restricted direct-network policy. The live audit command detected this limitation, checked zero endpoints, and preserved the existing snapshot and rotation cursor. This is not evidence that stations are offline.

## Operations

Pull requests run a read-only full-catalog health audit and bounded discovery sample on GitHub-hosted runners. Results are in Actions job logs and summary. No inventory or health changes are committed by that audit job. Existing Queen review publication now includes catalog audits; merge reviewed worker output to deploy verified discoveries.

Manual workflow: choose stream-health/all, enable full_audit. Keep dry_run enabled for review, or disable it to publish proposed changes to the existing Queen review branch. Browser playback and official-source review are required before promoting replacements; sampled server audio cannot prove every browser's decoding, geography or CORS compatibility.

## Files

Created: lib/agents/station-audit.ts; tests/stream-probe.regression.ts; reports/station-catalog-audit.json and .md; reports/stream-reliability/IMPLEMENTATION.md and verification logs.

Modified: lib/agents/stream-probe.ts; lib/agents/station-health-policy.ts; lib/agents/operational-agents.ts; lib/stream-reliability.ts; app/api/agents/status/route.ts; scripts/check-station-health.ts; scripts/discover-radio-stations.ts; .github/workflows/global-radio-discovery-agent.yml; docs/global-radio-discovery-agent.md. Generated station-health reports were refreshed.

Reused: canonical runtime inventory, existing Queen/discovery publication, health snapshot, reliability normalization, operations worker and agent-status route. No player, voice, route, design or station-inventory rewrite.

## Validation

- 58 regression files passed; focused HLS tests rerun after final probe changes.
- TypeScript passed.
- Lint passed: zero errors, one pre-existing AtlasAssistant hook-dependency warning.
- Production build passed using Next.js webpack mode.
- Full-catalog command detected restricted runner and preserved the health snapshot/cursor.
- Fixtures cover master/media playlists, PLS alternatives, shared initialization caching, CMAF audio versus video, transport-stream audio versus video, latest segment sampling, stable playlist identities, missing segments, private child URLs, redirect/playlist loops, byte bounds and DNS/response deadlines.

No database migrations, new dependencies, mandatory accounts, paid APIs, production environment variables, Supabase steps or Vercel configuration changes. Optional STATION_HEALTH_FULL_AUDIT and STATION_HEALTH_STATIC_ONLY are documented. Sensitive actions remain in scheduled server-side jobs. Every redirect/manifest/map/segment uses public-address validation and pinned DNS; limits are 12 requests, four redirects per resource, four nested playlist levels, 64 KiB per resource and one eight-second deadline.
