import { NextRequest, NextResponse } from 'next/server';
import { fetchStationByUuid } from '@/lib/stations';
import { backendConfigured, maturityQuery } from '@/lib/maturity-backend';
import { canonicalStreamCandidates, rankStreamCandidates, type StreamCandidate } from '@/lib/stream-failover';
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('station');
  if (!id || !/^[\w-]{1,200}$/.test(id)) return NextResponse.json({ error: 'Invalid station' }, { status: 400 });
  const station = await fetchStationByUuid(id).catch(() => null);
  if (!station) return NextResponse.json({ candidates: [] }, { status: 404 });
  const candidates = canonicalStreamCandidates(station);
  if (backendConfigured()) {
    const key = encodeURIComponent(station.station_uuid);
    const [sources, evidence, health] = await Promise.all([
      maturityQuery<Array<{ url: string; source_weight: number; raw_payload: { streamHealthy?: boolean; healthScore?: number } }>>(`station_sources?station_uuid=eq.${key}&select=url,source_weight,raw_payload&limit=30`).catch(() => []),
      maturityQuery<Array<{ raw_stream_url: string; evidence_confidence: number; source_name: string }>>(`station_source_evidence?station_uuid=eq.${key}&evidence_confidence=gte.0.75&select=raw_stream_url,evidence_confidence,source_name&limit=30`).catch(() => []),
      maturityQuery<Array<{ stream_url: string; status: string; checked_at: string }>>(`station_health?station_uuid=eq.${key}&select=stream_url,status,checked_at&order=checked_at.desc&limit=100`).catch(() => []),
    ]);
    const verified = (url: string) => health.find(row => row.stream_url === url);
    for (const row of [...sources.map(row => ({ url: row.url, confidence: row.source_weight, authority: row.source_weight })), ...evidence.map(row => ({ url: row.raw_stream_url, confidence: row.evidence_confidence, authority: row.source_name === 'curated' ? 1 : .8 }))]) {
      const check = verified(row.url), age = check ? Date.now() - Date.parse(check.checked_at) : Infinity;
      if (check?.status === 'ok' && age >= 0 && age < 48 * 3600000) candidates.push({ ...row, verified: true, health: 90, lastSuccessAt: Date.parse(check.checked_at) } satisfies StreamCandidate);
    }
  }
  return NextResponse.json({ stationId: station.station_uuid, candidates: rankStreamCandidates(candidates) }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
