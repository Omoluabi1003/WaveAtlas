import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ariyoSeedStations, fallbackStations } from '../lib/stations';
import { campusAtlasStations } from '../lib/stations/campusAtlasStations';
import { discoveredRadioStations } from '../lib/stations/discoveredRadioStations';
import { healthEvidenceKey, selectHealthBatch, type HealthSnapshot } from '../lib/agents/station-health-policy';
import { probeStream } from '../lib/agents/stream-probe';

async function main() {
  const file = 'lib/stations/stationHealthSnapshot.json';
  const snapshot: HealthSnapshot = JSON.parse(await readFile(file, 'utf8'));
  const configuredLimit = Number(process.env.STATION_HEALTH_LIMIT ?? 120);
  if (!Number.isFinite(configuredLimit) || configuredLimit < 1) throw new Error('STATION_HEALTH_LIMIT must be positive.');
  const batch = selectHealthBatch([...ariyoSeedStations, ...campusAtlasStations, ...discoveredRadioStations, ...fallbackStations], snapshot.cursor, Math.min(250, configuredLimit));
  const generatedAt = new Date().toISOString();
  const results: Array<{ name: string; status: string; reason: string }> = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, batch.stations.length) }, async () => {
    while (cursor < batch.stations.length) {
      const station = batch.stations[cursor++];
      const url = healthEvidenceKey(station);
      const probe = await probeStream(url);
      const previous = snapshot.records[url];
      const recent = previous && Date.parse(generatedAt) - Date.parse(previous.checkedAt) < 48 * 60 * 60 * 1000;
      const status = probe.ok ? 'healthy' : 'degraded';
      snapshot.records[url] = { stationId: station.station_uuid, url, checkedAt: generatedAt, status, reason: probe.reason, consecutiveFailures: probe.ok ? 0 : (recent ? previous.consecutiveFailures : 0) + 1, bytesSampled: probe.bytesSampled, responseTimeMs: probe.responseTimeMs };
      results.push({ name: station.name, status, reason: probe.reason });
    }
  }));
  snapshot.generatedAt = generatedAt; snapshot.cursor = batch.cursor;
  if (process.env.STATION_HEALTH_DRY_RUN !== 'true') await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  await mkdir('reports', { recursive: true });
  const report = { generatedAt, catalogSize: batch.catalogSize, checked: results.length, healthy: results.filter((item) => item.status === 'healthy').length, degraded: results.filter((item) => item.status === 'degraded').length, preserved: true, results };
  await writeFile('reports/station-health-report.json', `${JSON.stringify(report, null, 2)}\n`);
  await writeFile('reports/station-health-report.md', `# WaveAtlas Stream Health Agent\n\nChecked: ${report.checked} of ${report.catalogSize}. Healthy: ${report.healthy}. Inconclusive or degraded: ${report.degraded}.\n\nNo station was deleted, retired, disabled, or relabeled permanently offline.\n`);
  console.log(JSON.stringify({ agent: 'stream-health', ...report, results: undefined }));
}
main().catch((error) => { console.error(error); process.exit(1); });
