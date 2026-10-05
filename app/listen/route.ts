import { ariyoSeedStations, fallbackStations, fetchStationByUuid, fetchStations, mergeSeedStations, republicCongoStations, type Station } from "@/lib/stations";
import { compatibilityStream, renderCompatibilityPlayer } from "@/lib/compatibility-player";

export const dynamic = "force-dynamic";

async function within<T>(task: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task.catch(() => fallback), new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), 3000); })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") || "").trim().slice(0, 120);
  const rawCountry = (params.get("country") || "").toUpperCase();
  const country = /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : "";
  const id = (params.get("station") || "").slice(0, 100);
  const seeds = mergeSeedStations(fallbackStations, [...ariyoSeedStations, ...republicCongoStations]);
  const playable = (station: Station) => station.sourceType !== "geoaudio" && Boolean(compatibilityStream(station));
  const matches = (station: Station) => playable(station) && (!country || station.country_code === country) && (!query || [station.name, station.country, station.city, station.state, station.language].join(" ").toLowerCase().includes(query.toLowerCase()));
  const fallback = seeds.filter(matches).slice(0, 64);
  const loaded = await within(fetchStations({ q: query, countryCode: country || undefined, limit: "64", allowFallback: "true" }), fallback);
  const stations = mergeSeedStations(loaded, fallback).filter(matches).slice(0, 64);
  let selected = id ? [...stations, ...seeds].find((station) => station.station_uuid === id || station.id === id) : undefined;
  if (!selected && /^[a-z0-9-]{8,80}$/i.test(id)) selected = await within(fetchStationByUuid(id), null) || undefined;
  const html = renderCompatibilityPlayer(stations, selected, query, country, Boolean(id && !selected));
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
