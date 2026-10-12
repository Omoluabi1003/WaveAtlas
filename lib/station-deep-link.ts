import { WAVEATLAS_SITE_URL } from "./branding";
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

export function stationShareMessage(station: Station, origin: string = WAVEATLAS_SITE_URL) {
  return `Listen to ${station.name} on WaveAtlas.\n\n${origin.replace(/\/$/, "")}${stationPath(station)}`;
}

export function stationSharePayload(station: Station, origin: string = WAVEATLAS_SITE_URL) {
  return {
    title: `${station.name} | WaveAtlas`,
    text: stationShareMessage(station, origin),
    url: `${origin.replace(/\/$/, "")}${stationPath(station)}`,
  };
}

export function stationIdFromUrl(url: Pick<URL, "pathname" | "search">) {
  return stationIdFromPath(url.pathname) || new URLSearchParams(url.search).get("station")?.trim() || "";
}

export async function shareStation(station: Station, browser: Pick<Navigator, "share" | "clipboard">): Promise<"shared" | "copied" | "cancelled"> {
  const payload = stationSharePayload(station);
  if (browser.share) {
    try { await browser.share({ title: payload.title, text: payload.text }); return "shared"; }
    catch (error) { if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return "cancelled"; }
  }
  await browser.clipboard.writeText(payload.text);
  return "copied";
}
