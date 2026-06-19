import { NextResponse } from 'next/server';
import { fetchStations } from '@/lib/stations';
export async function GET(){ const stations=(await fetchStations({ limit:'48', allowFallback:'true' })).filter(s=>s.is_active && s.failure_count < 3).sort((a,b)=>b.health_score-a.health_score); return NextResponse.json({ stations }); }
