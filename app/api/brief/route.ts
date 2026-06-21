import { NextResponse } from "next/server";
import { getBriefHeadlines } from "@/lib/news-agent";

export const revalidate = 900;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const city = params.get("city") || undefined;
  const country = params.get("country") || undefined;
  const country_code = params.get("country_code") || undefined;
  const language = params.get("language") || undefined;
  const headlines = await getBriefHeadlines({ city, country, country_code, language });
  return NextResponse.json({ headlines, city, country, country_code }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900" } });
}
