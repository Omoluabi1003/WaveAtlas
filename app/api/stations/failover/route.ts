import { NextResponse } from 'next/server';
import { database, databaseConfigured } from '@/lib/maturity/server-data';
import { readEndpointToken, reporterHash, sameOrigin } from '@/lib/maturity/security';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  if (!databaseConfigured()) return new NextResponse(null, { status: 503 });
  const body = await request.text(); if (body.length > 4096) return new NextResponse(null, { status: 413 });
  let data; try { data = JSON.parse(body); } catch { return new NextResponse(null, { status: 400 }); }
  const endpoint = typeof data.token === 'string' ? readEndpointToken(data.token, process.env.SUPABASE_SERVICE_ROLE_KEY!) : null;
  if (!endpoint || !['success','failure','recovered'].includes(data.outcome)) return new NextResponse(null, { status: 400 });
  try { await database('rpc/record_station_failover', {}, { method: 'POST', body: JSON.stringify({ p_station_uuid: endpoint.stationId, p_endpoint: endpoint.url, p_outcome: data.outcome, p_reporter_hash: reporterHash(request) }) }); return new NextResponse(null, { status: 204 }); }
  catch { return new NextResponse(null, { status: 503 }); }
}
