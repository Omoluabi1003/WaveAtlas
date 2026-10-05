import { NextRequest, NextResponse } from "next/server";
import { isSignalLayer, normalizePublicSignals, SIGNAL_LAYERS } from "@/lib/public-signals";

const ENDPOINTS = {
  earthquakes: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson",
  events: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=200",
  iss: "https://api.wheretheiss.at/v1/satellites/25544",
};
export async function GET(request: NextRequest) {
  const layer = request.nextUrl.searchParams.get("layer");
  if (!isSignalLayer(layer)) return NextResponse.json({ error: "Unknown signal layer" }, { status: 400 });
  try {
    const ttl = SIGNAL_LAYERS[layer].refreshMs / 1000;
    const response = await fetch(ENDPOINTS[layer], { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: ttl } });
    if (!response.ok) throw new Error("Provider unavailable");
    const data: unknown = await response.json();
    const valid = data && typeof data === "object" && (layer === "iss" ? "latitude" in data : layer === "events" ? "events" in data && Array.isArray(data.events) : "features" in data && Array.isArray(data.features));
    if (!valid) throw new Error("Invalid provider response");
    const points = normalizePublicSignals(layer, data);
    if (layer === "iss" && !points.length) throw new Error("Invalid ISS position");
    return NextResponse.json({ layer, fetchedAt: new Date().toISOString(), points }, { headers: { "Cache-Control": `public, s-maxage=${ttl}` } });
  } catch {
    return NextResponse.json({ layer, error: `${SIGNAL_LAYERS[layer].source} is currently unavailable` }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
