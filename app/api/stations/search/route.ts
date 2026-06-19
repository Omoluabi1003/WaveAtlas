import { NextRequest, NextResponse } from 'next/server';
import { fetchStations } from '@/lib/stations';
export async function GET(req: NextRequest){ const p=req.nextUrl.searchParams; const stations=await fetchStations({ country:p.get('country')??undefined, language:p.get('language')??undefined, tag:p.get('tag')??p.get('genre')??undefined, name:p.get('name')??undefined, limit:p.get('limit')??'36' }); return NextResponse.json({ stations }); }
