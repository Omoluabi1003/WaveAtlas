create extension if not exists pg_trgm;

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  station_uuid text unique not null,
  name text not null,
  url text not null,
  url_resolved text,
  homepage text,
  favicon text,
  country text,
  country_code text,
  city text,
  state text,
  language text,
  genres text[] not null default '{}',
  tags text[] not null default '{}',
  codec text,
  bitrate integer not null default 0,
  latitude double precision,
  longitude double precision,
  source text not null default 'radio_browser',
  votes integer not null default 0,
  click_count integer not null default 0,
  health_score integer not null default 0 check (health_score between 0 and 100),
  last_check_ok boolean not null default false,
  last_checked_at timestamptz,
  failure_count integer not null default 0,
  success_count integer not null default 0,
  response_time_ms integer,
  is_active boolean not null default true,
  is_retired boolean not null default false,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(country, '') || ' ' || coalesce(country_code, '') || ' ' || coalesce(city, '') || ' ' || coalesce(state, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(language, '') || ' ' || array_to_string(tags, ' ') || ' ' || array_to_string(genres, ' ')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.station_checks (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  status text not null check (status in ('ok', 'failed', 'retired', 'skipped')),
  response_time_ms integer,
  error_message text,
  checked_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz,
  stations_discovered integer not null default 0,
  stations_updated integer not null default 0,
  stations_retired integer not null default 0,
  errors text[] not null default '{}',
  status text not null check (status in ('completed', 'dry_run', 'failed')),
  dry_run boolean not null default false
);

create index if not exists stations_active_rank_idx on public.stations (is_active, is_retired, health_score desc, votes desc, click_count desc);
create index if not exists stations_country_idx on public.stations (country_code, country);
create index if not exists stations_tags_gin_idx on public.stations using gin (tags);
create index if not exists stations_genres_gin_idx on public.stations using gin (genres);
create index if not exists stations_search_idx on public.stations using gin (search_vector);
create index if not exists station_checks_station_checked_idx on public.station_checks (station_id, checked_at desc);
create index if not exists agent_runs_started_idx on public.agent_runs (started_at desc);

alter table public.stations add column if not exists normalized_name text;

create table if not exists public.station_aliases (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  alias text not null,
  source text not null default 'station_steward',
  confidence numeric not null default 0.85 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  unique (station_id, alias)
);

create table if not exists public.station_redirects (
  old_station_uuid text primary key,
  new_station_uuid text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.station_identity_audit (
  id uuid primary key default gen_random_uuid(),
  station_uuid text not null,
  old_name text,
  new_name text,
  old_url text,
  new_url text,
  change_reason text not null,
  checked_at timestamptz not null default now()
);

create index if not exists stations_uuid_lookup_idx on public.stations (station_uuid);
create index if not exists station_aliases_alias_idx on public.station_aliases using gin (alias gin_trgm_ops);
create index if not exists station_redirects_new_uuid_idx on public.station_redirects (new_station_uuid);
create index if not exists station_identity_audit_uuid_checked_idx on public.station_identity_audit (station_uuid, checked_at desc);

alter table public.stations add column if not exists geo_confidence_score integer not null default 0 check (geo_confidence_score between 0 and 100);

create table if not exists public.station_geo_overrides (
  station_uuid text primary key,
  lat double precision,
  lng double precision,
  precision text not null check (precision in ('station', 'city', 'country', 'unknown')),
  source text not null check (source in ('manual_override', 'city_gazetteer', 'verified_api_geo', 'country_centroid', 'unknown')),
  confidence integer not null default 0 check (confidence between 0 and 100),
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.station_geo_audit (
  id uuid primary key default gen_random_uuid(),
  station_uuid text not null,
  reported_country_code text,
  reported_lat double precision,
  reported_lng double precision,
  resolved_lat double precision,
  resolved_lng double precision,
  resolution_source text not null,
  confidence integer not null default 0 check (confidence between 0 and 100),
  warning text,
  audited_at timestamptz not null default now()
);

create index if not exists station_geo_audit_uuid_audited_idx on public.station_geo_audit (station_uuid, audited_at desc);
create index if not exists station_geo_audit_confidence_idx on public.station_geo_audit (confidence, resolution_source);
alter table public.agent_runs add column if not exists geo_conflicts_flagged integer not null default 0;

alter table public.stations add column if not exists consensus_score integer not null default 0 check (consensus_score between 0 and 100);
alter table public.stations add column if not exists confidence_score integer not null default 0 check (confidence_score between 0 and 100);
alter table public.stations add column if not exists source_count integer not null default 1;

create table if not exists public.station_sources (
  id uuid primary key default gen_random_uuid(),
  station_uuid text not null,
  source text not null,
  source_tier integer not null check (source_tier between 1 and 4),
  source_weight numeric not null check (source_weight >= 0 and source_weight <= 1),
  external_id text,
  url text,
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (station_uuid, source)
);

create table if not exists public.station_health (
  id uuid primary key default gen_random_uuid(),
  station_uuid text not null,
  stream_url text not null,
  status text not null check (status in ('ok', 'failed', 'redirected', 'timeout', 'unsupported')),
  response_time_ms integer,
  content_type text,
  checked_at timestamptz not null default now()
);

create table if not exists public.station_conflicts (
  id uuid primary key default gen_random_uuid(),
  station_uuid text not null,
  field text not null,
  winning_value text,
  rejected_values text[] not null default '{}',
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  detected_at timestamptz not null default now()
);

create table if not exists public.source_scores (
  id uuid primary key default gen_random_uuid(),
  station_uuid text not null,
  source text not null,
  identity_score integer not null default 0 check (identity_score between 0 and 100),
  geo_score integer not null default 0 check (geo_score between 0 and 100),
  metadata_score integer not null default 0 check (metadata_score between 0 and 100),
  stream_health_score integer not null default 0 check (stream_health_score between 0 and 100),
  consensus_score integer not null default 0 check (consensus_score between 0 and 100),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  scored_at timestamptz not null default now(),
  unique (station_uuid, source)
);

create table if not exists public.coverage_stats (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  region text not null,
  countries_scanned integer not null default 0,
  stations_found integer not null default 0,
  empty_country_codes text[] not null default '{}',
  measured_at timestamptz not null default now()
);

create table if not exists public.truth_audit (
  id uuid primary key default gen_random_uuid(),
  station_uuid text not null,
  source_count integer not null default 1,
  identity_score integer not null default 0 check (identity_score between 0 and 100),
  geo_score integer not null default 0 check (geo_score between 0 and 100),
  metadata_score integer not null default 0 check (metadata_score between 0 and 100),
  stream_health_score integer not null default 0 check (stream_health_score between 0 and 100),
  consensus_score integer not null default 0 check (consensus_score between 0 and 100),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  audited_at timestamptz not null default now()
);

create index if not exists station_sources_uuid_source_idx on public.station_sources (station_uuid, source);
create index if not exists station_health_uuid_checked_idx on public.station_health (station_uuid, checked_at desc);
create index if not exists station_conflicts_uuid_detected_idx on public.station_conflicts (station_uuid, detected_at desc);
create index if not exists source_scores_uuid_source_idx on public.source_scores (station_uuid, source);
create index if not exists coverage_stats_source_region_idx on public.coverage_stats (source, region, measured_at desc);
create index if not exists truth_audit_uuid_audited_idx on public.truth_audit (station_uuid, audited_at desc);
