import type { Station } from '../stations';
import countries from '../country-metadata-data.json';
import { streamReliability } from './reliability';
import { resolveStationGeo } from '../geotruth-resolver';
export type CoverageRow = { code: string; total: number; playable: number; healthyRatio: number; languages: number; regions: number; priority: number; reasons: string[] };
export function coverageIntelligence(inventory: Station[], attempts: Record<string, { attemptedAt: string; successRate: number }> = {}, now = Date.now()) {
  const canonical = [...new Map(inventory.map(station => [station.station_uuid || station.id, station])).values()].filter(station => station.sourceType !== 'geoaudio');
  const languageCounts: Record<string, number> = {}; const regionCounts: Record<string, number> = {};
  const countryRows: CoverageRow[] = countries.map(country => {
    const stations = canonical.filter(station => station.country_code === country.code);
    const playable = stations.filter(station => station.is_active && ['Excellent','Stable'].includes(streamReliability(station, '', now).label)).length;
    const languages = new Set<string>(); const regions = new Set<string>();
    for (const station of stations) {
      for (const language of station.language.split(/[,;]/).map(s => s.trim()).filter(s => s && !/^unknown$/i.test(s))) { languages.add(language); languageCounts[language] = (languageCounts[language] || 0)+1; }
      const geo = resolveStationGeo(station); const region = station.state || station.city;
      if (region && ['station','city'].includes(geo.precision) && !geo.warning) { regions.add(region); regionCounts[`${country.code}:${region}`] = (regionCounts[`${country.code}:${region}`] || 0)+1; }
    }
    const ratio = stations.length ? playable/stations.length : 0;
    const recentAttempt = attempts[country.code] && now-Date.parse(attempts[country.code].attemptedAt) < 86400_000;
    const reasons = [playable === 0 ? 'No recently verified playable stations' : playable < 5 ? 'Fewer than five playable stations' : '', ratio < 0.5 ? 'Low verified healthy ratio' : '', languages.size < 2 ? 'Limited language diversity' : '', recentAttempt ? 'Recent discovery attempt; lower priority to spread coverage' : '', attempts[country.code]?.successRate < 0.2 ? 'Low recent discovery success; reduce repeated probes' : ''].filter(Boolean);
    return { code: country.code, total: stations.length, playable, healthyRatio: ratio, languages: languages.size, regions: regions.size, priority: Math.max(0, (playable === 0 ? 55 : Math.max(0,25-playable*5)) + (1-ratio)*25 + (languages.size < 2 ? 10 : 0) + (regions.size < 2 ? 10 : 0) - (recentAttempt ? 30 : 0) - (attempts[country.code]?.successRate < 0.2 ? 10 : 0)), reasons };
  }).sort((a,b) => b.priority-a.priority || a.code.localeCompare(b.code));
  return { measuredAt: new Date(now).toISOString(), canonicalCount: canonical.length, countries: countryRows, languages: languageCounts, regions: regionCounts, gaps: countryRows.filter(row => row.playable < 5) };
}
export function balancedDiscoveryQueue(stations: Station[], priorityCodes: string[]) {
  const queues = new Map<string, Station[]>();
  for (const station of [...stations].sort((a,b) => b.health_score-a.health_score)) { const queue=queues.get(station.country_code)||[];queue.push(station);queues.set(station.country_code,queue); }
  const codes=[...new Set([...priorityCodes.filter(code => queues.has(code)), ...queues.keys()])]; const result: Station[]=[];
  while ([...queues.values()].some(queue => queue.length)) for (const code of codes) { const station=queues.get(code)?.shift();if(station)result.push(station); }
  return result;
}
