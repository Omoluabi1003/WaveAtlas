import { NextRequest, NextResponse } from 'next/server';
import { searchCountries } from '@/lib/stations';
export async function GET(req: NextRequest){ const countries=await searchCountries(req.nextUrl.searchParams.get('q')??''); return NextResponse.json({ countries }); }
