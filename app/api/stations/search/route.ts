import { NextRequest, NextResponse } from "next/server";
import {
  fetchStations,
  fetchStationsForCountryIntent,
  rankStations,
  resolveCountryIntent,
} from "@/lib/stations";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? p.get("name") ?? "").trim();
  const normalizedQuery = q.toLowerCase();
  const limit = p.get("limit") ?? "50";
  const offset = p.get("offset") ?? "0";
  const explicitCountry = p.get("country") ?? undefined;
  const explicitCountryCode = p.get("countryCode")?.toUpperCase() ?? undefined;
  const language = p.get("language") ?? undefined;
  const tag = p.get("tag") ?? p.get("genre") ?? undefined;

  const countryIntent = explicitCountryCode
    ? { name: explicitCountry ?? explicitCountryCode, code: explicitCountryCode }
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
    const exactCountryStations = rankStations(stations, q).filter((station) => station.country_code === countryIntent.code);
    return NextResponse.json({
      query: normalizedQuery,
      intent: "country",
      countryCode: countryIntent.code,
      countryName: countryIntent.name,
      country: countryIntent,
      source: `radio-browser:bycountrycodeexact/${countryIntent.code}`,
      stations: exactCountryStations,
      totalReturned: exactCountryStations.length,
      offset: Number(offset),
      limit: Number(limit),
    });
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

  const ranked = rankStations(stations, q);
  return NextResponse.json({
    query: normalizedQuery,
    intent: tag ? "genre" : "station",
    countryCode: explicitCountryCode,
    countryName: explicitCountry,
    source: "radio-browser:stations/search",
    stations: ranked,
    totalReturned: ranked.length,
    offset: Number(offset),
    limit: Number(limit),
  });
}
