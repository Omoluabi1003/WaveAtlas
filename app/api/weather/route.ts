import { NextRequest, NextResponse } from 'next/server';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

function finite(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function weatherCodeLabel(code?: number) {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code ?? -1)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code ?? -1)) return 'Rain';
  if ([71, 73, 75, 77].includes(code ?? -1)) return 'Snow';
  if ([80, 81, 82].includes(code ?? -1)) return 'Rain showers';
  if ([85, 86].includes(code ?? -1)) return 'Snow showers';
  if ([95, 96, 99].includes(code ?? -1)) return 'Thunderstorm';
  return 'Weather conditions';
}

export async function GET(request: NextRequest) {
  const latitude = finite(request.nextUrl.searchParams.get('lat'));
  const longitude = finite(request.nextUrl.searchParams.get('lng'));
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ ok: false, error: 'Verified destination coordinates are unavailable.' }, { status: 422 });
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1',
  });

  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(4500),
      next: { revalidate: 600 },
      headers: { 'User-Agent': 'WaveAtlas/1.0' },
    });
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
    const payload = await response.json() as {
      current?: {
        time?: string;
        temperature_2m?: number;
        relative_humidity_2m?: number;
        apparent_temperature?: number;
        precipitation?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
      timezone?: string;
    };
    const current = payload.current;
    if (!current || typeof current.temperature_2m !== 'number') throw new Error('No current weather returned');

    return NextResponse.json({
      ok: true,
      weather: {
        observedAt: current.time,
        timezone: payload.timezone,
        condition: weatherCodeLabel(current.weather_code),
        temperatureC: current.temperature_2m,
        apparentTemperatureC: current.apparent_temperature,
        humidityPercent: current.relative_humidity_2m,
        precipitationMm: current.precipitation,
        windSpeedKmh: current.wind_speed_10m,
        highC: payload.daily?.temperature_2m_max?.[0],
        lowC: payload.daily?.temperature_2m_min?.[0],
        precipitationProbabilityPercent: payload.daily?.precipitation_probability_max?.[0],
      },
      source: {
        name: 'Open-Meteo',
        attribution: 'Open-Meteo Best Match forecast',
        url: 'https://open-meteo.com/',
      },
    }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } });
  } catch {
    return NextResponse.json({
      ok: false,
      error: 'Verified destination weather is temporarily unavailable.',
      source: { name: 'Open-Meteo', attribution: 'Open-Meteo Best Match forecast', url: 'https://open-meteo.com/' },
    }, { status: 503 });
  }
}
