# WaveAtlas background agents

Nine bounded background roles use the existing station catalogs: two stream workers and seven operational roles. They require no AI provider, database, paid API key, or visitor access token. They run outside listener requests and never delete, retire, or disable existing stations.

## Station Discovery Agent

`scripts/discover-radio-stations.ts` orders countries by coverage and rotates the eight-hour scan across that inventory in the public Radio Browser directory. It deduplicates against seed, campus, fallback, and previously discovered stations and source UUID provenance. It also checks the resolved stream URL for duplicates; matching names in different countries remain eligible. URL path and query case are preserved. Accepted stations are appended to the complete existing generated catalog. Missing or malformed provenance stops the run rather than silently replacing it.

A GET probe must return sampled MPEG/AAC/Ogg/FLAC/WAV audio evidence. HTTP 401/403, HTML, empty responses, and unverified playlists do not qualify as working streams. A short sample is evidence of availability at that time, not a guarantee of uninterrupted playback, browser codec support, or CORS availability. Existing playlist stations are preserved. New playlist support needs a separate reviewed resolver.

DNS addresses are checked and pinned to each connection; private/local addresses, embedded credentials, unsupported schemes, and unsafe redirects are blocked. Each probe samples at most 4096 bytes, cancels its response, follows at most four redirects, and has an eight-second deadline including DNS and body sampling. Scheduled runs inspect at most 150 candidate streams across 24 countries and append at most 50 verified additions. Low or unknown directory bitrates are eligible; actual sampled audio is still required.

```bash
npm run radio:discover:dry
RADIO_DISCOVERY_DRY_RUN=false RADIO_DISCOVERY_MAX_ADD=10 npm run radio:discover
```

## Stream Health Agent

`npm run radio:health` checks a rotating batch of up to 120 unique stream URLs with six workers. The committed snapshot records timestamp, exact URL, actual sampled evidence, response time, and consecutive failures. The cursor advances when the proposed snapshot is merged. Unmerged reports remain available on the Queen review branch.

```bash
STATION_HEALTH_DRY_RUN=true STATION_HEALTH_LIMIT=10 npm run radio:health
npm run test:agents
```

Fresh healthy evidence provides a small ranking boost. A single failed check has no ranking penalty. Two or more recent failures provide a bounded penalty only; evidence fades and expires after 48 hours, and a changed stream URL ignores the old record. These adjustments affect normal station ranking, trust ranking, and the Atlas reliability index. They never change active flags or remove catalog entries. Browser playback history continues to operate independently. GeoAudio tracks are excluded from these radio probes.

## Schedule, review, and deployment

`.github/workflows/global-radio-discovery-agent.yml` checks health every eight hours and discovers stations every eight hours at minute 17 UTC. Seven operational roles run every eight hours at minute 29. Manual runs can choose all roles, either stream worker, or the operational group; manual dry-run is enabled by default. GitHub schedules can be delayed, and Actions must be enabled. The Queen coordinator publishes validated output to `chore/waveatlas-queen-reports` with a compare link in the job summary. This works when repository settings disallow Actions from creating pull requests. Execution memory is stored separately on `chore/waveatlas-queen-memory`, including failed worker outcomes. No new artifact uploads are required. The built-in workflow token is used, with write permissions limited to the scheduled worker jobs.

Stream workers validate tests, TypeScript, and a production build before publishing a scoped review branch. The Queen validates agent tests, TypeScript, and a production build before publishing the combined report review branch. Health evidence and station additions enter the live app only after their review PR is merged and the hosting deployment succeeds. Workers do not automatically merge or publish additions. The generated health snapshot starts empty: no activity, successful checks, or uptime figures are invented. `/api/agents/status` exposes measured health freshness and verified-addition counts, without starting scans.

## Configuration

| Variable | Default | Purpose |
| --- | ---: | --- |
| `RADIO_DISCOVERY_DRY_RUN` | `true` | Disable explicitly to append verified additions. |
| `RADIO_DISCOVERY_MAX_ADD` | `50` | Maximum additions, capped at 50. |
| `RADIO_DISCOVERY_MAX_PROBES` | `80` | Stream probes per run, capped at 150. |
| `RADIO_DISCOVERY_MIN_BITRATE` | `0` | Minimum candidate bitrate. |
| `RADIO_DISCOVERY_REQUIRE_GEO` | `false` | Require actual coordinates when enabled. |
| `RADIO_DISCOVERY_COUNTRIES_PER_RUN` | `12` | Countries per run in coverage-ordered rotation (24 in the workflow). |
| `RADIO_DISCOVERY_PAGES` | `1` | Directory pages per country. |
| `RADIO_DISCOVERY_PAGE_SIZE` | `100` | Candidates per page, capped at 500. |
| `STATION_HEALTH_LIMIT` | `120` | Unique streams per batch, capped at 250. |
| `STATION_HEALTH_DRY_RUN` | `false` | Reports only when true. |

The legacy Supabase Station Steward remains separate and is neither invoked nor given new privileges by these workers.

## Seven operational roles

These are deterministic, evidence-based workers adapted from the ETL GIS AgentOS roles. They do not call a language model, invent market research, or claim to produce income. All run sequentially in one scheduled job, with independent failure handling and an executive summary. They do not modify the station catalog.

| Role | WaveAtlas task |
| --- | --- |
| Geography Quality | Inspect resolved precision and geography warnings without changing coordinates. |
| Catalog Analytics | Count bundled country coverage and fresh, stale, or missing audio evidence. |
| Project Intelligence | Produce a prioritized backlog with remaining issue counts. |
| Partnership Opportunities | Prepare broadcaster partnership drafts for bundled catalog gaps. No unverified contacts or outreach. |
| Growth Intelligence | Draft station spotlights only for streams with fresh audio evidence. |
| Operations Quality | Flag repeated stream references, invalid metadata, and missing schedule configuration. |
| Executive Intelligence | Aggregate completed roles, failures, and next decisions. |

`npm run agents:operate` writes JSON and Markdown reports and a compact status snapshot. `OPERATIONAL_AGENTS_DRY_RUN=true` writes reports only. Operational reports are included in the Queen review branch after validation. Updated public status is deployed after the report PR is merged; it represents the last released report, not a live process heartbeat. Reports older than 24 hours show as stale. A failed role does not prevent the other roles from finishing, but causes the job to fail after reports are saved.

The deployment commit tagged `[agents-bootstrap]` starts all worker jobs once on push to main. Normal pushes run verification only. Thereafter schedules operate without this chat or an open browser. GitHub-hosted job history and the shared memory branch are the current execution record; `/api/agents/status` shows deployed snapshots.

Coverage analysis describes the bundled catalog, not all stations available through live directory search. Audience, revenue, payment, and external lead data are unavailable. Growth and opportunity results remain drafts for human review. The News Agent and Signal Review remain request-driven; the legacy database Station Steward remains separate because it can retire records and requires Supabase configuration. The seven operational roles plus health and discovery cover the deployment requested here without enabling those database writes.


## Free-only Queen coordination

`npm run agents:queen` implements Ruflo-inspired hierarchy and shared memory using the existing workers. It does not install Ruflo, run an LLM, add a database, or claim autonomous reasoning. All nine roles are retained. Selection `both` runs only the two stream workers. Workers execute sequentially, each with a 20-minute timeout; a failed worker is recorded while the remaining selected workers continue. Failed runs cannot publish catalog updates.

The shared memory branch stores at most 90 worker outcomes and 1,000 failed-endpoint cooldowns. Discovery consults this memory before probing and retries failed URLs after 24 hours. Successful endpoints and station additions are still checked against the existing catalog and must pass audio validation. Unmerged candidate additions are not treated as deployed stations. Memory persistence is automatic; catalog, health, and operational status updates require review and merge. Manual dry-runs persist execution outcomes and cooldowns but do not publish catalog changes.

Standard GitHub-hosted runners are free for this public repository. The new coordinator adds no model-provider calls or artifact uploads. If the repository becomes private or the runner is changed, hosting costs must be reassessed. External directory availability and GitHub schedule delays still apply. There is no paid-model fallback: complex work remains a human review task. Reference architecture: https://github.com/ruvnet/ruflo (MIT license). This implementation uses original WaveAtlas code and does not copy the Ruflo runtime.
