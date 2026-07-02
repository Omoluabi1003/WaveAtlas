import { NextRequest, NextResponse } from "next/server";
import { runValidationCycle } from "@/lib/radio-intelligence";
export async function POST(req: NextRequest) { const limit = Number(req.nextUrl.searchParams.get("limit") ?? "25"); const checked = await runValidationCycle(limit); return NextResponse.json({ checked: checked.length, stations: checked }); }
export async function GET(req: NextRequest) { return POST(req); }
