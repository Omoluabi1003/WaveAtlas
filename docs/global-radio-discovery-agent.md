# WaveAtlas background agents

Two bounded background workers use the existing station catalogs. They require no AI provider, database, paid API key, or visitor access token. They run outside listener requests and never delete, retire, or disable existing stations.

## Station Discovery Agent

`scripts/discover-radio-stations.ts` orders countries by coverage and rotates the daily scan across that inventory in the public Radio Browser directory. It deduplicates against seed, campus, fallback, and previously discovered stations and source UUID provenance. It also checks the resolved stream URL for duplicates; matching names in different countries remain eligible. URL path and query case are preserved. Accepted stations are appended to the complete existing generated catalog. Missing or malformed provenance stops the run rather than silently replacing it.

A GET probe must return sampled MPEG/AAC/Ogg/FLAC/WAV audio evidence. HTTP 401/403, HTML, empty responses, and unverified playlists do not qualify as working streams. A short sample is evidence of availability at that time, not a guarantee of uninterrupted playback, browser codec support, or CORS availability. Existing playlist stations are preserved. New playlist support needs a separate reviewed resolver.

DNS addresses are checked and pinned to each connection; private/local addresses, embedded credentials, unsupported schemes, and unsafe redirects are blocked. Each probe samples at most 4096 bytes, cancels its response, follows at most four redirects, and has an eight-second deadline including DNS and body sampling. Daily runs inspect at most 80 candidate streams and append at most 40 verified additions.

```bash
npm run radio:discover:dry
RADIO_DISCOVERY_DRY_RUN=false RADIO_DISCOVERY_MAX_ADD=10 npm run radio:discover
```

## Stream Health Agent

`npm run radio:health` checks a rotating batch of up to 120 unique stream URLs with six workers. The committed snapshot records timestamp, exact URL, actual sampled evidence, response time, and consecutive failures. The cursor advances when the proposed snapshot is merged. Unmerged reports remain available as workflow artifacts.

```bash
STATION_HEALTH_DRY_RUN=true STATION_HEALTH_LIMIT=10 npm run radio:health
npm run test:agents
```

Fresh healthy evidence provides a small ranking boost. A single failed check has no ranking penalty. Two or more recent failures provide a bounded penalty only; evidence fades and expires after 48 hours, and a changed stream URL ignores the old record. These adjustments affect normal station ranking, trust ranking, and the Atlas reliability index. They never change active flags or remove catalog entries. Browser playback history continues to operate independently. GeoAudio tracks are excluded from these radio probes.

## Schedule, review, and deployment

`.github/workflows/global-radio-discovery-agent.yml` checks health every eight hours and discovers stations daily at 04:17 UTC. Manual runs can choose either worker or both; manual dry-run is enabled by default. GitHub schedules can be delayed, and Actions must be enabled. The repository's existing Actions permission to create pull requests must be enabled for review proposals; reports still upload if proposal creation fails. The built-in workflow token is used, with write permissions limited to the scheduled worker jobs.

Each worker validates tests, TypeScript, and a production build before opening a scoped review PR. Health evidence and station additions enter the live app only after their review PR is merged and the hosting deployment succeeds. Workers do not automatically merge or publish additions. The generated health snapshot starts empty: no activity, successful checks, or uptime figures are invented. `/api/agents/status` exposes measured health freshness and verified-addition counts, without starting scans.

## Configuration

| Variable | Default | Purpose |
| --- | ---: | --- |
| `RADIO_DISCOVERY_DRY_RUN` | `true` | Disable explicitly to append verified additions. |
| `RADIO_DISCOVERY_MAX_ADD` | `50` | Maximum additions, capped at 50. |
| `RADIO_DISCOVERY_MAX_PROBES` | `80` | Stream probes per run, capped at 150. |
| `RADIO_DISCOVERY_MIN_BITRATE` | `64` | Minimum candidate bitrate. |
| `RADIO_DISCOVERY_REQUIRE_GEO` | `false` | Require actual coordinates when enabled. |
| `RADIO_DISCOVERY_COUNTRIES_PER_RUN` | `12` | Undercovered countries per run. |
| `RADIO_DISCOVERY_PAGES` | `1` | Directory pages per country. |
| `RADIO_DISCOVERY_PAGE_SIZE` | `100` | Candidates per page, capped at 500. |
| `STATION_HEALTH_LIMIT` | `120` | Unique streams per batch, capped at 250. |
| `STATION_HEALTH_DRY_RUN` | `false` | Reports only when true. |

The legacy Supabase Station Steward remains separate and is neither invoked nor given new privileges by these workers.
