import { NextResponse } from "next/server";
import { radioIntelligenceDiagnostics } from "@/lib/radio-intelligence";
export async function GET() { return NextResponse.json(radioIntelligenceDiagnostics()); }
