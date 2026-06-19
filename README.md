# WaveAtlas

WaveAtlas is a global radio discovery application backed by Radio Browser data.

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
