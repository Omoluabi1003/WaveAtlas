-- Additive listener evidence. Nothing here edits or deletes canonical stations.
create table if not exists public.station_reports (
  id uuid primary key default gen_random_uuid(), station_uuid text not null,
  reason text not null check (reason in ('not_playing','wrong_station','severe_buffering','wrong_location','incorrect_metadata')),
  reporter_hash text not null, confidence numeric not null default 0.15 check (confidence = 0.15),
  status text not null default 'pending' check (status in ('pending','aggregated','reviewed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists station_reports_review_idx on public.station_reports(status,created_at desc);
create index if not exists station_reports_reporter_idx on public.station_reports(reporter_hash,created_at desc);
create index if not exists station_reports_identity_idx on public.station_reports(station_uuid,created_at desc);
create table if not exists public.station_failover_events (
  id uuid primary key default gen_random_uuid(), station_uuid text not null, endpoint text not null,
  outcome text not null check(outcome in ('success','failure','recovered')), reporter_hash text not null,
  evidence_confidence numeric not null default 0.1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists station_failover_identity_idx on public.station_failover_events(station_uuid,created_at desc);
create index if not exists station_failover_reporter_idx on public.station_failover_events(reporter_hash,created_at desc);
create table if not exists public.coverage_snapshots (
  id uuid primary key default gen_random_uuid(), scope text not null, summary jsonb not null,
  measured_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists coverage_snapshots_measured_idx on public.coverage_snapshots(measured_at desc);
alter table public.station_conflicts add column if not exists resolved_at timestamptz;
alter table public.station_reports enable row level security;
alter table public.station_failover_events enable row level security;
alter table public.coverage_snapshots enable row level security;
revoke all on public.station_reports, public.station_failover_events, public.coverage_snapshots from anon,authenticated;
grant all on public.station_reports, public.station_failover_events, public.coverage_snapshots to service_role;

create or replace function public.submit_station_report(p_station_uuid text,p_reason text,p_reporter_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_reporter_hash));
  if length(p_station_uuid)>256 or length(p_reporter_hash)<>64 or p_reason not in ('not_playing','wrong_station','severe_buffering','wrong_location','incorrect_metadata') then return false; end if;
  if (select count(*) from station_reports where reporter_hash=p_reporter_hash and created_at>now()-interval '24 hours')>=5 then return false; end if;
  if exists(select 1 from station_reports where reporter_hash=p_reporter_hash and station_uuid=p_station_uuid and created_at>now()-interval '24 hours') then return false; end if;
  insert into station_reports(station_uuid,reason,reporter_hash)values(p_station_uuid,p_reason,p_reporter_hash);return true;
end $$;
create or replace function public.record_station_failover(p_station_uuid text,p_endpoint text,p_outcome text,p_reporter_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_reporter_hash));
  if length(p_station_uuid)>256 or length(p_endpoint)>2048 or length(p_reporter_hash)<>64 or p_outcome not in ('success','failure','recovered') then return false; end if;
  if (select count(*) from station_failover_events where reporter_hash=p_reporter_hash and created_at>now()-interval '1 hour')>=60 then return false; end if;
  if exists(select 1 from station_failover_events where reporter_hash=p_reporter_hash and station_uuid=p_station_uuid and endpoint=p_endpoint and outcome=p_outcome and created_at>now()-interval '1 hour') then return false; end if;
  insert into station_failover_events(station_uuid,endpoint,outcome,reporter_hash)values(p_station_uuid,p_endpoint,p_outcome,p_reporter_hash);return true;
end $$;
create or replace function public.aggregate_station_reports()
returns integer language plpgsql security definer set search_path=public as $$
declare evidence record; n integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('waveatlas-report-aggregation'));
  for evidence in select station_uuid,reason,count(distinct reporter_hash) as reporters from station_reports where status='pending' and created_at>now()-interval '7 days' group by station_uuid,reason having count(distinct reporter_hash)>=3 loop
    insert into station_conflicts(station_uuid,field,winning_value,rejected_values,confidence_score)values(evidence.station_uuid,'community_report',null,array[evidence.reason],15);
    insert into station_sources(station_uuid,source,source_tier,source_weight,raw_payload)values(evidence.station_uuid,'community_reports',4,0.15,jsonb_build_object('reason',evidence.reason,'independent_reports',evidence.reporters,'review_required',true)) on conflict(station_uuid,source) do update set raw_payload=excluded.raw_payload,fetched_at=now();
    update station_reports set status='aggregated',updated_at=now() where station_uuid=evidence.station_uuid and reason=evidence.reason and status='pending';n:=n+1;
  end loop;return n;
end $$;
revoke all on function public.submit_station_report(text,text,text),public.record_station_failover(text,text,text,text),public.aggregate_station_reports() from public,anon,authenticated;
grant execute on function public.submit_station_report(text,text,text),public.record_station_failover(text,text,text,text),public.aggregate_station_reports() to service_role;
