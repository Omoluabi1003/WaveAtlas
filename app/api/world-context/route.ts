import { NextRequest, NextResponse } from "next/server";
import { getWorldContext } from "@/lib/world-engine/world-context-engine";

function finite(value: string | null) { const n = Number(value); return Number.isFinite(n) ? n : null; }

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    const context = await getWorldContext({
      stationName: params.get("stationName") ?? undefined,
      city: params.get("city") ?? undefined,
      state: params.get("state") ?? undefined,
      country: params.get("country") ?? undefined,
      countryCode: params.get("countryCode") ?? undefined,
      latitude: finite(params.get("lat")),
      longitude: finite(params.get("lng")),
      language: params.get("language") ?? undefined,
    });
    return NextResponse.json(context, { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ error: "World context is temporarily unavailable.", sources: [] }, { status: 200 });
  }
}
