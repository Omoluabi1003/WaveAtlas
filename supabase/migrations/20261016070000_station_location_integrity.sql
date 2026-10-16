alter table public.stations add column if not exists location_source text;
alter table public.stations add column if not exists location_precision text;
alter table public.stations add column if not exists location_verified_at timestamptz;

create table if not exists public.station_location_queue (
  station_uuid text primary key,
  country_code text not null,
  station_name text not null,
  missing_fields text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','verified','conflict','rejected')),
  evidence_urls text[] not null default '{}',
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists station_location_queue_country_status_idx
  on public.station_location_queue (country_code, status, updated_at desc);

insert into public.station_location_queue (station_uuid, country_code, station_name, missing_fields)
select station_uuid, country_code, name,
  array_remove(array[
    case when nullif(trim(city),'') is null then 'city' end,
    case when nullif(trim(state),'') is null then 'state' end,
    case when latitude is null then 'latitude' end,
    case when longitude is null then 'longitude' end
  ], null)
from public.stations
where country_code = 'NG'
  and (nullif(trim(city),'') is null or nullif(trim(state),'') is null or latitude is null or longitude is null)
on conflict (station_uuid) do update set
  station_name = excluded.station_name,
  missing_fields = excluded.missing_fields,
  updated_at = now();

-- WaveAtlas integrity rule: discovered stations missing geographic identity stay in the
-- remediation queue. Admission code must require city + state + coordinates and must
-- never substitute Nigeria's centroid or a streaming server/CDN location.
