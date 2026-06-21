export type SourceStatus = "success" | "unavailable" | "skipped" | "error";

export type SourceResult<T = unknown> = {
  status: SourceStatus;
  source: string;
  confidence: number;
  data: T | null;
  attribution: string;
  url?: string;
  cached?: boolean;
  error?: string;
};

export type WorldContextInput = {
  stationName?: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  language?: string;
};

export type WorldContext = {
  radioDNA: {
    stationName?: string;
    country?: string;
    nearestCity?: string;
    localTime?: string;
    languages: string[];
    currency?: string;
    population?: number;
    region?: string;
    culturalSummary?: string;
    nearbyLandmarks: string[];
    geoConfidence: number;
  };
  place: Record<string, unknown>;
  culture: Record<string, unknown>;
  people: Record<string, unknown>;
  environment: Record<string, unknown>;
  climate?: {
    temperatureC?: number;
    humidityPercent?: number;
    windSpeedMetersPerSecond?: number;
    rainfallMillimeters?: number;
    solarRadiation?: number;
    date?: string;
  };
  openData: Array<{ name: string; description: string; url?: string; attribution: string }>;
  sources: SourceResult[];
  generatedAt: string;
};
