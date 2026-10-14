import { NextResponse } from 'next/server';
import { validateReport } from '@/lib/maturity/community-report';
import { fetchStationByUuid } from '@/lib/stations';
import { database, databaseConfigured } from '@/lib/maturity/server-data';
import { reporterHash, sameOrigin } from '@/lib/maturity/security';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  if (!databaseConfigured()) return NextResponse.json({ error: 'Reporting is temporarily unavailable.' }, { status: 503 });
  if (Number(request.headers.get('content-length')) > 2048) return NextResponse.json({ error: 'Invalid report' }, { status: 413 });
  const body = await request.text(); if (body.length > 2048) return NextResponse.json({ error: 'Invalid report' }, { status: 413 });
  let report; try { report = validateReport(JSON.parse(body)); } catch { report = null; }
  if (!report) return NextResponse.json({ error: 'Choose a supported report reason.' }, { status: 400 });
  const station = await fetchStationByUuid(report.stationId).catch(() => null);
  if (!station) return NextResponse.json({ error: 'Station not found' }, { status: 404 });
  try {
    const accepted = await database<boolean>('rpc/submit_station_report', {}, { method: 'POST', body: JSON.stringify({ p_station_uuid: station.station_uuid, p_reason: report.reason, p_reporter_hash: reporterHash(request) }) });
    return NextResponse.json({ message: accepted ? 'Thank you. Your report is awaiting review.' : 'A report was already received recently. Please try later.' }, { status: accepted ? 201 : 429 });
  } catch { return NextResponse.json({ error: 'Reporting is temporarily unavailable.' }, { status: 503 }); }
}
