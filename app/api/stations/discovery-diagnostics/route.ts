import { NextRequest, NextResponse } from 'next/server';
import { runGlobalRadioSourceExpansion } from '@/lib/source-connectors';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const result = await runGlobalRadioSourceExpansion({
    query: searchParams.get('q') ?? undefined,
    countryCode: searchParams.get('countryCode') ?? undefined,
    genre: searchParams.get('genre') ?? undefined,
    limitPerSource: Number(searchParams.get('limitPerSource') ?? '10'),
    validate: searchParams.get('validate') !== 'false',
  });
  return NextResponse.json({
    sourcePriority: result.sourcePriority,
    diagnostics: result.diagnostics,
    station_count: result.stations.length,
    stations: result.stations,
  });
}
