import operationalStatus from '@/lib/agents/operational-status.json';
import { operationalRoles } from '@/lib/agents/operational-agents';
import { NextResponse } from 'next/server';
import snapshot from '@/lib/stations/stationHealthSnapshot.json';
import metadata from '@/lib/stations/discoveredRadioMetadata.json';
import { discoveredRadioStations } from '@/lib/stations/discoveredRadioStations';
import { HEALTH_EVIDENCE_TTL_MS, type HealthSnapshot } from '@/lib/agents/station-health-policy';

export async function GET() {
  const health = snapshot as HealthSnapshot;
  const fresh = Object.values(health.records).filter((record) => {
    const age = Date.now() - Date.parse(record.checkedAt);
    return age >= 0 && age < HEALTH_EVIDENCE_TTL_MS;
  });
  const verifiedAt = (metadata as Array<{ verifiedAt: string }>).map((item) => item.verifiedAt).sort().at(-1) ?? null;
  return NextResponse.json({
    coordination: { architecture: 'ruflo-inspired-deterministic', execution: 'scheduled-github-actions', paidModelCalls: false, memory: 'review-branch-execution-history', catalogChangesRequireReview: true, liveHeartbeat: false },
    operationalReport: { lastReport: operationalStatus.generatedAt, executionSource: operationalStatus.executionSource, sourceCommit: operationalStatus.sourceCommit, runUrl: operationalStatus.runUrl, reportUpdatesRequireReview: true },
    agents: [
      ...operationalRoles.map((role) => {
        const recorded = (operationalStatus.agents as Array<{ id: string; status: string }>).find((item) => item.id === role.id);
        const age = operationalStatus.generatedAt ? Date.now() - Date.parse(operationalStatus.generatedAt) : Infinity;
        return { ...role, mode: 'scheduled-background', cadence: 'every-8-hours', status: recorded ? (age >= 0 && age < 24 * 60 * 60 * 1000 ? recorded.status : 'report-stale') : 'awaiting-first-run', lastReport: operationalStatus.generatedAt, advisoryOnly: true };
      }),
      { id: 'stream-health', mode: 'scheduled-background', lastRun: health.generatedAt, status: health.generatedAt ? (fresh.length ? 'evidence-available' : 'evidence-stale') : 'awaiting-first-run', freshChecks: fresh.length, healthy: fresh.filter((record) => record.status === 'healthy').length, degraded: fresh.filter((record) => record.status === 'degraded').length, deletesStations: false },
      { id: 'station-discovery', mode: 'scheduled-background', status: verifiedAt ? 'verified-additions-available' : 'awaiting-verified-additions', lastVerifiedAddition: verifiedAt, acceptedStations: discoveredRadioStations.length, changesRequireReview: true },
    ],
  }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
