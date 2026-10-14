import type { Station } from './stations';
import countries from './country-metadata-data.json';
import { normalizeReliability } from './stream-reliability';
import { resolveStationGeo } from './geotruth-resolver';
export type DiscoveryAttempt = { countryCode: string; at: number; accepted: number; attempted: number };
export function coverageGapScore(playable: number, total: number, languages: number, regions: number, attempts: DiscoveryAttempt[] = [], now = Date.now()) {
  const recent = attempts.filter(row => now - row.at >= 0 && now - row.at < 7 * 86400000);
  const success = recent.reduce((sum, row) => sum + row.accepted, 0), tried = recent.reduce((sum, row) => sum + row.attempted, 0);
  const reasons = { inventory: 50 * (1 - Math.min(20, playable) / 20), health: total ? 20 * (1 - playable / total) : 20, languageDiversity: 10 * (1 - Math.min(3, languages) / 3), regionalDiversity: 10 * (1 - Math.min(3, regions) / 3), discoveryYield: tried ? 10 * success / tried : 5, recentAttemptPenalty: Math.min(20, recent.length * 4) };
  return { score: Math.round(Math.max(0, Math.min(100, reasons.inventory + reasons.health + reasons.languageDiversity + reasons.regionalDiversity + reasons.discoveryYield - reasons.recentAttemptPenalty))), reasons };
}
export function buildCoverageIntelligence(stations: Station[], attempts: DiscoveryAttempt[] = [], now = Date.now()) {
  const unique = [...new Map(stations.map(station => [station.station_uuid, station])).values()].filter(station => station.sourceType !== 'geoaudio');
  const languages: Record<string, number> = {}, regions: Record<string, number> = {};
  const countryRows = countries.map(country => {
    const rows = unique.filter(station => station.country_code === country.code);
    const playable = rows.filter(station => ['Stable', 'Excellent', 'Recovering'].includes(normalizeReliability(station, { now })));
    const languageSet = new Set<string>(), regionSet = new Set<string>();
    for (const station of rows) {
      for (const language of (station.language || "").split(/[,;]/).map(value => value.trim()).filter(value => value && !/unknown/i.test(value))) { languageSet.add(language); languages[language] = (languages[language] ?? 0) + 1; }
      const geo = resolveStationGeo({ ...station, country: station.country || "Unknown", country_code: station.country_code || "UN" });
      if (geo.precision === 'city' || geo.precision === 'station') { const region = station.city || station.state; if (region) { regionSet.add(region); const key = `${country.code}: ${region}`; regions[key] = (regions[key] ?? 0) + 1; } }
    }
    return { countryCode: country.code, country: country.names[0], total: rows.length, playable: playable.length, healthyRatio: rows.length ? playable.length / rows.length : null, languages: languageSet.size, regions: regionSet.size, ...coverageGapScore(playable.length, rows.length, languageSet.size, regionSet.size, attempts.filter(row => row.countryCode === country.code), now) };
  }).sort((a, b) => b.score - a.score || a.countryCode.localeCompare(b.countryCode));
  return { generatedAt: new Date(now).toISOString(), total: unique.length, countries: countryRows, languages, regions, gaps: countryRows.filter(row => row.playable < 5) };
}
export function balanceDiscoveryCandidates(stations: Station[], priorities: string[], perCountry = 10) {
  const buckets = new Map<string, Station[]>();
  for (const station of [...stations].sort((a,b) => b.health_score - a.health_score)) { const rows = buckets.get(station.country_code) ?? []; rows.push(station); buckets.set(station.country_code, rows); }
  const codes = [...new Set([...priorities, ...buckets.keys()])];
  return Array.from({ length: perCountry }, (_, index) => codes.flatMap(code => buckets.get(code)?.[index] ? [buckets.get(code)![index]] : [])).flat();
}
