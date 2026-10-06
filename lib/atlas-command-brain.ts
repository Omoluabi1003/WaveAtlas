import type { AtlasAssistantAction, AtlasAssistantContext, AtlasAssistantReply } from '@/lib/atlas-assistant';

function clean(value: string) {
  return value.trim().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
}

function stripWakeWords(value: string) {
  return clean(value).replace(/^(?:hey\s+)?(?:atlas|wave\s*atlas|waveatlas)[,\s:-]*/i, '').trim();
}

function isPidgin(value: string) {
  return /\b(?:abeg|wetin|dey|una|make i|make we|no wahala|na\s+which|fit\s+|wahala)\b/i.test(value);
}

function answer(value: string, english: string, pidgin?: string) {
  return isPidgin(value) && pidgin ? pidgin : english;
}

function playTarget(value: string) {
  const patterns = [
    /^(?:please\s+)?(?:tune|tune\s+in|tune\s+into|play|listen|listen\s+to|switch|switch\s+to|change|change\s+to|put\s+me\s+on|take\s+me\s+to)\s+(?:to\s+|into\s+|on\s+)?(.+)$/i,
    /^(?:i\s+want\s+to\s+hear|i\s+want\s+to\s+listen\s+to|let\s+me\s+hear|can\s+you\s+play|could\s+you\s+play|would\s+you\s+play)\s+(.+)$/i,
    /^(?:find|search\s+for|look\s+for)\s+(.+?)\s+(?:and\s+)?(?:play|tune\s+in)$/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim().replace(/\s+(?:station|radio)$/i, '').trim();
  }
  return '';
}

function recentPlace(context: AtlasAssistantContext) {
  const history = context.history || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const text = history[i]?.text || '';
    const match = text.match(/\b(?:in|from|to)\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,3})\b/);
    if (match?.[1]) return match[1];
  }
  return context.station?.city || context.station?.country || '';
}

function stationSummary(context: AtlasAssistantContext) {
  const station = context.station;
  if (!station) return 'No station is selected right now.';
  const place = [station.city || station.state, station.country].filter(Boolean).join(', ');
  const tags = (station.tags || []).slice(0, 3).join(', ');
  const parts = [station.name, place, station.language, tags].filter(Boolean);
  return parts.join(' · ');
}

export function runAtlasCommandBrain(question: string, context: AtlasAssistantContext = {}): AtlasAssistantReply {
  const original = clean(question);
  const utterance = stripWakeWords(original);
  const lower = utterance.toLowerCase();
  if (!utterance) return { answer: 'I’m listening. Tell me a station, place, genre, or playback command.', source: 'waveatlas-local' };

  if (/^(?:pause|stop|hold)(?:\s+(?:the\s+)?(?:radio|station|music|playback))?$/i.test(utterance)) {
    return { answer: answer(original, 'Pausing.', 'I dey pause am.'), action: { type: 'pause' }, source: 'waveatlas-local' };
  }
  if (/^(?:resume|continue|carry\s+on|play\s+again)$/i.test(utterance)) {
    return { answer: answer(original, 'Resuming.', 'Make we continue.'), action: { type: 'resume' }, source: 'waveatlas-local' };
  }
  if (/^(?:mute|silence)(?:\s+it)?$/i.test(utterance)) return { answer: 'Muted.', action: { type: 'volume', value: 0 }, source: 'waveatlas-local' };
  if (/^(?:unmute|full\s+volume|max(?:imum)?\s+volume)$/i.test(utterance)) return { answer: 'Volume up.', action: { type: 'volume', value: 1 }, source: 'waveatlas-local' };
  const volume = lower.match(/(?:set\s+)?volume(?:\s+to|\s+at)?\s+(\d{1,3})\s*(?:percent|%)?/);
  if (volume) return { answer: `Setting volume to ${Math.min(100, Number(volume[1]))} percent.`, action: { type: 'volume', value: Math.min(1, Number(volume[1]) / 100) }, source: 'waveatlas-local' };

  if (/\b(?:what(?:'s| is)\s+playing|which\s+station|what\s+station|where\s+is\s+this\s+station|tell\s+me\s+about\s+(?:this|the)\s+(?:station|signal))\b/i.test(utterance)) {
    return { answer: stationSummary(context), source: 'waveatlas-local' };
  }

  if (/^(?:another|another\s+one|next|something\s+else|give\s+me\s+another|try\s+another)$/i.test(utterance)) {
    const station = context.station;
    const query = [station?.country, station?.tags?.[0], station?.language].filter(Boolean).join(' ') || recentPlace(context) || undefined;
    return { answer: answer(original, 'Finding another signal.', 'Make I find another one.'), action: { type: 'play', ...(query ? { query } : {}), excludeCurrent: true }, source: 'waveatlas-local' };
  }

  const target = playTarget(utterance);
  if (target) {
    return { answer: answer(original, `Tuning to ${target}.`, `Oya, make I tune to ${target}.`), action: { type: 'play', query: target }, source: 'waveatlas-local' };
  }

  const place = utterance.match(/^(?:stations?\s+(?:in|from)|radio\s+(?:in|from)|find\s+(?:me\s+)?(?:a\s+)?station\s+(?:in|from))\s+(.+)$/i)?.[1]?.trim();
  if (place) return { answer: `Searching stations in ${place}.`, action: { type: 'search', query: place }, source: 'waveatlas-local' };

  const mood = utterance.match(/^(?:i(?:'m| am)\s+(?:in\s+the\s+mood\s+for|looking\s+for)|give\s+me|find\s+me|i\s+want)\s+(.+)$/i)?.[1]?.trim();
  if (mood) return { answer: answer(original, `I’ll find ${mood}.`, `Make I find ${mood} for you.`), action: { type: 'play', query: mood }, source: 'waveatlas-local' };

  if (/^(?:open|show)\s+(?:the\s+)?brief$/i.test(utterance)) return { answer: 'Opening the Brief.', action: { type: 'open_brief' }, source: 'waveatlas-local' };
  if (/^(?:open|show)\s+(?:the\s+)?settings$/i.test(utterance)) return { answer: 'Opening settings.', action: { type: 'open_settings' }, source: 'waveatlas-local' };
  if (/^(?:show|switch\s+to|open)\s+(?:the\s+)?map$/i.test(utterance)) return { answer: 'Opening the map.', action: { type: 'switch_view', view: 'map' }, source: 'waveatlas-local' };
  if (/^(?:show|switch\s+to|open)\s+(?:the\s+)?(?:globe|atlas)$/i.test(utterance)) return { answer: 'Opening the globe.', action: { type: 'switch_view', view: 'globe' }, source: 'waveatlas-local' };
  const teleport = utterance.match(/^(?:teleport|take\s+me|go)\s+(?:to\s+)?(.+)$/i)?.[1]?.trim();
  if (teleport) return { answer: `Taking you to ${teleport}.`, action: { type: 'teleport', query: teleport }, source: 'waveatlas-local' };
  if (/^(?:surprise\s+me|wander|take\s+me\s+somewhere)$/i.test(utterance)) return { answer: 'Let’s wander.', action: { type: 'wander' }, source: 'waveatlas-local' };

  if (/\b(?:what can you do|help|commands?)\b/i.test(utterance)) {
    return { answer: 'I can tune to stations by name, frequency, city, country, language or genre, identify the current signal, find another station, control playback and volume, open the Brief, and move around the Atlas.', source: 'waveatlas-local' };
  }

  // A bare radio identity should be treated as an entity, not as chit-chat.
  if (/\b(?:fm|am|radio|\d{2,3}(?:\.\d)?\s*(?:fm|am)?)\b/i.test(utterance) || /^[A-Za-z0-9'’&.-]+(?:\s+[A-Za-z0-9'’&.-]+){0,5}$/.test(utterance)) {
    return { answer: answer(original, `Looking for ${utterance}.`, `Make I find ${utterance}.`), action: { type: 'play', query: utterance }, source: 'waveatlas-local' };
  }

  return { answer: 'I didn’t map that to a WaveAtlas action yet. Try the station name, frequency, city, country, genre, or tell me what you want the radio to do.', source: 'waveatlas-local' };
}
