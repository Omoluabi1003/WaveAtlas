import { NextRequest, NextResponse } from "next/server";
import { fetchStations, rankStations } from "@/lib/stations";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = p.get("q") ?? p.get("name") ?? undefined;
  const stations = await fetchStations({
    q,
    name: q,
    country: p.get("country") ?? undefined,
    countryCode: p.get("countryCode") ?? undefined,
    language: p.get("language") ?? undefined,
    tag: p.get("tag") ?? p.get("genre") ?? undefined,
    limit: p.get("limit") ?? "50",
    offset: p.get("offset") ?? "0",
  });

  return NextResponse.json({ stations: rankStations(stations, q) });
}
