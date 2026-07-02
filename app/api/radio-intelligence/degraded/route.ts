import { NextRequest, NextResponse } from "next/server";
import { queryRadioIntelligence } from "@/lib/radio-intelligence";
export async function GET(req: NextRequest) { const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50"); return NextResponse.json({ retryPool: queryRadioIntelligence({ health: "downgraded", limit }) }); }
