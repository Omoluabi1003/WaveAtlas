import { NextRequest, NextResponse } from 'next/server';
import { fetchGlobalCandidateStations, type Station } from '@/lib/stations';

type Alternative = { transcript?: string; confidence?: number };
type Candidate = { station: Station; score: number; transcript: string; target: string; confidence: number };

function normalize(value = '') {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/\b(?:eff\s*em|f\s*m)\b/g, ' fm ').replace(/\b(?:ay\s*em|a\s*m)\b/g, ' am ').replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function targetFromSpeech(value = '') {
  return value.trim()
    .replace(/^(?:hey\s+)?(?:atlas|wave\s*atlas|waveatlas)[,\s]+/i, '')
    .replace(/^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?/i, '')
    .replace(/^(?:play|tune(?:\s+me|\s+us)?(?:\s+in)?(?:\s+to|\s+into)?|listen(?:\s+to)?|switch(?:\s+me|\s+us)?\s+to|change(?:\s+the\s+station)?\s+to|put(?:\s+me|\s+us)?\s+on|find|search(?:\s+for)?|look\s+for)\s+/i, '')
    .replace(/\s+(?:station|radio)$/i, '').trim();
}

function editSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]; previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function phonetic(value: string) {
  return normalize(value)
    .replace(/ph/g, 'f').replace(/ght/g, 't').replace(/ck/g, 'k').replace(/qu/g, 'kw')
    .replace(/sh/g, 's').replace(/ch/g, 'c').replace(/th/g, 't').replace(/dg/g, 'j')
    .replace(/([a-z])\1+/g, '$1')
    .split(' ')
    .map((word) => word.length <= 2 ? word : word[0] + word.slice(1).replace(/[aeiouy]/g, ''))
    .join(' ');
}

function tokenScore(a: string, b: string) {
  const aa = new Set(a.split(' ').filter(Boolean)); const bb = new Set(b.split(' ').filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let overlap = 0; for (const token of aa) if (bb.has(token)) overlap += 1;
  return (2 * overlap) / (aa.size + bb.size);
}

function frequencyBonus(target: string, name: string) {
  const spoken = target.match(/\b(\d{2,3}(?:\.\d)?)\b/)?.[1];
  if (!spoken) return 0;
  return name.includes(spoken) ? 0.18 : -0.03;
}

function scoreStation(station: Station, rawTarget: string, rawTranscript: string, confidence: number) {
  const target = normalize(rawTarget); const name = normalize(station.name);
  if (!target || !name) return 0;
  const lexical = editSimilarity(target, name);
  const sounds = editSimilarity(phonetic(target), phonetic(name));
  const tokens = tokenScore(target, name);
  let score = lexical * 0.34 + sounds * 0.34 + tokens * 0.20 + Math.min(1, Math.max(0, confidence)) * 0.05;
  if (name === target) score += 0.42;
  else if (name.startsWith(target) || target.startsWith(name)) score += 0.22;
  else if (name.includes(target) || target.includes(name)) score += 0.12;
  score += frequencyBonus(target, name);
  const transcript = normalize(rawTranscript);
  if (station.city && transcript.includes(normalize(station.city))) score += 0.09;
  if (station.country && transcript.includes(normalize(station.country))) score += 0.08;
  if (/\bfm\b/.test(target) === /\bfm\b/.test(name)) score += 0.03;
  if (station.is_active) score += 0.03;
  if (station.curation_tier === 'curated_atlas') score += 0.06;
  return score;
}

function canonicalCommand(original: string, stationName: string) {
  const value = original.trim();
  if (/\btune\b/i.test(value)) return `tune to ${stationName}`;
  if (/\blisten\b/i.test(value)) return `listen to ${stationName}`;
  if (/\b(?:switch|change)\b/i.test(value)) return `switch to ${stationName}`;
  if (/\bput\b/i.test(value)) return `put me on ${stationName}`;
  if (/\bplay\b/i.test(value)) return `play ${stationName}`;
  if (/\b(?:find|search|look)\b/i.test(value)) return `find ${stationName}`;
  return stationName;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const alternatives = (Array.isArray(body?.alternatives) ? body.alternatives : [])
      .filter((item: Alternative) => typeof item?.transcript === 'string' && item.transcript.trim())
      .slice(0, 8) as Alternative[];
    if (!alternatives.length) return NextResponse.json({ transcript: '', resolved: false });

    // Fresh design: compare against a broad cached Atlas catalog. The previous resolver
    // searched Radio Browser using the misheard text first, which meant the correct
    // station often never entered the candidate set and therefore could not be recovered.
    const catalog = await fetchGlobalCandidateStations(1800);
    const ranked: Candidate[] = [];
    alternatives.forEach((alternative, index) => {
      const transcript = String(alternative.transcript).trim();
      const target = targetFromSpeech(transcript);
      if (!target || target.length < 2) return;
      const confidence = Number.isFinite(alternative.confidence) ? Number(alternative.confidence) : Math.max(0.3, 0.76 - index * 0.06);
      for (const station of catalog) {
        const score = scoreStation(station, target, transcript, confidence);
        if (score >= 0.38) ranked.push({ station, score, transcript, target, confidence });
      }
    });
    ranked.sort((a, b) => b.score - a.score || b.station.votes - a.station.votes);
    const best = ranked[0];
    const runnerUp = ranked.find((item) => item.station.station_uuid !== best?.station.station_uuid);
    const margin = best ? best.score - (runnerUp?.score ?? 0) : 0;
    const safe = Boolean(best && best.score >= 0.64 && (best.score >= 0.88 || margin >= 0.045));
    if (!safe || !best) return NextResponse.json({ transcript: alternatives[0].transcript, resolved: false, confidence: alternatives[0].confidence ?? null });

    return NextResponse.json({
      transcript: canonicalCommand(best.transcript, best.station.name), resolved: true, confidence: Math.min(1, best.score),
      station: { name: best.station.name, city: best.station.city ?? best.station.state ?? '', country: best.station.country, countryCode: best.station.country_code, stationUuid: best.station.station_uuid },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'speech resolution failed' }, { status: 500 });
  }
}
