import { NextRequest, NextResponse } from 'next/server';
import { fetchStationByUuid } from '@/lib/stations';
import { anonymousReporter, backendConfigured, maturityQuery, readBoundedJson } from '@/lib/maturity-backend';
export async function POST(req: NextRequest) {
  if (!backendConfigured() || !process.env.WAVEATLAS_REPORT_SECRET) return new NextResponse(null, { status: 503 });
  if (req.headers.get('origin') !== req.nextUrl.origin || Number(req.headers.get('content-length') || 0) > 2048) return new NextResponse(null, { status: 400 });
  const body = await readBoundedJson(req) as Record<string, unknown> | null;
  if (!body || typeof body.stationId !== 'string' || !/^[\w-]{1,200}$/.test(body.stationId) || typeof body.endpoint !== 'string' || body.endpoint.length > 1500 || (typeof body.outcome !== 'string' || !['success', 'failure'].includes(body.outcome))) return new NextResponse(null, { status: 400 });
  const station = await fetchStationByUuid(body.stationId).catch(() => null);
  const address = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (!station || !address) return new NextResponse(null, { status: 400 });
  try {
    // RPC verifies URL membership and bounds untrusted listener evidence.
    await maturityQuery('rpc/record_listener_endpoint_event', { method: 'POST', body: JSON.stringify({ p_station_uuid: station.station_uuid, p_endpoint: body.endpoint, p_outcome: body.outcome, p_reporter: anonymousReporter(address) }) });
    return new NextResponse(null, { status: 204 });
  } catch { return new NextResponse(null, { status: 503 }); }
}
