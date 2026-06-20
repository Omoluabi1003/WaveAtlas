# WaveAtlas

WaveAtlas is a global radio discovery application backed by Radio Browser data.


## Source Oracle™ and Station Truth Mesh™

WaveAtlas is designed to avoid single-directory dependency. The Source Oracle aggregates source claims, assigns provider weights, records conflicts, and emits station-level truth scores so canonical station data can be reconciled from consensus instead of copied blindly from one provider.

### Source tiers

- **Tier 1 primary directories**: Radio Browser (`0.8`), TuneIn (`0.9`), MyTuner (`0.85`), Streema (`0.8`), and Radio Garden (`0.75`).
- **Tier 2 authoritative broadcasters**: BBC, NHK, ABC Australia, CBC, Radio France, RFI, DW, SABC, VOA, and Vatican Radio (`1.0`).
- **Tier 3 direct discovery**: Station Steward crawls homepages, playlists, Icecast/Shoutcast, HLS manifests, and feeds (`0.95`).
- **Tier 4 community layer**: user-submitted station facts with dynamic confidence, modeled after OpenStreetMap review flows.

### Truth Mesh scores

Every reconciled station can carry an identity score, geo score, metadata score, stream health score, consensus score, and confidence score. GeoTruth validation must prefer gazetteers, country centroids, and explicit station/city evidence; it must never infer location from stream IP and must never default unknown stations to the United States.

### Database additions

The Station Truth Mesh migration adds `station_sources`, `station_aliases`, `station_redirects`, `station_health`, `station_geo_overrides`, `station_conflicts`, `source_scores`, `coverage_stats`, and `truth_audit` so provider claims, health checks, conflicts, and scoring decisions remain inspectable.

## Station Steward Agent™

The Station Steward Agent is a scheduled backend worker that safely improves station data without changing application code or deploying anything automatically. It discovers candidate stations from Radio Browser, deduplicates them, validates stream URLs, enriches station metadata, calculates health scores, softly retires repeatedly failing streams, and writes audit records for every run.

### Database

Apply `supabase/migrations/20260619000000_station_steward_agent.sql` to create:

- `stations` — canonical station inventory and searchable metadata.
- `station_checks` — append-only stream validation audit log.
- `agent_runs` — one summary row per scheduled agent run.

All destructive behavior is represented with `is_retired` and `is_active` flags; rows are not deleted by the agent.

### Environment variables

Required for write mode:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STATION_STEWARD_SECRET=long-random-cron-secret
```

Optional tuning:

```bash
RADIO_BROWSER_API_BASE=https://de1.api.radio-browser.info/json
STATION_STEWARD_RETIRE_AFTER_FAILURES=5
STATION_STEWARD_VALIDATE_LIMIT=30
```

When Supabase credentials are absent, the agent automatically runs in dry-run mode so local development remains safe.

### Running the agent

The cron-safe endpoint is available at:

```text
GET /api/agents/station-steward
POST /api/agents/station-steward
```

Protect production runs with `STATION_STEWARD_SECRET` and call the endpoint with:

```bash
curl -H "Authorization: Bearer $STATION_STEWARD_SECRET" https://your-domain.com/api/agents/station-steward
```

Use dry-run mode to inspect discovery and validation behavior without database writes:

```bash
curl "http://localhost:3000/api/agents/station-steward?dry_run=true&validate_limit=5"
```

### Suggested Vercel cron

```json
{
  "crons": [
    {
      "path": "/api/agents/station-steward",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

### Safety model

- The agent only updates station data and metadata.
- The agent does not modify frontend code or deploy code.
- Failed stations are retried before retirement.
- Retired stations are hidden or deprioritized with flags, not deleted.
- Every validation and run is logged for admin inspection.
- External scans are bounded and rate-limited by small scan plans and validation limits.
