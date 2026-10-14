import 'server-only';
import { summarizeCommunityStreamEvidence } from './truth-mesh';
import { backendConfigured, maturityQuery } from './maturity-backend';
import { buildCoverageIntelligence } from './coverage-intelligence';
import type { Station } from './stations';
export async function loadOperationsDashboard() {
  if (!backendConfigured()) return { available: false as const };
  const inventory: Station[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const page = await maturityQuery<Station[]>(`stations?select=station_uuid,id,name,url,url_resolved,country,country_code,city,state,language,tags,codec,bitrate,latitude,longitude,health_score,is_active,last_check_ok,last_checked_at,failure_count,response_time_ms,votes,click_count&order=station_uuid.asc&limit=1000&offset=${offset}`);
    inventory.push(...page); if (page.length < 1000) break;
  }
  const [summary, runs, events, reports, conflicts, providers, snapshots, auditEvents] = await Promise.all([
    maturityQuery<Record<string, number>>('rpc/waveatlas_ops_summary', { method:'POST', body:'{}' }),
    maturityQuery<Array<Record<string, unknown>>>('agent_runs?select=started_at,finished_at,status,stations_discovered,stations_updated,stations_retired,stream_validation_successes,stream_validation_failures&order=started_at.desc&limit=20'),
    maturityQuery<Array<{ station_uuid: string; outcome: string; created_at: string }>>('station_failover_events?select=station_uuid,outcome,created_at&order=created_at.desc&limit=30'),
    maturityQuery<Array<{ station_uuid: string; reason: string; independent_reports: number; evidence_confidence: number }>>('community_stream_evidence?select=station_uuid,reason,independent_reports,evidence_confidence&limit=100'),
    maturityQuery<Array<{ station_uuid: string; field: string; detected_at: string }>>('station_conflicts?resolved_at=is.null&select=station_uuid,field,detected_at&order=detected_at.desc&limit=30'),
    maturityQuery<Array<{ source: string; stream_health_score: number; scored_at: string }>>('source_scores?select=source,stream_health_score,scored_at&order=scored_at.desc&limit=1000'),
    maturityQuery<Array<{ summary: { total: number }; created_at: string }>>('coverage_snapshots?select=summary,created_at&order=created_at.desc&limit=14'),
    maturityQuery<Array<{ station_uuid: string; action: string; confidence_label: string; created_at: string }>>('source_oracle_audit_logs?select=station_uuid,action,confidence_label,created_at&order=created_at.desc&limit=30'),
  ]);
  return { available: true as const, summary, communityEvidence: [...new Set(reports.map(row => row.station_uuid))].map(id => ({ stationId: id, evidence: summarizeCommunityStreamEvidence(id, reports) })), coverage: buildCoverageIntelligence(inventory), inventoryLimitReached: inventory.length >= 100000, runs, events, reports, conflicts, providers, snapshots, auditEvents };
}
