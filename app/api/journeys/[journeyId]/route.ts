import { NextResponse } from 'next/server';
import { audioJourneys, resolveJourney } from '@/lib/maturity/audio-journeys';
import { canonicalInventory } from '@/lib/maturity/catalog-server';
import { fetchStationByUuid } from '@/lib/stations';
export async function GET(_request: Request, { params }: { params: Promise<{ journeyId: string }> }) {
  const { journeyId } = await params; const journey=audioJourneys.find(item=>item.id===journeyId);
  if(!journey) return NextResponse.json({ error:'Journey not found' },{status:404});
  try { const inventory=await canonicalInventory(); const resolved=resolveJourney(journey, inventory.stations);
    const stops = (await Promise.all(resolved.map(async stop=>({ ...stop, stations:(await Promise.all(stop.stations.map(station=>fetchStationByUuid(station.station_uuid)))).filter(station=>station&&station.is_active) })))).filter(stop=>stop.stations.length);
    return NextResponse.json({ journey, stops }, { headers: { 'Cache-Control':'public, max-age=300' } });
  } catch { return NextResponse.json({ error:'Journey discovery unavailable' },{status:503}); }
}
