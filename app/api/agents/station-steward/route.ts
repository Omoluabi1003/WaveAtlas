import { NextRequest, NextResponse } from 'next/server';
import { runStationStewardAgent } from '@/lib/station-steward';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.STATION_STEWARD_SECRET;
  if (!secret) return req.nextUrl.searchParams.get('dry_run') === 'true';
  return req.headers.get('authorization') === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true';
  const validateLimit = Number(req.nextUrl.searchParams.get('validate_limit') ?? undefined) || undefined;
  const summary = await runStationStewardAgent({ dryRun, validateLimit });
  return NextResponse.json({ agent: 'Station Steward Agent', summary });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { dry_run?: boolean; validate_limit?: number };
  const summary = await runStationStewardAgent({ dryRun: body.dry_run, validateLimit: body.validate_limit });
  return NextResponse.json({ agent: 'Station Steward Agent', summary });
}
