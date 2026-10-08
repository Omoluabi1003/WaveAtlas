import { resolveAtlasMusicIntent } from './atlas-music-intent';
import { answerAtlasQuestion, type AtlasAssistantContext, type AtlasAssistantReply } from '@/lib/atlas-assistant';

const PIDGIN = /\b(?:abeg|wetin|dey|wan|make we|na |no be|oya|how far|una|gist|wahala|shey|abi|fit|don|go play|for me)\b/i;
const FALLBACK_PREFIX = 'I understood the words, but I don’t have enough verified Atlas context';

function tidy(value?: string | null) { return value?.trim() || ''; }
function lastUser(context: AtlasAssistantContext) {
  return [...(context.history || [])].reverse().find((line) => line.role === 'user')?.text?.trim() || '';
}
function pidginReply(answer: string) {
  const swaps: Array<[RegExp, string]> = [
    [/I’ll find the strongest match for (.+)\./i, 'Make I find the best signal for $1.'],
    [/Searching the Atlas for (.+)\./i, 'Make I search the Atlas for $1.'],
    [/Taking you to (.+)\./i, 'Oya, make we go $1.'],
    [/Let’s go somewhere unexpected\./i, 'Oya, make Atlas carry us go somewhere unexpected.'],
    [/Pausing the signal\./i, 'No wahala. I don pause the signal.'],
    [/Resuming the signal\./i, 'Oya, the signal don continue.'],
    [/You’re welcome\. I’m listening\./i, 'No wahala. I dey hear you.'],
  ];
  return swaps.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), answer);
}

function conversationalIntent(question: string, context: AtlasAssistantContext): AtlasAssistantReply | null {
  const q = question.trim().replace(/^(?:hey\s+)?atlas[,:]?\s*/i, '').trim();
  const lower = q.toLowerCase();
  const station = context.station;
  const country = tidy(station?.country);
  const city = tidy(station?.city);
  const tags = Array.isArray(station?.tags) ? station.tags.join(' ') : tidy(station?.tags as string | undefined);
  const prior = lastUser(context);

  const mood = lower.match(/(?:i(?:'m| am) (?:in the mood for|feeling like)|give me something|i need something)\s+(.+)/i);
  if (mood?.[1]) return { answer: `I get the mood. I’ll look for a signal around ${mood[1].trim()}.`, action: { type: 'play', query: mood[1].trim() }, source: 'waveatlas-local' };

  const naturalPlace = lower.match(/(?:what(?:'s| is) (?:playing|on)|anything good|what can i hear|find me something|let(?:'s| us) listen to something)\s+(?:in|from|around)\s+(.+)/i);
  if (naturalPlace?.[1]) return { answer: `I’ll explore ${naturalPlace[1].trim()} and put on a strong match.`, action: { type: 'play', query: naturalPlace[1].trim() }, source: 'waveatlas-local' };

  if (/\b(?:keep it there|stay there|same country|same city|around there|from there)\b/i.test(q)) {
    const place = city || country;
    if (place) return { answer: `Got it. I’ll stay around ${place}.`, action: { type: 'play', query: [place, tags.split(/[ ,]/)[0]].filter(Boolean).join(' ') }, source: 'waveatlas-local' };
    const priorPlace = prior.match(/(?:in|from|around|to)\s+([\p{L} .'-]+)$/iu)?.[1]?.trim();
    if (priorPlace) return { answer: `Got it. I’ll keep exploring ${priorPlace}.`, action: { type: 'play', query: priorPlace }, source: 'waveatlas-local' };
  }

  if (/\b(?:why this one|why did you pick|why this station)\b/i.test(q) && station) {
    const reasons = [country && `it is catalogued in ${country}`, tags && `its tags include ${tags}`].filter(Boolean);
    return { answer: reasons.length ? `I picked this signal from verified Atlas metadata: ${reasons.join(', ')}. I won’t invent a reason beyond what the station data supports.` : `I can confirm the station selection, but I don’t have enough verified metadata to claim why it is a better match.`, source: 'waveatlas-local' };
  }

  if (/\b(?:talk to me|what do you think|recommend something|choose for me)\b/i.test(q)) {
    const query = [country, tags.split(/[ ,]/)[0]].filter(Boolean).join(' ');
    return { answer: station ? `I’d keep the thread from ${station.name} but change the signal. Let me find something related without giving you the exact same station.` : `I’ll choose a signal with some character rather than making you specify everything.`, action: { type: 'play', ...(query ? { query } : {}), excludeCurrent: Boolean(station) }, source: 'waveatlas-local' };
  }

  return null;
}

export function answerAtlasIntelligently(question: string, context: AtlasAssistantContext = {}): AtlasAssistantReply {
  const musicIntent = resolveAtlasMusicIntent(question, lastUser(context));
  if (musicIntent) {
    const { music, action, subject } = musicIntent;
    const style = music.genres.join(music.match === 'any' ? ' or ' : ' and ');
    const reference = subject ? `${subject} is associated with ${style}. ` : '';
    if (action === 'explain') return { answer: `${reference || `That is ${style} music. `}I can find radio stations tagged for that style.`, source: 'waveatlas-local' };
    const query = [music.genres.join(' '), music.location].filter(Boolean).join(' ');
    const lead = PIDGIN.test(question) ? 'Make I' : 'I’ll';
    return {
      answer: `${reference}${lead} ${action === 'search' ? 'search for' : 'find'} stations tagged for ${style}${music.location ? ` in ${music.location}` : ''}.${subject ? ' Live radio cannot guarantee a particular song.' : ''}`,
      action: { type: action, query, music, ...(/another|similar|more like that/i.test(question) && action === 'play' ? { excludeCurrent: true } : {}) },
      source: 'waveatlas-local',
    };
  }
  if (/\b(?:song|track)\s+(?:called|named|by|["“])|\bmusic (?:by|like)\b/i.test(question)) {
    return { answer: 'I don’t have a reliable genre match for that music reference yet. Tell me the artist and genre, and I’ll find stations with matching programming.', source: 'waveatlas-local' };
  }
  const conversational = conversationalIntent(question, context);
  let result = conversational || answerAtlasQuestion(question, context);
  if (result.answer.startsWith(FALLBACK_PREFIX)) {
    const station = context.station;
    const place = [tidy(station?.city), tidy(station?.country)].filter(Boolean).join(', ');
    result = {
      answer: station
        ? `I’m following you, but I don’t want to pretend I know something the Atlas has not verified. We’re currently on ${station.name}${place ? ` from ${place}` : ''}. You can ask me to compare the signal, stay in this area, change the mood, find another station, or move somewhere completely different.`
        : `I’m following you. Give me the listening goal naturally, a place, language, mood, genre, news, worship, talk, or just tell me to choose, and I’ll turn that into an Atlas action.`,
      source: 'waveatlas-local',
    };
  }
  if (PIDGIN.test(question)) result = { ...result, answer: pidginReply(result.answer) };
  return result;
}
