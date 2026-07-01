import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { journeyCatalog, validateJourneyCatalog, validateJourneyPlaybackUrls } from '../lib/geoaudio';

const execFileAsync = promisify(execFile);

const curlHeadFetch = (async (url: string | URL | Request) => {
  const href = String(url);
  try {
    const { stdout } = await execFileAsync('curl', ['-I', '-L', '--max-time', '15', href], { maxBuffer: 1024 * 1024 });
    const statusMatches = [...stdout.matchAll(/HTTP\/\S+\s+(\d{3})/g)];
    const status = Number(statusMatches.at(-1)?.[1] ?? 0);
    return new Response(null, { status: status || 599 });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), { status: 599 });
  }
}) as typeof fetch;

async function main() {
  const catalogIssues = validateJourneyCatalog(journeyCatalog).filter((issue) => issue.severity === 'error');
  assert.deepEqual(catalogIssues, [], 'GeoAudio catalog must not contain structural playback errors before HEAD checks');

  const results = await validateJourneyPlaybackUrls(journeyCatalog, { fetchImpl: curlHeadFetch, tracksPerJourney: 1 });
  const failures = results.filter((result) => !result.ok);
  assert.deepEqual(failures, [], 'At least one GeoAudio track per journey must pass playback HEAD validation');
  console.log(`[geoaudio] HEAD-validated ${results.length} first-track playback URL(s) across ${journeyCatalog.length} journeys.`);
}

void main();
