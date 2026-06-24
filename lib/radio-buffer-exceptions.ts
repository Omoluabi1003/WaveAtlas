import type { Station } from "@/lib/stations";

const SOFT_BUFFER_FAILURES = new Set(["startup_timeout", "buffer_timeout", "stalled", "waiting"]);

export function isSoftBufferFailure(errorType: string) {
  return SOFT_BUFFER_FAILURES.has(errorType);
}

export function isLongBufferStation(station: Station) {
  const identity = `${station.name} ${station.city || ""} ${station.state || ""} ${station.country || ""} ${station.country_code || ""} ${station.url || ""} ${station.url_resolved || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
  const compactIdentity = identity.replace(/\s+/g, "");
  const hasStationName = /\bjay\b/.test(identity) || compactIdentity.includes("jayfm") || compactIdentity.includes("jay1019");
  const hasFrequency = identity.includes("101.9") || compactIdentity.includes("1019");
  const hasScope = station.country_code === "NG" || /\bnigeria\b/.test(identity) || /\bjos\b/.test(identity) || /\bplateau\b/.test(identity);
  const hasFmContext = /\bfm\b/.test(identity) || compactIdentity.includes("jayfm") || compactIdentity.includes("jay1019");
  return hasStationName && hasScope && (hasFrequency || hasFmContext);
}
