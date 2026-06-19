import { NextRequest, NextResponse } from 'next/server';
import { validateStream } from '@/lib/stations';
export async function POST(req: NextRequest){ const { url } = await req.json(); if(typeof url !== 'string') return NextResponse.json({ error:'url is required' }, { status:400 }); return NextResponse.json(await validateStream(url)); }
