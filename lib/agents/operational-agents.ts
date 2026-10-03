import { stationPath } from '../station-deep-link';
import type { Station } from '../stations';
import { isoCountryCentroids, resolveStationGeo } from '../geotruth-resolver';
import { HEALTH_EVIDENCE_TTL_MS, type HealthSnapshot } from './station-health-policy';

export const operationalRoles = [
  { id: 'gis-operations-agent', name: 'Geography Quality', task: 'Flag unresolved locations and geography conflicts.' },
  { id: 'analytics-agent', name: 'Catalog Analytics', task: 'Measure catalog coverage and fresh stream evidence.' },
  { id: 'project-intelligence-agent', name: 'Project Intelligence', task: 'Prioritize catalog quality work with measurable milestones.' },
  { id: 'opportunity-agent', name: 'Partnership Opportunities', task: 'Draft partnership approaches for underserved catalog countries.' },
  { id: 'growth-agent', name: 'Growth Intelligence', task: 'Draft station spotlights supported by recent audio verification.' },
  { id: 'operations-agent', name: 'Operations Quality', task: 'Audit catalog metadata, duplicates, and workflow configuration.' },
  { id: 'executive-agent', name: 'Executive Intelligence', task: 'Summarize findings and recommend the next operational priorities.' },
] as const;
export type AgentResult = { id: string; name: string; task: string; status: 'completed' | 'failed'; findings: unknown; error?: string };
export type OperationalReport = { generatedAt: string; sourceCommit: string | null; runUrl: string | null; scope: string; agents: AgentResult[] };

function streamKey(station: Station) { return station.url_resolved || station.url; }
export function runOperationalAgents(input: { stations: Station[]; health: HealthSnapshot; workflow: string; now?: number; sourceCommit?: string; runUrl?: string }): OperationalReport {
  const now = input.now ?? Date.now();
  // Keep duplicates for the audit but count each country/stream once for coverage.
  const all = input.stations.filter((s) => s.sourceType !== 'geoaudio');
  const seen = new Set<string>();
  const stations = all.filter((s) => { const key = `${s.country_code}:${streamKey(s)}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const counts: Record<string, number> = {};
  for (const station of stations) counts[station.country_code || 'Unknown'] = (counts[station.country_code || 'Unknown'] ?? 0) + 1;
  const gaps = Object.keys(isoCountryCentroids).filter((code) => !counts[code]).sort();
  const healthFor = (s: Station) => { const record = input.health.records[streamKey(s)]; const age = record ? now - Date.parse(record.checkedAt) : Infinity; return age >= 0 && age < HEALTH_EVIDENCE_TTL_MS ? record : undefined; };
  const results: AgentResult[] = [];
  const run = (index: number, work: () => unknown) => {
    const role = operationalRoles[index];
    try { results.push({ ...role, status: 'completed', findings: work() }); }
    catch { results.push({ ...role, status: 'failed', findings: null, error: 'Task failed. Inspect the workflow logs.' }); }
  };
  let geoIssues: Array<{ stationId: string; country: string; precision: string; warning: string | null }> = [];
  run(0, () => {
    geoIssues = stations.flatMap((s) => { const geo = resolveStationGeo(s); return geo.warning || geo.precision === 'unknown' || geo.precision === 'country' ? [{ stationId: s.station_uuid, country: s.country_code, precision: geo.precision, warning: geo.warning }] : []; });
    return { checked: stations.length, issues: geoIssues, policy: 'Country centroids are approximate. No coordinates are overwritten.' };
  });
  run(1, () => ({ catalogStreams: stations.length, countryCounts: counts, catalogCountries: Object.keys(counts).length, countriesWithoutBundledStreams: gaps, freshHealthy: stations.filter((s) => healthFor(s)?.status === 'healthy').length, freshDegraded: stations.filter((s) => healthFor(s)?.status === 'degraded').length, unknownHealth: stations.filter((s) => !healthFor(s)).length, audienceAndRevenue: 'Unavailable: no audience or payment telemetry is connected.' }));
  run(2, () => ({ milestones: [ { priority: 1, task: 'Review approximate or conflicting station geography', remaining: geoIssues.length }, { priority: 2, task: 'Obtain fresh stream evidence', remaining: stations.filter((s) => !healthFor(s)).length }, { priority: 3, task: 'Expand bundled country coverage', remaining: gaps.length } ], dependency: 'Verified discovery additions require review before release.' }));
  run(3, () => ({ type: 'drafts-for-review', basis: 'Bundled catalog gaps, not verified sales leads or total live Radio Browser coverage.', drafts: gaps.slice(0, 5).map((countryCode) => ({ countryCode, nextStep: 'Identify a broadcaster through an official public website and verify contact information.', proposal: `Invite a broadcaster in ${countryCode} to provide a licensed direct stream and accurate station metadata for WaveAtlas. Evaluate an optional sponsored station profile after measuring audience demand.` })), sent: false, incomeGenerated: false }));
  run(4, () => ({ type: 'drafts-for-review', drafts: stations.filter((s) => healthFor(s)?.status === 'healthy').slice(0, 5).map((s) => ({ stationId: s.station_uuid, text: `Explore ${s.name} from ${s.country} on WaveAtlas. Discover humanity through sound.`, link: `https://wave-atlas.vercel.app${stationPath(s)}` })), reasonIfEmpty: 'Spotlights require fresh verified audio evidence.', published: false }));
  run(5, () => {
    const urls = new Map<string, string[]>();
    for (const s of all) { const key = streamKey(s); const ids = urls.get(key) ?? []; ids.push(s.station_uuid); urls.set(key, ids); }
    return { repeatedStreamReferences: [...urls].filter(([, ids]) => ids.length > 1).map(([url, ids]) => ({ url, stationIds: ids })), metadataIssues: stations.filter((s) => !s.name.trim() || !/^[A-Z]{2}$/.test(s.country_code) || !/^https?:\/\//i.test(streamKey(s))).map((s) => s.station_uuid), scheduledWorkers: { health: input.workflow.includes('43 */8 * * *'), discovery: input.workflow.includes('17 4 * * *'), operations: input.workflow.includes('29 */8 * * *') }, policy: 'Audit only. No stations are deleted, disabled, or edited.' };
  });
  run(6, () => ({ completedTasks: results.filter((r) => r.status === 'completed').length, failedTasks: results.filter((r) => r.status === 'failed').map((r) => r.id), priorities: ['Review geography findings', 'Review stream-health and discovery proposals', 'Validate partnership drafts before outreach'], automationBoundary: 'Reports are automatic; catalog changes, outreach, marketing publication, and financial commitments require human review.' }));
  return { generatedAt: new Date(now).toISOString(), sourceCommit: input.sourceCommit ?? null, runUrl: input.runUrl ?? null, scope: 'Bundled radio catalog only. Live Radio Browser inventory and audience metrics are not included.', agents: results };
}
