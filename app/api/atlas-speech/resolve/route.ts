import { NextRequest, NextResponse } from 'next/server';
import { fetchStations, type Station } from '@/lib/stations';

type Alternative = { transcript?: string; confidence?: number };
type Candidate = { station: Station; score: number; sourceTranscript: string; target: string; confidence: number };

function normalize(value = '') {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/\b(?:eff\s*em|f\s*m)\b/g, ' fm ').replace(/\b(?:ay\s*em|a\s*m)\b/g, ' am ').replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function spokenTarget(value = '') {
  return value
    .trim()
    .replace(/^(?:hey\s+)?(?:atlas|wave\s*atlas|waveatlas)[,\s]+/i, '')
    .replace(/^(?:please\s+)?(?:play|tune(?:\s+in)?(?:\s+to)?|listen(?:\s+to)?|switch(?:\s+to)?|change(?:\s+to)?|put\s+me\s+on|find|search(?:\s+for)?|look\s+for)\s+/i, '')
    .replace(/\s+(?:station|radio)$/i, '')
    .trim();
}

function editSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function tokenScore(a: string, b: string) {
  const aa = new Set(a.split(' ').filter(Boolean));
  const bb = new Set(b.split(' ').filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap += 1;
  return (2 * overlap) / (aa.size + bb.size);
}

function stationScore(station: Station, rawTarget: string, rawTranscript: string, confidence: number) {
  const target = normalize(rawTarget);
  const name = normalize(station.name);
  if (!target || !name) return 0;
  let score = editSimilarity(target, name) * 0.52 + tokenScore(target, name) * 0.34 + Math.min(1, Math.max(0, confidence)) * 0.08;
  if (name === target) score += 0.36;
  else if (name.startsWith(target) || target.startsWith(name)) score += 0.20;
  else if (name.includes(target) || target.includes(name)) score += 0.13;
  const transcript = normalize(rawTranscript);
  if (station.city && transcript.includes(normalize(station.city))) score += 0.08;
  if (station.country && transcript.includes(normalize(station.country))) score += 0.08;
  if (station.country_code && transcript.split(' ').includes(station.country_code.toLowerCase())) score += 0.04;
  if (/\b(?:fm|am)\b/.test(target) && /\b(?:fm|am)\b/.test(name)) score += 0.06;
  if (station.is_active) score += 0.03;
  return score;
}

function canonicalCommand(original: string, stationName: string) {
  const value = original.trim();
  if (/\btune\b/i.test(value)) return `tune to ${stationName}`;
  if (/\blisten\b/i.test(value)) return `listen to ${stationName}`;
  if (/\b(?:switch|change)\b/i.test(value)) return `switch to ${stationName}`;
  if (/\bput\s+me\s+on\b/i.test(value)) return `put me on ${stationName}`;
  if (/\bplay\b/i.test(value)) return `play ${stationName}`;
  if (/\b(?:find|search|look\s+for)\b/i.test(value)) return `find ${stationName}`;
  return stationName;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const alternatives = (Array.isArray(body?.alternatives) ? body.alternatives : [])
      .filter((item: Alternative) => typeof item?.transcript === 'string' && item.transcript.trim())
      .slice(0, 5) as Alternative[];
    if (!alternatives.length) return NextResponse.json({ transcript: '', resolved: false });

    const searches = await Promise.all(alternatives.map(async (alternative, index) => {
      const transcript = String(alternative.transcript).trim();
      const target = spokenTarget(transcript);
      if (!target || target.length < 2) return [] as Candidate[];
      const stations = await fetchStations({ q: target, name: target, limit: '18', allowFallback: 'true' });
      const confidence = Number.isFinite(alternative.confidence) ? Number(alternative.confidence) : Math.max(0.35, 0.72 - index * 0.07);
      return stations.map((station) => ({ station, score: stationScore(station, target, transcript, confidence), sourceTranscript: transcript, target, confidence }));
    }));

    const ranked = searches.flat().sort((a, b) => b.score - a.score || b.station.votes - a.station.votes);
    const best = ranked[0];
    const runnerUp = ranked.find((item) => item.station.station_uuid !== best?.station.station_uuid);
    const margin = best ? best.score - (runnerUp?.score ?? 0) : 0;
    const safeMatch = Boolean(best && best.score >= 0.58 && (best.score >= 0.86 || margin >= 0.035));

    if (!safeMatch || !best) {
      return NextResponse.json({ transcript: alternatives[0].transcript, resolved: false, confidence: alternatives[0].confidence ?? null });
    }

    return NextResponse.json({
      transcript: canonicalCommand(best.sourceTranscript, best.station.name),
      resolved: true,
      confidence: Math.min(1, best.score),
      station: {
        name: best.station.name,
        city: best.station.city ?? best.station.state ?? '',
        country: best.station.country,
        countryCode: best.station.country_code,
        frequency: best.station.name.match(/\b\d{2,3}(?:\.\d)?\s*(?:FM|AM)\b/i)?.[0] ?? null,
      },
    });
  } catch {
    return NextResponse.json({ error: 'speech resolution failed' }, { status: 400 });
  }
}
