import type { Station } from "@/lib/stations";

export const STATION_ROUTE_PREFIX = "/station/";

export function stationRouteId(station: Pick<Station, "station_uuid" | "id">) {
  return station.station_uuid || station.id;
}

export function stationPath(station: Pick<Station, "station_uuid" | "id">) {
  return `${STATION_ROUTE_PREFIX}${encodeURIComponent(stationRouteId(station))}`;
}

export function stationIdFromPath(pathname: string) {
  const match = pathname.match(/^\/station\/([^/?#]+)\/?$/i);
  if (!match) return "";
  try { return decodeURIComponent(match[1]); } catch { return ""; }
}

export function stationLocation(station: Pick<Station, "city" | "state" | "country">) {
  return [station.city, station.state, station.country].filter((part, index, all) => Boolean(part) && all.indexOf(part) === index).join(", ");
}

export function stationSharePayload(station: Station, origin: string) {
  const city = station.city || station.state;
  const location = [city, station.country].filter(Boolean).join(", ");
  return {
    title: `${station.name} | WaveAtlas`,
    text: `Listen to ${station.name} from ${location} on WaveAtlas.`,
    url: `${origin.replace(/\/$/, "")}${stationPath(station)}`,
  };
}
