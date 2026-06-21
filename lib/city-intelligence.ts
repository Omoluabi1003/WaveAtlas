import { getBriefHeadlines, type Headline } from "@/lib/news-agent";
import type { Station } from "@/lib/stations";

export type CityIntelligencePayload = {
  city?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
  language?: string;
  headlines: Headline[];
  error?: string;
};

export async function getCityIntelligence(currentStation: Station): Promise<CityIntelligencePayload> {
  const payload = {
    city: currentStation.city || currentStation.state,
    country: currentStation.country,
    country_code: currentStation.country_code,
    latitude: currentStation.latitude,
    longitude: currentStation.longitude,
    language: currentStation.language,
  };
  try {
    return { ...payload, headlines: await getBriefHeadlines(payload) };
  } catch {
    return { ...payload, headlines: [], error: "Brief headlines are temporarily unavailable." };
  }
}
