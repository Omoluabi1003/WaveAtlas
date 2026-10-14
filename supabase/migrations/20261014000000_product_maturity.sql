-- Additive: canonical stations and existing Truth Mesh evidence remain intact.
create table if not exists public.station_reports (
 id uuid primary key default gen_random_uuid(), station_uuid text not null,
 reason text not null check (reason in ('not_playing','wrong_station','severe_buffering','wrong_location','incorrect_metadata')),
 reporter_hash text not null, evidence_confidence numeric not null default 0.1 check (evidence_confidence between 0 and 0.1),
 status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists station_reports_station_idx on public.station_reports(station_uuid,created_at desc);
create index if not exists station_reports_reporter_idx on public.station_reports(reporter_hash,created_at desc);
create index if not exists station_reports_queue_idx on public.station_reports(status,created_at desc);
create index if not exists station_reports_dedup_idx on public.station_reports(reporter_hash,station_uuid,created_at desc);
create table if not exists public.station_failover_events (
 id uuid primary key default gen_random_uuid(), station_uuid text not null, endpoint text not null,
 outcome text not null check (outcome in ('success','failure')), reporter_hash text not null,
 evidence_confidence numeric not null default 0.1 check (evidence_confidence between 0 and 0.1),
 created_at timestamptz not null default now()
);
create index if not exists station_failover_events_time_idx on public.station_failover_events(station_uuid,created_at desc);
create index if not exists station_failover_events_reporter_idx on public.station_failover_events(reporter_hash,created_at desc);
create table if not exists public.coverage_snapshots (
 id uuid primary key default gen_random_uuid(), summary jsonb not null, created_at timestamptz not null default now()
);
create index if not exists coverage_snapshots_time_idx on public.coverage_snapshots(created_at desc);
alter table public.station_conflicts add column if not exists resolved_at timestamptz;
alter table public.station_reports enable row level security;
alter table public.station_failover_events enable row level security;
alter table public.coverage_snapshots enable row level security;
revoke all on public.station_reports, public.station_failover_events, public.coverage_snapshots from anon, authenticated;
grant all on public.station_reports, public.station_failover_events, public.coverage_snapshots to service_role;

create or replace function public.submit_station_report(p_station_uuid text,p_reason text,p_reporter text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_reporter,0));
 if (select count(*) from station_reports where reporter_hash=p_reporter and created_at>now()-interval '1 hour')>=5
 or exists(select 1 from station_reports where reporter_hash=p_reporter and station_uuid=p_station_uuid and created_at>now()-interval '24 hours') then return false; end if;
 insert into station_reports(station_uuid,reason,reporter_hash) values(p_station_uuid,p_reason,p_reporter);
 insert into source_oracle_audit_logs(station_uuid,action,source_names,confidence_label,message)
 values(p_station_uuid,'community_report',array['community'],'low','Listener report awaiting aggregation: '||p_reason);
 return true;
end $$;
create or replace function public.record_listener_endpoint_event(p_station_uuid text,p_endpoint text,p_outcome text,p_reporter text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_reporter,0));
 if (select count(*) from station_failover_events where reporter_hash=p_reporter and created_at>now()-interval '1 hour')>=30 then return false; end if;
 if exists(select 1 from station_failover_events where reporter_hash=p_reporter and station_uuid=p_station_uuid and endpoint=p_endpoint and outcome=p_outcome and created_at>now()-interval '10 minutes') then return false; end if;
 if not exists(select 1 from stations where station_uuid=p_station_uuid and (url=p_endpoint or url_resolved=p_endpoint))
 and not exists(select 1 from station_sources where station_uuid=p_station_uuid and url=p_endpoint)
 and not exists(select 1 from station_source_evidence where station_uuid=p_station_uuid and raw_stream_url=p_endpoint and evidence_confidence>=0.75) then return false; end if;
 insert into station_failover_events(station_uuid,endpoint,outcome,reporter_hash) values(p_station_uuid,p_endpoint,p_outcome,p_reporter);
 return true;
end $$;
revoke all on function public.submit_station_report(text,text,text),public.record_listener_endpoint_event(text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_station_report(text,text,text),public.record_listener_endpoint_event(text,text,text,text) to service_role;
-- Review/aggregation remains advisory; no trigger writes to canonical station truth.
create or replace view public.community_stream_evidence as
 select station_uuid,reason,count(distinct reporter_hash) as independent_reports,
 least(0.1,count(distinct reporter_hash)*0.01) as evidence_confidence,max(created_at) as last_report_at
 from public.station_reports where status='pending' and created_at>now()-interval '7 days' group by station_uuid,reason;
revoke all on public.community_stream_evidence from public,anon,authenticated;
grant select on public.community_stream_evidence to service_role;
alter table public.agent_runs add column if not exists stream_validation_successes integer not null default 0 check (stream_validation_successes >= 0);
alter table public.agent_runs add column if not exists stream_validation_failures integer not null default 0 check (stream_validation_failures >= 0);
create or replace function public.waveatlas_ops_summary() returns jsonb
language sql stable security definer set search_path=public as $$
select jsonb_build_object(
 'total_canonical_stations',(select count(*) from stations),
 'currently_healthy',(select count(*) from stations where last_check_ok and is_active and not is_retired and last_checked_at>now()-interval '48 hours'),
 'degraded',(select count(*) from stations where not last_check_ok and not is_retired and last_checked_at>now()-interval '48 hours'),
 'recently_recovered',(select count(distinct h.station_uuid) from station_health h where h.status='ok' and h.checked_at>now()-interval '48 hours' and exists(select 1 from station_health old where old.station_uuid=h.station_uuid and old.status='failed' and old.checked_at<h.checked_at and old.checked_at>now()-interval '7 days')),
 'retired',(select count(*) from stations where is_retired),
 'newly_discovered',(select count(*) from stations where created_at>now()-interval '7 days'),
 'discovery_successes',(select coalesce(sum(stations_discovered),0) from agent_runs where status='completed'),
 'stream_validation_successes',(select coalesce(sum(stream_validation_successes),0) from agent_runs),
 'stream_validation_failures',(select coalesce(sum(stream_validation_failures),0) from agent_runs),
 'failed_steward_runs',(select count(*) from agent_runs where status='failed'),
 'unresolved_conflicts',(select count(*) from station_conflicts where resolved_at is null),
 'pending_reports',(select count(*) from station_reports where status='pending')
) $$;
revoke all on function public.waveatlas_ops_summary() from public,anon,authenticated;
grant execute on function public.waveatlas_ops_summary() to service_role;
