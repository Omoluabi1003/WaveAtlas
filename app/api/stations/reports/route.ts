import { NextRequest, NextResponse } from 'next/server';
import { fetchStationByUuid } from '@/lib/stations';
import { anonymousReporter, backendConfigured, maturityQuery, readBoundedJson } from '@/lib/maturity-backend';
import { validateCommunityReport } from '@/lib/community-report';
export async function POST(req: NextRequest) {
  if (!backendConfigured() || !process.env.WAVEATLAS_REPORT_SECRET) return NextResponse.json({ error: 'Reporting is temporarily unavailable.' }, { status: 503 });
  if (req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  if (Number(req.headers.get('content-length') || 0) > 2048) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  const input = validateCommunityReport(await readBoundedJson(req));
  if (!input) return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
  const station = await fetchStationByUuid(input.stationId).catch(() => null);
  if (!station) return NextResponse.json({ error: 'Unknown station' }, { status: 404 });
  // Vercel sets this header. Never accept an arbitrary client-provided reporter ID.
  const address = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (!address) return NextResponse.json({ error: 'Reporting is unavailable on this host.' }, { status: 503 });
  try {
    const accepted = await maturityQuery<boolean>('rpc/submit_station_report', { method: 'POST', body: JSON.stringify({ p_station_uuid: station.station_uuid, p_reason: input.reason, p_reporter: anonymousReporter(address) }) });
    return NextResponse.json(accepted ? { message: 'Thank you. Your report will be reviewed alongside other evidence.' } : { error: 'Please wait before reporting again.' }, { status: accepted ? 201 : 429 });
  } catch { return NextResponse.json({ error: 'Reporting is temporarily unavailable.' }, { status: 503 }); }
}
