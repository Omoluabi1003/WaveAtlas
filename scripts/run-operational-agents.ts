import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ariyoSeedStations, fallbackStations } from '../lib/stations';
import { campusAtlasStations } from '../lib/stations/campusAtlasStations';
import { discoveredRadioStations } from '../lib/stations/discoveredRadioStations';
import { runOperationalAgents } from '../lib/agents/operational-agents';

async function main() {
  const report = runOperationalAgents({
    stations: [...ariyoSeedStations, ...campusAtlasStations, ...discoveredRadioStations, ...fallbackStations],
    health: JSON.parse(await readFile('lib/stations/stationHealthSnapshot.json', 'utf8')),
    workflow: await readFile('.github/workflows/global-radio-discovery-agent.yml', 'utf8'),
    sourceCommit: process.env.GITHUB_SHA,
    runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined,
  });
  await mkdir('reports', { recursive: true });
  await writeFile('reports/operational-agents.json', JSON.stringify(report, null, 2) + '\n');
  await writeFile('reports/operational-agents.md', `# WaveAtlas operational report\n\nGenerated: ${report.generatedAt}\n\n${report.scope}\n\n` + report.agents.map((agent) => `## ${agent.name}\n\n${agent.task}\n\nStatus: ${agent.status}\n\n\`\`\`json\n${JSON.stringify(agent.findings, null, 2)}\n\`\`\`\n`).join('\n'));
  const status = { generatedAt: report.generatedAt, executionSource: report.runUrl ? 'github-actions' : 'local-validation', sourceCommit: report.sourceCommit, runUrl: report.runUrl, agents: report.agents.map(({ id, status }) => ({ id, status })) };
  if (process.env.OPERATIONAL_AGENTS_DRY_RUN !== 'true') await writeFile('lib/agents/operational-status.json', JSON.stringify(status, null, 2) + '\n');
  console.log(JSON.stringify(status));
  if (report.agents.some((agent) => agent.status === 'failed')) process.exitCode = 1;
}
main().catch(() => { console.error('Operational agents failed.'); process.exitCode = 1; });
