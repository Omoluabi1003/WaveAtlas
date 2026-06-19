import { NextRequest, NextResponse } from "next/server";
import {
  fetchStations,
  fetchStationsForCountryIntent,
  rankStations,
  resolveCountryIntent,
} from "@/lib/stations";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = p.get("q") ?? p.get("name") ?? undefined;
  const limit = p.get("limit") ?? "50";
  const offset = p.get("offset") ?? "0";
  const explicitCountry = p.get("country") ?? undefined;
  const explicitCountryCode = p.get("countryCode") ?? undefined;
  const language = p.get("language") ?? undefined;
  const tag = p.get("tag") ?? p.get("genre") ?? undefined;

  const countryIntent = explicitCountryCode
    ? { name: explicitCountry ?? explicitCountryCode, code: explicitCountryCode.toUpperCase() }
    : q
      ? await resolveCountryIntent(q)
      : undefined;

  if (countryIntent) {
    const stations = await fetchStationsForCountryIntent(countryIntent.name, countryIntent.code, {
      language,
      tag,
      limit,
      offset,
    });
    return NextResponse.json({ intent: "country", country: countryIntent, stations: rankStations(stations, q) });
  }

  const stations = await fetchStations({
    q,
    name: q,
    country: explicitCountry,
    countryCode: explicitCountryCode,
    language,
    tag,
    limit,
    offset,
  });

  return NextResponse.json({ intent: tag ? "genre" : "station", stations: rankStations(stations, q) });
}
