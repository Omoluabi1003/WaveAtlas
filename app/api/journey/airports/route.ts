import { NextRequest, NextResponse } from 'next/server';
import { airportsForCountry, loadAirportCountries } from '@/lib/ourairports';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country')?.trim().toUpperCase();
  try {
    if (country) {
      if (!/^[A-Z]{2}$/.test(country)) {
        return NextResponse.json({ error: 'Invalid country code', airports: [] }, { status: 400 });
      }
      const airports = await airportsForCountry(country);
      return NextResponse.json({ airports }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
    }

    const countries = await loadAirportCountries();
    return NextResponse.json({ countries }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
  } catch {
    return NextResponse.json({ error: 'Airport catalog unavailable', countries: [], airports: [] }, { status: 503 });
  }
}
