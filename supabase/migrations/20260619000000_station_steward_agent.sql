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
