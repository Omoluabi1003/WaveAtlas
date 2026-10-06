import type { Station } from '@/lib/stations';

export type AtlasAssistantContext = {
  station?: Pick<Station, 'name' | 'country' | 'country_code' | 'state' | 'language' | 'tags' | 'codec' | 'bitrate'> | null;
};

export type AtlasAssistantReply = {
  answer: string;
  action?: { type: 'search'; query: string };
  source: 'waveatlas-local';
};

const clean = (value?: string | null) => value?.trim() || '';

export function answerAtlasQuestion(question: string, context: AtlasAssistantContext = {}): AtlasAssistantReply {
  const q = question.trim();
  const lower = q.toLowerCase();
  const station = context.station;
  const name = clean(station?.name) || 'this station';
  const country = clean(station?.country);
  const region = clean(station?.state);
  const language = clean(station?.language);
  const tags = clean(station?.tags);

  if (!q) return { answer: 'Ask me about the station, its country, language, genre, or where you want to listen next.', source: 'waveatlas-local' };
  if (!station) return { answer: 'Choose a station first, then I can respond using its live WaveAtlas context. You can also ask me to find a country, city, genre, or station.', source: 'waveatlas-local' };

  if (/where|country|city|location|from/.test(lower)) {
    const place = [region, country].filter(Boolean).join(', ');
    return { answer: place ? `${name} is associated with ${place}.` : `WaveAtlas does not yet have a verified location for ${name}.`, source: 'waveatlas-local' };
  }
  if (/language|speaking|speak/.test(lower)) {
    return { answer: language ? `${name} is tagged for ${language}.` : `WaveAtlas does not yet have a verified language tag for ${name}.`, source: 'waveatlas-local' };
  }
  if (/genre|music|kind|style|format/.test(lower)) {
    return { answer: tags ? `${name} is tagged with ${tags}.` : `WaveAtlas does not yet have reliable format tags for ${name}.`, source: 'waveatlas-local' };
  }
  if (/bitrate|codec|quality|stream/.test(lower)) {
    const details = [clean(station.codec), station.bitrate ? `${station.bitrate} kbps` : ''].filter(Boolean).join(' at ');
    return { answer: details ? `${name} is currently catalogued as ${details}.` : `WaveAtlas has not verified technical stream details for ${name} yet.`, source: 'waveatlas-local' };
  }
  const playMatch = q.match(/(?:play|find|take me to|search for|show me)\s+(.+)/i);
  if (playMatch?.[1]) {
    const query = playMatch[1].trim();
    return { answer: `Searching the Atlas for ${query}.`, action: { type: 'search', query }, source: 'waveatlas-local' };
  }
  if (/what.*listening|what station|who.*listening/.test(lower)) {
    const place = [region, country].filter(Boolean).join(', ');
    return { answer: `You are listening to ${name}${place ? ` from ${place}` : ''}${language ? `. Language tag: ${language}` : ''}.`, source: 'waveatlas-local' };
  }

  return {
    answer: `You are with ${name}${country ? ` in ${country}` : ''}. I can tell you about this signal, its location, language, format and stream, or help you find another place to listen.`,
    source: 'waveatlas-local',
  };
}
