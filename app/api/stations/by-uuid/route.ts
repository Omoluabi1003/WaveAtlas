import { NextRequest, NextResponse } from 'next/server';
import { fetchStationByUuid } from '@/lib/stations';

export async function GET(req: NextRequest) {
  const stationUuid = (req.nextUrl.searchParams.get('station_uuid') ?? req.nextUrl.searchParams.get('uuid') ?? '').trim();
  if (!stationUuid) {
    return NextResponse.json({ error: 'station_uuid is required' }, { status: 400 });
  }

  const station = await fetchStationByUuid(stationUuid);
  if (!station || station.station_uuid !== stationUuid) {
    return NextResponse.json({ error: 'Station unavailable or moved', station_uuid: stationUuid }, { status: 404 });
  }

  return NextResponse.json({ station, source: 'station_uuid', station_uuid: stationUuid });
}
