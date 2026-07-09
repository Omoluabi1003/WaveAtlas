import type { Station } from './stations';

export type StationReliabilityTier = 'Platinum' | 'Gold' | 'Silver' | 'Bronze' | 'Quarantine';
export type AtlasIntelligenceDecisionKind = 'station' | 'beacon' | 'journey' | 'weather' | 'emergency' | 'metadata' | 'discovery';

export type AtlasWeatherSignal = {
  condition?: string;
  severity?: 'none' | 'advisory' | 'watch' | 'warning' | 'emergency';
  isEmergency?: boolean;
  officialBroadcasterPreferred?: boolean;
};

export type AtlasDecisionContext = {
  kind: AtlasIntelligenceDecisionKind;
  geographicRelevance?: number;
  distanceRelevance?: number;
  metadataConfidence?: number;
  geoConfidence?: number;
  validationFreshness?: number;
  editorialConfidence?: number;
  anonymousEngagement?: number;
  weather?: AtlasWeatherSignal;
};

export type AtlasStationDecision = {
  station: Station;
  score: number;
  tier: StationReliabilityTier;
  trustScore: number;
  reasons: string[];
  context: Required<Omit<AtlasDecisionContext, 'weather'>> & { weather?: AtlasWeatherSignal };
};

export const AIE_ARCHITECTURAL_RULES = Object.freeze([
  'No AI module may make autonomous decisions outside AIE.',
  'Every station decision must pass through AIE.',
  'Every beacon decision must pass through AIE.',
  'Every Journey recommendation must pass through AIE.',
  'Every weather decision must pass through AIE.',
  'Every emergency recommendation must pass through AIE.',
  'Every metadata update must pass through AIE.',
  'Every discovery process must pass through AIE.',
]);

export const AIE_ENGINES = Object.freeze([
  'Atlas Decision Engine',
  'Global Discovery Engine',
  'Station Health Engine',
  'Geo Intelligence Engine',
  'Metadata Intelligence Engine',
  'Audio Intelligence Engine',
  'Journey Intelligence Engine',
  'Editorial Intelligence Engine',
  "Uncle Paul's Weather Forecast",
  'Atlas Trust Layer',
]);

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function stationMetadataConfidence(station: Station) {
  const filled = [station.name, station.country_code, station.country, station.state || station.city, station.language, station.codec, station.bitrate, station.homepage, station.favicon, station.tags.length].filter(Boolean).length;
  return clamp((filled / 10) * 100);
}

function validationFreshness(station: Station, now = Date.now()) {
  const checkedAt = Date.parse(station.last_checked_at || '');
  if (!Number.isFinite(checkedAt)) return 20;
  const ageHours = Math.max(0, (now - checkedAt) / 36e5);
  return clamp(100 - ageHours * 1.5);
}

export function calculateStationReliabilityIndex(station: Station, context: Partial<AtlasDecisionContext> = {}): { score: number; tier: StationReliabilityTier; inputs: Record<string, number> } {
  const streamHealth = station.last_check_ok === false || !station.is_active ? 0 : clamp(station.health_score);
  const playability = station.is_active && (station.url_resolved || station.url) ? 100 : 0;
  const historicalUptime = clamp(100 - station.failure_count * 18);
  const metadata = clamp(context.metadataConfidence ?? stationMetadataConfidence(station));
  const geo = clamp(context.geoConfidence ?? (typeof station.latitude === 'number' && typeof station.longitude === 'number' ? 86 : 38));
  const freshness = clamp(context.validationFreshness ?? validationFreshness(station));
  const editorial = clamp(context.editorialConfidence ?? (station.curation_tier === 'curated_atlas' ? 88 : station.verification_status === 'verified' || station.validation_status === 'verified' ? 74 : 50));
  const engagement = clamp(context.anonymousEngagement ?? Math.min(100, station.votes / 150 + station.click_count / 1000));
  const score = clamp(streamHealth * 0.22 + playability * 0.17 + historicalUptime * 0.14 + metadata * 0.12 + geo * 0.11 + freshness * 0.1 + editorial * 0.08 + engagement * 0.06);
  const tier: StationReliabilityTier = score >= 90 ? 'Platinum' : score >= 76 ? 'Gold' : score >= 60 ? 'Silver' : score >= 40 ? 'Bronze' : 'Quarantine';
  return { score: Math.round(score), tier, inputs: { historicalUptime, playability, streamHealth, metadata, geo, freshness, editorial, engagement } };
}

function weatherAdjustment(station: Station, weather?: AtlasWeatherSignal) {
  if (!weather) return 0;
  const emergencyTag = `${station.tags.join(' ')} ${station.name}`.toLowerCase();
  const official = /(weather|emergency|public|news|noaa|npr|bbc|alert|traffic)/.test(emergencyTag);
  if ((weather.isEmergency || weather.severity === 'emergency' || weather.severity === 'warning') && (weather.officialBroadcasterPreferred || official)) return 10;
  if (weather.severity === 'watch' && official) return 5;
  return 0;
}

export function decideStation(station: Station, context: AtlasDecisionContext): AtlasStationDecision {
  const normalizedContext = {
    kind: context.kind,
    geographicRelevance: clamp(context.geographicRelevance ?? context.distanceRelevance ?? 50),
    distanceRelevance: clamp(context.distanceRelevance ?? context.geographicRelevance ?? 50),
    metadataConfidence: clamp(context.metadataConfidence ?? stationMetadataConfidence(station)),
    geoConfidence: clamp(context.geoConfidence ?? (typeof station.latitude === 'number' && typeof station.longitude === 'number' ? 86 : 38)),
    validationFreshness: clamp(context.validationFreshness ?? validationFreshness(station)),
    editorialConfidence: clamp(context.editorialConfidence ?? (station.curation_tier === 'curated_atlas' ? 88 : 50)),
    anonymousEngagement: clamp(context.anonymousEngagement ?? Math.min(100, station.votes / 150 + station.click_count / 1000)),
  };
  const trust = calculateStationReliabilityIndex(station, normalizedContext);
  const score = clamp(normalizedContext.geographicRelevance * 0.25 + trust.score * 0.36 + normalizedContext.validationFreshness * 0.1 + normalizedContext.metadataConfidence * 0.09 + normalizedContext.editorialConfidence * 0.08 + normalizedContext.anonymousEngagement * 0.07 + normalizedContext.geoConfidence * 0.05 + weatherAdjustment(station, context.weather));
  return { station, score, tier: trust.tier, trustScore: trust.score, reasons: [`trust:${trust.tier}`, `sri:${trust.score}`, `geo:${Math.round(normalizedContext.geographicRelevance)}`], context: { ...normalizedContext, weather: context.weather } };
}

export function rankStationsWithAIE(stations: Station[], contextForStation: (station: Station) => AtlasDecisionContext) {
  return stations
    .map((station) => decideStation(station, contextForStation(station)))
    .sort((a, b) => b.score - a.score || b.trustScore - a.trustScore || b.station.votes - a.station.votes);
}

export function unclePaulsWeatherForecast(weather?: AtlasWeatherSignal) {
  if (!weather) return "Uncle Paul's Weather Forecast is temporarily unavailable; playback remains stable.";
  const condition = weather.condition || 'Local weather is being monitored';
  const severity = weather.severity && weather.severity !== 'none' ? ` ${weather.severity.toUpperCase()} awareness is active.` : '';
  return `Uncle Paul's Weather Forecast: ${condition}.${severity}`;
}
