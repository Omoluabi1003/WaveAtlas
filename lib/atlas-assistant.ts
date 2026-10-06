import type { Station } from '@/lib/stations';

export type AtlasConversationLine = { role: 'user' | 'atlas'; text: string };

export type AtlasAssistantContext = {
  station?: Pick<Station, 'name' | 'country' | 'country_code' | 'city' | 'state' | 'language' | 'tags' | 'codec' | 'bitrate'> | null;
  history?: AtlasConversationLine[];
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

export type AtlasActionResult = {
  ok: boolean;
  status: 'completed' | 'playing' | 'connecting' | 'already_playing' | 'not_found' | 'failed';
  station?: Pick<Station, 'name' | 'country' | 'city' | 'state' | 'station_uuid' | 'id'>;
  message?: string;
  terminal?: boolean;
};

export type AtlasAssistantReply = {
  answer: string;
  action?: AtlasAssistantAction;
  source: 'waveatlas-local';
};

const clean = (value?: string | null) => value?.trim() || '';
const cleanTags = (value?: string[] | string | null) => Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean).join(', ') : clean(value);
const reply = (answer: string, action?: AtlasAssistantAction): AtlasAssistantReply => ({ answer, ...(action ? { action } : {}), source: 'waveatlas-local' });

function naturalCommand(question: string) {
  return question.trim()
    .replace(/^(?:hey\s+)?atlas[,:]?\s*/i, '')
    .replace(/^(?:(?:can|could|would|will)\s+you\s+|please\s+)/i, '')
    .trim();
}

function previousUserIntent(history?: AtlasConversationLine[]) {
  return [...(history || [])].reverse().find((line) => line.role === 'user')?.text || '';
}

function commandReply(q: string): AtlasAssistantReply | null {
  const lower = q.toLowerCase();
  if (/^(?:pause|stop)(?:\s+(?:the\s+)?(?:radio|station|music|playback))?\s*$/i.test(q)) return reply('Pausing the signal.', { type: 'pause' });
  if (/^(?:resume|continue|unpause)(?:\s+(?:the\s+)?(?:radio|station|music|playback))?\s*$/i.test(q)) return reply('Resuming the signal.', { type: 'resume' });
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
  if (/\b(?:surprise me|wander|take me somewhere random|take me somewhere surprising|something unexpected)\b/i.test(q)) return reply('Let’s go somewhere unexpected.', { type: 'wander', query: q });

  const teleport = q.match(/^teleport(?:\s+me)?(?:\s+to)?\s*(.*)$/i);
  if (teleport) {
    const query = teleport[1]?.trim();
    return reply(query ? `Teleporting toward ${query}.` : 'Teleporting somewhere new.', { type: 'teleport', ...(query ? { query } : {}) });
  }
  const play = q.match(/^(?:play|tune(?:\s+me)?(?:\s+to)?|put on|i(?:'d| would)? like to hear|i want to hear|let me hear)\s+(.+)$/i);
  if (play?.[1]) {
    const query = play[1].replace(/\s+radio$/i, '').trim();
    return reply(`I’ll find the strongest match for ${query}.`, { type: 'play', query });
  }
  const navigate = q.match(/^(?:take me to|go to|take us to|let(?:'s| us) go to)\s+(.+)$/i);
  if (navigate?.[1]) {
    const query = navigate[1].trim();
    return reply(`Taking you to ${query}.`, { type: 'play', query });
  }
  const search = q.match(/^(?:find|search(?:\s+for)?|show me|give me|stations? in|stations? from)\s+(.+)$/i);
  if (search?.[1]) {
    const query = search[1].trim();
    return reply(`Searching the Atlas for ${query}.`, { type: 'search', query });
  }
  return null;
}

export function answerAtlasQuestion(question: string, context: AtlasAssistantContext = {}): AtlasAssistantReply {
  const q = naturalCommand(question);
  const lower = q.toLowerCase();
  const station = context.station;
  const previous = previousUserIntent(context.history);
  const name = clean(station?.name) || 'this station';
  const country = clean(station?.country);
  const city = clean(station?.city);
  const region = clean(station?.state);
  const language = clean(station?.language);
  const tags = cleanTags(station?.tags);
  const primaryTag = tags.split(',')[0]?.trim();
  const place = [city || region, country].filter(Boolean).join(', ');

  if (!q) return reply('I’m listening. Ask about this signal or tell me where you want to go.');
  if (/^(?:hi|hello|hey|good (?:morning|afternoon|evening))\b/i.test(q)) return reply(`Hello. ${station ? `We’re on ${name}${place ? ` from ${place}` : ''}.` : 'Where should we listen today?'}`);
  if (/^(?:thanks|thank you|nice|perfect|great)\b/i.test(q)) return reply('You’re welcome. I’m listening.');
  if (/what can you do|how can you help|what do you do|your capabilities/.test(lower)) return reply('I can identify and explain the current signal, find and play stations by place, language or style, move around the Atlas, control playback, open the Brief, and keep a conversation going while you listen.');

  if (/^(?:yes|yeah|yep|do it|go ahead|another|another one|something else)$/i.test(q) && station) {
    const query = [country, primaryTag].filter(Boolean).join(' ');
    return reply(`I’ll keep the thread and find another ${primaryTag || 'signal'}${country ? ` from ${country}` : ''}.`, { type: 'play', query: query || undefined });
  }

  const command = commandReply(q);
  if (command) return command;

  if (!station) {
    if (/^(?:there|that place|same place)$/i.test(q) && previous) {
      const priorDestination = naturalCommand(previous).match(/(?:to|in|from)\s+(.+)$/i)?.[1]?.trim();
      if (priorDestination) return reply(`Staying with ${priorDestination}.`, { type: 'play', query: priorDestination });
    }
    return reply('I don’t have a live signal selected yet. Tell me naturally what you want, for example “I want to hear jazz from Lagos,” “take me to Congo,” or “surprise me.”');
  }

  if (/what.*listening|what station|which station|who.*listening|identify.*station|tell me about (?:this|the) station|tell me about (?:this|the) signal/.test(lower)) {
    const details = [place ? `from ${place}` : '', language ? `in ${language}` : '', primaryTag ? `with ${primaryTag} programming` : ''].filter(Boolean).join(', ');
    return reply(`You’re listening to ${name}${details ? `, ${details}` : ''}.`);
  }
  if (/where|country|city|location|where.*from/.test(lower)) return reply(place ? `${name} is associated with ${place}.` : `I don’t yet have a verified location for ${name}.`);
  if (/language|speaking|what.*speak/.test(lower)) return reply(language ? `${name} is tagged for ${language}.` : `I don’t yet have a verified language tag for ${name}.`);
  if (/genre|music|kind|style|format|what.*play/.test(lower)) return reply(tags ? `${name} is tagged with ${tags}.` : `I don’t yet have reliable format tags for ${name}.`);
  if (/bitrate|codec|quality|stream/.test(lower)) {
    const details = [clean(station.codec), station.bitrate ? `${station.bitrate} kbps` : ''].filter(Boolean).join(' at ');
    return reply(details ? `${name} is catalogued as ${details}.` : `I haven’t verified the technical stream details for ${name} yet.`);
  }
  if (/another|similar|something else|change station|same kind|same vibe|more like this/.test(lower)) {
    const query = [country, primaryTag].filter(Boolean).join(' ');
    return reply(`I’ll keep the ${primaryTag || 'current'} feel${country ? ` around ${country}` : ''} and find another signal.`, { type: 'play', query: query || undefined });
  }
  if (/^(?:there|same place|that country|around there)$/i.test(q)) {
    const query = country || city || region;
    return query ? reply(`I’ll stay around ${query}.`, { type: 'search', query }) : reply('I need a verified location before I can stay in the same area.');
  }

  return reply(`I understood the words, but I don’t have enough verified Atlas context to answer that reliably. I can still act on stations, places, languages, styles, playback, the map, and the Brief. Try phrasing the destination or listening goal directly.`);
}
