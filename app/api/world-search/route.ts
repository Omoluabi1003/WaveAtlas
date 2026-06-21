import { NextRequest, NextResponse } from "next/server";
import { isoCountryCentroids } from "@/lib/geotruth-resolver";
import { countryAliases, flagFor } from "@/lib/stations";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const display = new Intl.DisplayNames(["en"], { type: "region" });
  const countries = Object.keys(isoCountryCentroids).map((code) => ({ type: "country", name: display.of(code) ?? code, code, flag: flagFor(code), centroid: isoCountryCentroids[code], attribution: "WaveAtlas local ISO centroids + Intl.DisplayNames" }));
  const alias = countryAliases[q];
  const results = countries.filter((item) => item.name.toLowerCase().includes(q) || item.code.toLowerCase() === q || item.code === alias).slice(0, 8);
  return NextResponse.json({ results });
}
