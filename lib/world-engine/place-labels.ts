import type { WorldContext } from "./types";
import type { AmbientTheme } from "./ambient-theme";

const KNOWN_IDENTITIES: Record<string, string> = {
  paris: "City of Light",
  lagos: "West Africa’s commercial pulse",
  tokyo: "Largest urban region on Earth",
  "new orleans": "Birthplace of jazz",
  miami: "Atlantic cultural crossroads",
  kinshasa: "Congo River megacity",
  london: "Global culture capital",
  dubai: "Gulf city of ambition",
  accra: "Gulf of Guinea creative hub",
};

function words(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function concise(value?: string, limit = 7) {
  if (!value) return undefined;
  const clean = value
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(the\s+)?city\s+of\s+/i, "")
    .trim();
  if (!clean) return undefined;
  return words(clean).slice(0, limit).join(" ");
}

function cityFrom(context: WorldContext) {
  return context.radioDNA.nearestCity || String(context.place.nearestCity ?? "") || undefined;
}

function countryFrom(context: WorldContext) {
  return context.radioDNA.country || String(context.place.country ?? "") || undefined;
}

export function buildPlaceLabel(context: WorldContext | null | undefined) {
  if (!context) return "Unknown destination";
  const city = cityFrom(context);
  const country = countryFrom(context);
  if (city && country && city.toLowerCase() !== country.toLowerCase()) return `${city}, ${country}`;
  return city || country || "Unknown destination";
}

function descriptorFromSummary(summary?: string) {
  if (!summary) return undefined;
  const firstSentence = summary.split(/[.!?]/)[0];
  const match = firstSentence.match(/(?:is|are)\s+(?:an?\s+|the\s+)?([^,;]+)/i);
  return concise(match?.[1] || firstSentence);
}

export function buildPlaceDescriptor(context: WorldContext | null | undefined) {
  if (!context) return "Signal arriving from Earth";
  const city = cityFrom(context)?.toLowerCase();
  if (city && KNOWN_IDENTITIES[city]) return KNOWN_IDENTITIES[city];
  const summaryDescriptor = descriptorFromSummary(context.radioDNA.culturalSummary || String(context.culture.summary ?? ""));
  if (summaryDescriptor && words(summaryDescriptor).length >= 2) return summaryDescriptor;
  const region = concise(context.radioDNA.region, 7);
  if (region) return region;
  const country = countryFrom(context);
  return country ? `${country} signal` : "Open-data place signal";
}

export function buildStationLine(context: WorldContext | null | undefined, fallbackStationName?: string) {
  const station = context?.radioDNA.stationName || fallbackStationName;
  return station ? `Listening to ${station}` : "Listening to a live station";
}


export function buildAtmosphereLine(context: WorldContext | null | undefined, theme: AmbientTheme) {
  const descriptor = buildPlaceDescriptor(context);
  const mood = theme.moodLabel;
  if (!context) return `${mood} · Signal arriving from Earth`;
  return `${mood} · ${descriptor}`;
}
