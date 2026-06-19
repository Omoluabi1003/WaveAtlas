import { NextResponse } from 'next/server';
import { fetchStations } from '@/lib/stations';
export async function GET(){ const stations=(await fetchStations({ limit:'24' })).sort((a,b)=>(b.click_count+b.votes)-(a.click_count+a.votes)); return NextResponse.json({ stations }); }
