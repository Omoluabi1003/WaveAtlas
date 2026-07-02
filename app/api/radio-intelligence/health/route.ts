import { NextRequest, NextResponse } from "next/server";
import { queryRadioIntelligence } from "@/lib/radio-intelligence";
export async function GET(req: NextRequest) { const id = req.nextUrl.searchParams.get("stationId"); const stations = queryRadioIntelligence({ health: "all", limit: 1000 }); return NextResponse.json({ station: id ? stations.find((s) => s.stationId === id) ?? null : stations.slice(0, 50) }); }
