# Global Radio Discovery Agent

WaveAtlas includes a safe, dry-run-first station discovery pipeline at `scripts/discover-radio-stations.ts`. It audits the existing `Station` schema in `lib/stations.ts`, fetches candidates from Radio Browser, validates streams with `HEAD` and fallback ranged `GET`, deduplicates against curated/runtime stations, and writes review reports.

## Run locally

```bash
npm run radio:discover:dry
```

Dry run is the default. It writes:

- `reports/radio-discovery-report.json`
- `reports/radio-discovery-report.md`

Sample output:

```text
WaveAtlas radio discovery: added=3 skipped=41 duplicate=12 failed=2 suspicious=0 dryRun=true
```

To persist accepted stations, explicitly disable dry-run and keep the batch small:

```bash
RADIO_DISCOVERY_DRY_RUN=false RADIO_DISCOVERY_MAX_ADD=10 npm run radio:discover
```

Accepted stations are written to `lib/stations/discoveredRadioStations.ts` using the existing WaveAtlas `Station` shape. Provenance that is not part of the runtime station schema is written to the non-breaking companion file `lib/stations/discoveredRadioMetadata.json`.

## Configuration

| Variable | Default | Purpose |
| --- | ---: | --- |
| `RADIO_DISCOVERY_DRY_RUN` | `true` | Set to `false` to write accepted stations. |
| `RADIO_DISCOVERY_MAX_ADD` | `50` | Max stations to add in one run; capped at 50. |
| `RADIO_DISCOVERY_MIN_BITRATE` | `128` | Minimum candidate bitrate. |
| `RADIO_DISCOVERY_REQUIRE_GEO` | `true` | Requires coordinates for automatic add. |
| `RADIO_DISCOVERY_PAGES` | `2` | Radio Browser pages to fetch. |
| `RADIO_DISCOVERY_PAGE_SIZE` | `100` | Candidates per page, max 500. |
| `RADIO_DISCOVERY_RATE_LIMIT_MS` | `1100` | Delay between Radio Browser requests. |
| `RADIO_DISCOVERY_USER_AGENT` | WaveAtlas default | Descriptive User-Agent for directory and stream checks. |

## CI behavior

`.github/workflows/global-radio-discovery-agent.yml` runs weekly and manually. It runs a dry-run first, then a capped write run, validates TypeScript/tests, and uses `peter-evans/create-pull-request` to open a review PR instead of pushing to `main`.
