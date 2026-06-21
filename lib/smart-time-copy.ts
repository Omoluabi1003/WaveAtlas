import type { Station } from "@/lib/stations";

export type SmartDaypart = "morning" | "afternoon" | "evening" | "late_night";

const COUNTRY_TIMEZONES: Record<string, string> = {
  AE: "Asia/Dubai", AR: "America/Argentina/Buenos_Aires", AU: "Australia/Sydney", BR: "America/Sao_Paulo", CA: "America/Toronto",
  CH: "Europe/Zurich", CL: "America/Santiago", CO: "America/Bogota", DE: "Europe/Berlin", EG: "Africa/Cairo", ES: "Europe/Madrid",
  FJ: "Pacific/Fiji", FR: "Europe/Paris", GB: "Europe/London", HK: "Asia/Hong_Kong", IE: "Europe/Dublin", IN: "Asia/Kolkata",
  IT: "Europe/Rome", JP: "Asia/Tokyo", KE: "Africa/Nairobi", KR: "Asia/Seoul", MA: "Africa/Casablanca", MX: "America/Mexico_City",
  NG: "Africa/Lagos", NL: "Europe/Amsterdam", NO: "Europe/Oslo", NZ: "Pacific/Auckland", PE: "America/Lima", PG: "Pacific/Port_Moresby",
  SG: "Asia/Singapore", SE: "Europe/Stockholm", US: "America/New_York", ZA: "Africa/Johannesburg",
};

const CITY_TIMEZONES: Record<string, string> = {
  "au:sydney": "Australia/Sydney", "ca:toronto": "America/Toronto", "gb:london": "Europe/London", "ng:lagos": "Africa/Lagos",
  "us:chicago": "America/Chicago", "us:new york": "America/New_York", "us:seattle": "America/Los_Angeles", "us:washington": "America/New_York",
};

function isValidTimeZone(timeZone?: string) {
  if (!timeZone) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date()); return true; } catch { return false; }
}

function coordinateTimeZone(longitude?: number) {
  if (longitude == null || !Number.isFinite(longitude)) return undefined;
  const offset = Math.max(-12, Math.min(14, Math.round(longitude / 15)));
  if (offset === 0) return "Etc/UTC";
  return `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}

export function inferStationTimeZone(station?: Station) {
  if (!station) return undefined;
  const cityKey = `${station.country_code}:${station.city || station.state || ""}`.toLowerCase();
  const candidates = [CITY_TIMEZONES[cityKey], COUNTRY_TIMEZONES[station.country_code], coordinateTimeZone(station.longitude)];
  return candidates.find(isValidTimeZone);
}

export function getSmartDaypartLabel(date = new Date(), timeZone?: string): SmartDaypart | undefined {
  if (!isValidTimeZone(timeZone)) return undefined;
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(date));
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "late_night";
}

export function localTimeForStation(station: Station, date = new Date()) {
  const timeZone = inferStationTimeZone(station);
  if (!timeZone) return undefined;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(date);
}

export function stationTimeCopy(station: Station, date = new Date()) {
  const city = station.city || station.state || station.country || "this destination";
  const daypart = getSmartDaypartLabel(date, inferStationTimeZone(station));
  if (daypart === "morning") return `Good morning from ${city}.`;
  if (daypart === "afternoon") return `Live this afternoon in ${city}.`;
  if (daypart === "evening") return `Live this evening in ${city}.`;
  return `Live now from ${city}.`;
}

export function teleportCopy(station: Station) {
  const city = station.city || station.state || station.country || "this destination";
  const country = station.country || station.country_code;
  return `Teleporting to ${city}, ${country}.`;
}
