import { NextResponse } from "next/server";
import { getBriefHeadlines, type BriefCategory } from "@/lib/news-agent";
import { resolveBriefCountry } from "@/lib/brief-geography";

export const revalidate = 900;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const city = params.get("city") || undefined;
  const country = params.get("country") || undefined;
  const country_code = params.get("country_code") || undefined;
  const language = params.get("language") || undefined;
  const station_name = params.get("station_name") || undefined;
  const requestedCategory = params.get("category") || "front-page";
  const allowedCategories = new Set<BriefCategory>(["front-page", "local-pulse", "culture", "sports", "radio-signal"]);
  const category: BriefCategory = allowedCategories.has(requestedCategory as BriefCategory) ? requestedCategory as BriefCategory : "front-page";
  const headlines = await getBriefHeadlines({ city, country, country_code, language, category, station_name });
  const resolvedCountry = resolveBriefCountry({ country, country_code });
  const cacheSeconds = headlines.length ? 900 : 60;
  return NextResponse.json({ headlines, city, country: resolvedCountry?.name || country, country_code: resolvedCountry?.code || country_code, category }, { headers: { "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}` } });
}
