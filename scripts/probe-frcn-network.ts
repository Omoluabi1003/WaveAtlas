import { probeStream } from '../lib/agents/stream-probe';
import { frcnNetwork } from '../lib/stations/frcnNetwork';

const timeout = Number(process.env.FRCN_STREAM_TIMEOUT_MS ?? '8000');

async function main() {
  const results = [];
  for (const station of frcnNetwork) {
    if (!station.streamUrl) {
      results.push({ station: station.station, status: 'pending', reason: 'no_direct_stream_candidate' });
      continue;
    }
    const signal = await probeStream(station.streamUrl, timeout);
    results.push({
      station: station.station,
      status: signal.ok ? 'verified' : 'candidate',
      url: station.streamUrl,
      resolvedUrl: signal.resolvedUrl,
      reason: signal.reason,
    });
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, results }, null, 2));
  if (!results.some((result) => result.status === 'verified')) process.exitCode = 2;
}

main().catch((error) => { console.error(error); process.exit(1); });
