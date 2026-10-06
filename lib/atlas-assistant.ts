import type { Station } from '@/lib/stations';

export type AtlasAssistantContext = {
  station?: Pick<Station, 'name' | 'country' | 'country_code' | 'state' | 'language' | 'tags' | 'codec' | 'bitrate'> | null;
};

export type AtlasAssistantAction =
  | { type: 'search'; query: string }
  | { type: 'play'; query?: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'volume'; value: number }
  | { type: 'teleport'; query?: string }
  | { type: 'wander'; query?: string }
  | { type: 'switch_view'; view: 'map' | 'globe' }
  | { type: 'open_settings' }
  | { type: 'open_brief' };

export type AtlasAssistantReply = {
  answer: string;
  action?: AtlasAssistantAction;
  source: 'waveatlas-local';
};

const clean = (value?: string | null) => value?.trim() || '';
const cleanTags = (value?: string[] | string | null) => Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean).join(', ') : clean(value);
const reply = (answer: string, action?: AtlasAssistantAction): AtlasAssistantReply => ({ answer, ...(action ? { action } : {}), source: 'waveatlas-local' });

function commandReply(q: string, lower: string): AtlasAssistantReply | null {
  if (/^(?:please\s+)?(?:pause|stop)(?:\s+(?:the\s+)?(?:radio|station|music|playback))?\s*$/i.test(q)) return reply('Pausing the signal.', { type: 'pause' });
  if (/^(?:please\s+)?(?:resume|continue|unpause)(?:\s+(?:the\s+)?(?:radio|station|music|playback))?\s*$/i.test(q)) return reply('Resuming the signal.', { type: 'resume' });
  if (/\b(?:mute|silence)(?:\s+(?:the\s+)?(?:radio|station|music|playback))?\b/i.test(q)) return reply('Muting WaveAtlas.', { type: 'volume', value: 0 });
  const volume = lower.match(/(?:set\s+)?volume(?:\s+to|\s+at)?\s+(\d{1,3})\s*(?:percent|%)?/i);
  if (volume) {
    const value = Math.min(100, Math.max(0, Number(volume[1]))) / 100;
    return reply(`Setting volume to ${Math.round(value * 100)} percent.`, { type: 'volume', value });
  }
  if (/\b(?:volume up|louder|turn it up)\b/i.test(q)) return reply('Turning the signal up.', { type: 'volume', value: 1 });
  if (/\b(?:volume down|quieter|turn it down)\b/i.test(q)) return reply('Turning the signal down.', { type: 'volume', value: 0.35 });
  if (/\b(?:open|show|switch to|go to)\s+(?:the\s+)?(?:map|map view|2d|2 d)\b/i.test(q)) return reply('Opening the map.', { type: 'switch_view', view: 'map' });
  if (/\b(?:open|show|switch to|go to)\s+(?:the\s+)?(?:atlas|globe|globe view|earth)\b/i.test(q)) return reply('Opening the Atlas globe.', { type: 'switch_view', view: 'globe' });
  if (/\b(?:open|show|go to)\s+(?:the\s+)?(?:settings|controls)\b/i.test(q)) return reply('Opening settings.', { type: 'open_settings' });
  if (/\b(?:open|show|read)\s+(?:the\s+)?(?:brief|news|daily brief)\b/i.test(q)) return reply('Opening the WaveAtlas Brief.', { type: 'open_brief' });
  if (/\b(?:surprise me|wander|take me somewhere random|take me somewhere surprising)\b/i.test(q)) return reply('Let’s go somewhere unexpected.', { type: 'wander', query: q });
  const teleport = q.match(/^(?:please\s+)?teleport(?:\s+me)?(?:\s+to)?\s*(.*)$/i);
  if (teleport) {
    const query = teleport[1]?.trim();
    return reply(query ? `Teleporting toward ${query}.` : 'Teleporting somewhere new.', { type: 'teleport', ...(query ? { query } : {}) });
  }
  const play = q.match(/^(?:please\s+)?(?:play|tune(?:\s+me)?(?:\s+to)?|put on)\s+(.+)$/i);
  if (play?.[1]) {
    const query = play[1].replace(/\s+radio$/i, '').trim();
    return reply(`Tuning the Atlas to ${query}.`, { type: 'play', query });
  }
  const navigate = q.match(/^(?:please\s+)?(?:take me to|go to)\s+(.+)$/i);
  if (navigate?.[1]) {
    const query = navigate[1].trim();
    return reply(`Taking you to ${query}.`, { type: 'play', query });
  }
  const search = q.match(/^(?:please\s+)?(?:find|search(?:\s+for)?|show me|stations in)\s+(.+)$/i);
  if (search?.[1]) {
    const query = search[1].trim();
    return reply(`Searching the Atlas for ${query}.`, { type: 'search', query });
  }
  return null;
}

export function answerAtlasQuestion(question: string, context: AtlasAssistantContext = {}): AtlasAssistantReply {
  const q = question.trim();
  const lower = q.toLowerCase();
  const station = context.station;
  const name = clean(station?.name) || 'this station';
  const country = clean(station?.country);
  const region = clean(station?.state);
  const language = clean(station?.language);
  const tags = cleanTags(station?.tags);

  if (!q) return reply('Ask me about this signal, or tell me where you want to go.');
  const command = commandReply(q, lower);
  if (command) return command;
  if (!station) return reply('Choose a signal first, or tell me what to play. Try “play jazz in Lagos,” “take me to Congo,” or “surprise me.”');

  if (/what.*listening|what station|which station|who.*listening/.test(lower)) {
    const place = [region, country].filter(Boolean).join(', ');
    return reply(`You’re listening to ${name}${place ? ` from ${place}` : ''}${language ? `. It is tagged for ${language}` : ''}.`);
  }
  if (/where|country|city|location|from/.test(lower)) {
    const place = [region, country].filter(Boolean).join(', ');
    return reply(place ? `${name} is associated with ${place}.` : `I don’t yet have a verified location for ${name}.`);
  }
  if (/language|speaking|speak/.test(lower)) {
    return reply(language ? `${name} is tagged for ${language}.` : `I don’t yet have a verified language tag for ${name}.`);
  }
  if (/genre|music|kind|style|format/.test(lower)) {
    return reply(tags ? `${name} is tagged with ${tags}.` : `I don’t yet have reliable format tags for ${name}.`);
  }
  if (/bitrate|codec|quality|stream/.test(lower)) {
    const details = [clean(station.codec), station.bitrate ? `${station.bitrate} kbps` : ''].filter(Boolean).join(' at ');
    return reply(details ? `${name} is catalogued as ${details}.` : `I haven’t verified the technical stream details for ${name} yet.`);
  }
  if (/another|similar|something else|change station/.test(lower)) {
    const query = [country, tags.split(',')[0]].filter(Boolean).join(' ');
    return reply('I’ll find another signal with a similar feel.', { type: 'play', query: query || undefined });
  }

  return reply(`You’re with ${name}${country ? ` in ${country}` : ''}. Ask me about this signal, say “play another station,” “take me to Accra,” “open the map,” “pause,” or “surprise me.”`);
}
