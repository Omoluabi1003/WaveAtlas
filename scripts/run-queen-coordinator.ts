import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { emptyQueenMemory, planWorkers, readQueenMemory, type Worker } from '../lib/agents/queen-coordinator';

async function main() {
  let memory = emptyQueenMemory();
  try { memory = readQueenMemory(JSON.parse(await readFile('reports/queen-memory.json', 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const workers = planWorkers(process.env.QUEEN_AGENT ?? 'all', process.env.QUEEN_SCHEDULE || undefined);
  const scripts: Record<Worker, string> = { 'stream-health': 'scripts/check-station-health.ts', 'station-discovery': 'scripts/discover-radio-stations.ts', operations: 'scripts/run-operational-agents.ts' };
  const dryRun = process.env.QUEEN_DRY_RUN !== 'false';
  let failed = false;
  await mkdir('reports', { recursive: true });
  for (const worker of workers) {
    const started = Date.now();
    const success = await new Promise<boolean>((resolve) => {
      const child = spawn(process.execPath, ['--import', 'tsx', scripts[worker]], { stdio: 'inherit', timeout: 20 * 60 * 1000, env: { ...process.env, STATION_HEALTH_DRY_RUN: String(dryRun), RADIO_DISCOVERY_DRY_RUN: String(dryRun), OPERATIONAL_AGENTS_DRY_RUN: String(dryRun) } });
      child.on('error', () => resolve(false)); child.on('close', code => resolve(code === 0));
    });
    memory.runs.push({ at: new Date().toISOString(), worker, success });
    memory.runs = memory.runs.slice(-90);
    if (worker === 'station-discovery') {
      try {
        const report = JSON.parse(await readFile('reports/radio-discovery-report.json', 'utf8'));
        if (Date.parse(report.generatedAt) >= started - 1000) {
          for (const item of report.failed ?? []) if (item.url && item.reason?.startsWith('stream_validation_failed_')) memory.cooldowns[item.url] = new Date(Date.now() + 86400000).toISOString();
          for (const item of report.added ?? []) if (item.url) delete memory.cooldowns[item.url];
        }
      } catch { /* Worker failure is recorded; stale reports never become evidence. */ }
    }
    memory = readQueenMemory(memory);
    await writeFile('reports/queen-memory.json', JSON.stringify(memory, null, 2) + '\n');
    failed ||= !success;
  }
  const report = { generatedAt: new Date().toISOString(), architecture: 'ruflo-inspired-deterministic', providerCalls: 0, dryRun, workers, failed, recentRuns: memory.runs };
  await writeFile('reports/queen-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
