import { readQueenMemory, emptyQueenMemory } from '../lib/agents/queen-coordinator';
import { probeStream, probeOutcome } from '../lib/agents/stream-probe';
import { fallbackStations } from '../lib/stations';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { candidateToStation, existingStationKeys, isDuplicateCandidate, normalizeUrl, qualityScore, rejectReason, type DiscoveryMetadata, type RadioBrowserCandidate } from '../lib/radio-discovery';
import { discoveredRadioStations } from '../lib/stations/discoveredRadioStations';
import { ariyoSeedStations } from '../lib/stations/ariyoSeedStations';
import { campusAtlasStations } from '../lib/stations/campusAtlasStations';
import { republicCongoStations } from '../lib/stations/republicCongoStations';

const DEFAULT_API_BASES = ['https://de1.api.radio-browser.info/json', 'https://de2.api.radio-browser.info/json', 'https://fi1.api.radio-browser.info/json'];
const API_BASES = (process.env.RADIO_BROWSER_API_BASES ?? process.env.RADIO_BROWSER_API_BASE ?? DEFAULT_API_BASES.join(','))
  .split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean);
const USER_AGENT = process.env.RADIO_DISCOVERY_USER_AGENT ?? 'WaveAtlasGlobalRadioDiscovery/2.0 (https://github.com/Omoluabi1003/WaveAtlas)';
const DRY_RUN = process.env.RADIO_DISCOVERY_DRY_RUN !== 'false';
const MAX_ADD = Math.min(150, Math.max(0, Number(process.env.RADIO_DISCOVERY_MAX_ADD ?? '75')));
const MAX_PROBES = Math.min(400, Math.max(1, Number(process.env.RADIO_DISCOVERY_MAX_PROBES ?? '180')));
const PAGES = Math.min(3, Math.max(1, Number(process.env.RADIO_DISCOVERY_PAGES ?? '1')));
const PAGE_SIZE = Math.min(500, Math.max(1, Number(process.env.RADIO_DISCOVERY_PAGE_SIZE ?? '100')));
const MIN_BITRATE = Number(process.env.RADIO_DISCOVERY_MIN_BITRATE ?? '0');
const REQUIRE_GEO = process.env.RADIO_DISCOVERY_REQUIRE_GEO === 'true';
const COUNTRIES_PER_RUN = Math.min(60, Math.max(1, Number(process.env.RADIO_DISCOVERY_COUNTRIES_PER_RUN ?? '24')));
const SIGNAL_TIMEOUT_MS = Number(process.env.RADIO_DISCOVERY_SIGNAL_TIMEOUT_MS ?? '8000');
const MIN_QUALITY_SCORE = Number(process.env.RADIO_DISCOVERY_MIN_QUALITY_SCORE ?? '0');

type ReportItem = { name?: string; url?: string; sourceStationUuid?: string; reason?: string; qualityScore?: number };
type CountryCoverage = { code: string; name?: string; available?: number; covered: number };
type Report = { generatedAt: string; dryRun: boolean; sources: string[]; activeSource?: string; countries: CountryCoverage[]; fetched: number; probed: number; added: ReportItem[]; skipped: ReportItem[]; duplicate: ReportItem[]; failed: ReportItem[]; inconclusive: ReportItem[]; suspicious: ReportItem[] };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson<T>(path: string): Promise<{ data: T; source: string }> {
  const failures: string[] = [];
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) { failures.push(`${base}:${res.status}`); continue; }
      return { data: await res.json() as T, source: base };
    } catch (error) { failures.push(`${base}:${error instanceof Error ? error.message : String(error)}`); }
  }
  throw new Error(`all_radio_browser_sources_failed:${failures.join('|')}`);
}

async function fetchCountryInventory() {
  const { data, source } = await fetchJson<{ name?: string; iso_3166_1?: string; stationcount?: number }[]>('/countries');
  return { source, countries: data.filter(country => country.iso_3166_1 && Number(country.stationcount ?? 0) > 0) };
}

function selectUnderCoveredCountries(countries: { name?: string; iso_3166_1?: string; stationcount?: number }[], existingCountryCounts: Map<string, number>) {
  const ranked = countries.map(country => ({ ...country, code: country.iso_3166_1!.toUpperCase(), covered: existingCountryCounts.get(country.iso_3166_1!.toUpperCase()) ?? 0 }))
    .sort((a, b) => (a.covered / Math.max(1, Number(a.stationcount))) - (b.covered / Math.max(1, Number(b.stationcount))) || a.covered - b.covered || Number(b.stationcount) - Number(a.stationcount));
  const epoch = Math.floor(Date.now() / (8 * 60 * 60 * 1000));
  const offset = ranked.length ? (epoch * COUNTRIES_PER_RUN) % ranked.length : 0;
  return [...ranked.slice(offset), ...ranked.slice(0, offset)].slice(0, Math.min(COUNTRIES_PER_RUN, ranked.length));
}

async function fetchCandidates(existingCountryCounts: Map<string, number>) {
  const inventory = await fetchCountryInventory();
  const selectedCountries = selectUnderCoveredCountries(inventory.countries, existingCountryCounts);
  const out: RadioBrowserCandidate[] = [];
  let activeSource = inventory.source;
  for (const country of selectedCountries) {
    for (let page = 0; page < PAGES; page++) {
      const query = new URLSearchParams({ countrycode: country.code, hidebroken: 'true', order: 'clicktrend', reverse: 'true', limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      try {
        const result = await fetchJson<RadioBrowserCandidate[]>(`/stations/search?${query}`);
        activeSource = result.source;
        out.push(...result.data);
      } catch { break; }
      await sleep(Number(process.env.RADIO_DISCOVERY_RATE_LIMIT_MS ?? '500'));
    }
  }
  return { candidates: out, activeSource, countries: selectedCountries.map(country => ({ code: country.code, name: country.name, available: country.stationcount, covered: country.covered })) };
}

async function writeGenerated(stations: ReturnType<typeof candidateToStation>[], metadata: DiscoveryMetadata[]) {
  await writeFile('lib/stations/discoveredRadioStations.ts', `import type { Station } from '../stations';\n\n// Generated by scripts/discover-radio-stations.ts. Do not edit manually.\nexport const discoveredRadioStations: Station[] = ${JSON.stringify(stations, null, 2)};\n`);
  await writeFile('lib/stations/discoveredRadioMetadata.json', `${JSON.stringify(metadata, null, 2)}\n`);
}
async function writeReports(report: Report) {
  await mkdir('reports', { recursive: true });
  await writeFile('reports/radio-discovery-report.json', `${JSON.stringify(report, null, 2)}\n`);
  const md = ['# WaveAtlas Global Radio Trust Report', '', `Generated: ${report.generatedAt}`, `Dry run: ${report.dryRun}`, `Active source: ${report.activeSource ?? 'none'}`, `Countries sampled: ${report.countries.length}`, `Candidates fetched: ${report.fetched}`, `Streams probed: ${report.probed}`, '', '| Bucket | Count |', '| --- | ---: |', `| Admitted | ${report.added.length} |`, `| Skipped | ${report.skipped.length} |`, `| Duplicate | ${report.duplicate.length} |`, `| Failed | ${report.failed.length} |`, `| Inconclusive | ${report.inconclusive.length} |`, `| Suspicious | ${report.suspicious.length} |`, '', '## Admitted candidates', ...report.added.map(i => `- ${i.name} (${i.url}) score=${i.qualityScore}`), ''].join('\n');
  await writeFile('reports/radio-discovery-report.md', md);
}

async function main() {
  const generatedAt = new Date().toISOString();
  const report: Report = { generatedAt, dryRun: DRY_RUN, sources: API_BASES, countries: [], fetched: 0, probed: 0, added: [], skipped: [], duplicate: [], failed: [], inconclusive: [], suspicious: [] };
  const allExisting = [...ariyoSeedStations, ...campusAtlasStations, ...republicCongoStations, ...discoveredRadioStations, ...fallbackStations];
  const keys = existingStationKeys(allExisting);
  const accepted = [...discoveredRadioStations];
  const metadata: DiscoveryMetadata[] = JSON.parse(await readFile('lib/stations/discoveredRadioMetadata.json', 'utf8'));
  for (const item of metadata) keys.sourceUuids.add(item.sourceStationUuid);
  if (![MAX_ADD, MAX_PROBES, PAGES, PAGE_SIZE, MIN_BITRATE, COUNTRIES_PER_RUN, SIGNAL_TIMEOUT_MS, MIN_QUALITY_SCORE].every(Number.isFinite)) throw new Error('Invalid discovery configuration.');
  let memory = emptyQueenMemory();
  try { memory = readQueenMemory(JSON.parse(await readFile('reports/queen-memory.json', 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  let candidates: RadioBrowserCandidate[] = [];
  try {
    const countryCounts = new Map<string, number>();
    for (const station of allExisting) { const code = station.country_code?.toUpperCase(); if (code) countryCounts.set(code, (countryCounts.get(code) ?? 0) + 1); }
    const discovery = await fetchCandidates(countryCounts);
    candidates = discovery.candidates;
    report.countries = discovery.countries;
    report.activeSource = discovery.activeSource;
  } catch (error) {
    report.failed.push({ reason: `candidate_fetch_failed:${error instanceof Error ? error.message : String(error)}` });
    await writeReports(report);
    if (!DRY_RUN) process.exitCode = 1;
    return;
  }
  report.fetched = candidates.length;
  const ordered = [...candidates].sort((a, b) => qualityScore(b) - qualityScore(a));
  for (const c of ordered) {
    if (report.added.length >= MAX_ADD || report.probed >= MAX_PROBES) break;
    const score = qualityScore(c);
    const item = { name: c.name, url: c.url_resolved || c.url, sourceStationUuid: c.stationuuid, qualityScore: score };
    const reason = rejectReason(c, MIN_BITRATE, REQUIRE_GEO);
    if (reason) { (reason === 'suspicious_name' ? report.suspicious : report.skipped).push({ ...item, reason }); continue; }
    if (score < MIN_QUALITY_SCORE) { report.skipped.push({ ...item, reason: 'below_trust_score' }); continue; }
    if (!item.url?.startsWith('https://')) { report.skipped.push({ ...item, reason: 'https_required' }); continue; }
    if (isDuplicateCandidate(c, keys)) { report.duplicate.push({ ...item, reason: 'duplicate_existing_station' }); continue; }
    if (Date.parse(memory.cooldowns[item.url || ''] || '') > Date.now()) { report.skipped.push({ ...item, reason: 'retry_cooldown' }); continue; }
    report.probed++;
    const signal = await probeStream(c.url_resolved || c.url || '', SIGNAL_TIMEOUT_MS);
    if (!signal.ok) {
      const outcome = probeOutcome(signal);
      (outcome === 'inconclusive' ? report.inconclusive : report.failed).push({ ...item, reason: `${outcome === 'inconclusive' ? 'stream_inconclusive' : 'stream_failed'}_${signal.reason}` });
      continue;
    }
    if (!signal.resolvedUrl?.startsWith('https://')) { report.skipped.push({ ...item, reason: 'resolved_endpoint_not_https' }); continue; }
    if (isDuplicateCandidate({ ...c, url_resolved: signal.resolvedUrl }, keys)) { report.duplicate.push({ ...item, reason: 'duplicate_resolved_stream' }); continue; }
    const station = candidateToStation({ ...c, url_resolved: signal.resolvedUrl }, generatedAt);
    accepted.push(station);
    keys.urls.add(normalizeUrl(station.url_resolved || station.url));
    keys.names.add(`${station.country_code}:${station.normalized_name || ''}`);
    keys.sourceUuids.add(c.stationuuid || station.station_uuid);
    metadata.push({ stationUuid: station.station_uuid, discoverySource: 'radio-browser', sourceStationUuid: c.stationuuid || '', verifiedAt: generatedAt, lastSignalCheck: generatedAt, qualityScore: score, resolvedUrl: signal.resolvedUrl });
    report.added.push({ ...item, url: signal.resolvedUrl });
  }
  await writeReports(report);
  if (!DRY_RUN && report.added.length) await writeGenerated(accepted, metadata);
  console.log(`WaveAtlas global radio trust harvest: admitted=${report.added.length} fetched=${report.fetched} probed=${report.probed} failed=${report.failed.length} dryRun=${DRY_RUN}`);
}

main().catch(error => { console.error(error); process.exit(1); });
