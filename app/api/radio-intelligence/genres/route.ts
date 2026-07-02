import { NextRequest, NextResponse } from "next/server";
import { discoverRadioIntelligence, queryRadioIntelligence } from "@/lib/radio-intelligence";
export async function GET(req: NextRequest) { const genre = req.nextUrl.searchParams.get("genre") ?? ""; const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50"); await discoverRadioIntelligence({ q: genre, genre, limit: Math.min(limit, 500) }); return NextResponse.json({ genre, stations: queryRadioIntelligence({ genre, health: "playable", limit }) }); }
