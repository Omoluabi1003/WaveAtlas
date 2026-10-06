import { NextResponse } from 'next/server';
import { fetchGlobalCandidateStations } from '@/lib/stations';

export async function GET() {
  try {
    const stations = await fetchGlobalCandidateStations(900);
    const phrases = Array.from(new Set(stations.flatMap((station) => [station.name, station.city, station.country]).filter((value): value is string => Boolean(value?.trim())))).slice(0, 700);
    return NextResponse.json({ phrases }, { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' } });
  } catch {
    return NextResponse.json({ phrases: ['WaveAtlas', 'Premier FM', 'Wazobia FM', 'Agidigbo FM', 'Radio Nigeria'] });
  }
}
