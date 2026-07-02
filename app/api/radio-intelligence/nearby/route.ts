import { NextRequest, NextResponse } from "next/server";
import { discoverRadioIntelligence, queryRadioIntelligence } from "@/lib/radio-intelligence";
export async function GET(req: NextRequest) { const p = req.nextUrl.searchParams; const countryCode = p.get("countryCode") ?? undefined; const limit = Number(p.get("limit") ?? "50"); await discoverRadioIntelligence({ countryCode, limit: Math.min(limit, 500) }); return NextResponse.json({ candidates: queryRadioIntelligence({ health: "playable", limit }) }); }
