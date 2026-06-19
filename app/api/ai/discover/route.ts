import { NextRequest, NextResponse } from 'next/server';
import { discoverIntent, fetchStations } from '@/lib/stations';
export async function POST(req: NextRequest){ const { query } = await req.json(); if(typeof query !== 'string') return NextResponse.json({ error:'query is required' }, { status:400 }); const filters=discoverIntent(query); const stations=await fetchStations({ ...filters, limit:'20' }); return NextResponse.json({ filters, stations }); }
