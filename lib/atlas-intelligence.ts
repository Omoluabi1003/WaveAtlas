import { answerAtlasQuestion, type AtlasAssistantContext, type AtlasAssistantReply } from '@/lib/atlas-assistant';

const PIDGIN = /\b(?:abeg|wetin|dey|wan|make we|na |no be|oya|how far|una|gist|wahala|shey|abi|fit|don|go play|for me)\b/i;
const FALLBACK_PREFIX = 'I understood the words, but I don’t have enough verified Atlas context';
const PLAY_WORDS = /\b(?:play|tune|listen|hear|put on|switch|change|find and play|search and play)\b/i;

function tidy(value?: string | null) { return value?.trim() || ''; }
function lastUser(context: AtlasAssistantContext) { return [...(context.history || [])].reverse().find((line) => line.role === 'user')?.text?.trim() || ''; }
function reply(answer: string, action?: AtlasAssistantReply['action']): AtlasAssistantReply { return { answer, ...(action ? { action } : {}), source: 'waveatlas-local' }; }

function normalizeSpokenInstruction(value: string) {
  return value
    .trim()
    .replace(/^(?:hey\s+)?(?:atlas|at last|atlas voice)[,:]?\s*/i, '')
    .replace(/^(?:no[,.]?\s*)?(?:i said|what i said was|listen|please|please just|can you|could you|would you|will you|i want you to|i need you to)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPositiveCorrection(value: string) {
  const parts = value.split(/\b(?:instead|rather|not that|no,?|but)\b/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return value;
  const positive = [...parts].reverse().find((part) => PLAY_WORDS.test(part) || /^(?:go|take|open|show|pause|resume|mute|volume)/i.test(part));
  return positive || parts[parts.length - 1] || value;
}

function cleanPlayQuery(value: string) {
  return value
    .replace(/^(?:find\s+and\s+play|search\s+and\s+play|find|search for|play|tune(?: me)?(?: in| to)?|put on|switch(?: me)? to|change(?: it)? to|let me (?:listen to|hear)|i (?:want|would like|need) (?:to listen to|to hear|a|an|some)?|give me)\s+/i, '')
    .replace(/\s+(?:for me|please)$/i, '')
    .replace(/\s+instead$/i, '')
    .trim();
}

function pidginReply(answer: string) {
  const swaps: Array<[RegExp, string]> = [
    [/I’ll find and play (.+)\./i, 'Oya, make I find and play $1.'],
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

function instructionIntent(question: string, context: AtlasAssistantContext): AtlasAssistantReply | null {
  const normalized = normalizeSpokenInstruction(question);
  const q = extractPositiveCorrection(normalized);
  const lower = q.toLowerCase();
  const station = context.station;
  const country = tidy(station?.country);
  const city = tidy(station?.city);
  const tags = Array.isArray(station?.tags) ? station.tags.join(' ') : tidy(station?.tags as string | undefined);
  const prior = lastUser(context);

  // Spoken corrections must override the previous request rather than continuing it.
  if (/^(?:actually\s+)?(?:play|find|search|tune|put on|switch|change|let me|i want|i need|give me)/i.test(q) || /\b(?:find and play|search and play)\b/i.test(q)) {
    const query = cleanPlayQuery(q);
    if (query && query !== q || PLAY_WORDS.test(q)) {
      const usable = query || q;
      if (usable.length > 1) return reply(`I’ll find and play ${usable}.`, { type: 'play', query: usable, excludeCurrent: /another|different|something else/i.test(usable) });
    }
  }

  // Natural requests that omit the verb "play" are still listening instructions.
  const desire = q.match(/^(?:i(?:'m| am) (?:in the mood for|feeling like)|i feel like|something|some|a|an)\s+(.+)/i);
  if (desire?.[1] && !/^(?:question|thing|problem)\b/i.test(desire[1])) return reply(`I’ll find and play ${desire[1].trim()}.`, { type: 'play', query: desire[1].trim() });

  const naturalPlace = lower.match(/(?:what(?:'s| is) (?:playing|on)|anything good|what can i hear|find me something|let(?:'s| us) listen to something)\s+(?:in|from|around)\s+(.+)/i);
  if (naturalPlace?.[1]) return reply(`I’ll explore ${naturalPlace[1].trim()} and play a strong match.`, { type: 'play', query: naturalPlace[1].trim() });

  // "Another", "different", "same place" and similar follow-ups inherit verified context.
  if (/^(?:another|another one|different one|something else|next|next one)(?:\s+please)?$/i.test(q)) {
    const query = [city || country, tags.split(/[ ,]/)[0]].filter(Boolean).join(' ');
    return reply('I’ll change the station and keep the listening thread.', { type: 'play', ...(query ? { query } : {}), excludeCurrent: true });
  }
  if (/\b(?:keep it there|stay there|same country|same city|same place|around there|from there)\b/i.test(q)) {
    const place = city || country;
    if (place) return reply(`I’ll stay around ${place}.`, { type: 'play', query: [place, tags.split(/[ ,]/)[0]].filter(Boolean).join(' ') });
    const priorPlace = prior.match(/(?:in|from|around|to)\s+([\p{L} .'-]+)$/iu)?.[1]?.trim();
    if (priorPlace) return reply(`I’ll keep exploring ${priorPlace}.`, { type: 'play', query: priorPlace });
  }

  if (/\b(?:why this one|why did you pick|why this station)\b/i.test(q) && station) {
    const reasons = [country && `it is catalogued in ${country}`, tags && `its tags include ${tags}`].filter(Boolean);
    return reply(reasons.length ? `I picked this signal from verified Atlas metadata: ${reasons.join(', ')}. I won’t invent a reason beyond what the station data supports.` : `I can confirm the station selection, but I don’t have enough verified metadata to claim why it is a better match.`);
  }

  if (/\b(?:talk to me|what do you think|recommend something|choose for me|you choose|pick one)\b/i.test(q)) {
    const query = [country, tags.split(/[ ,]/)[0]].filter(Boolean).join(' ');
    return reply(station ? `I’ll keep the thread from ${station.name} but change the signal.` : `I’ll choose a signal with some character.`, { type: 'play', ...(query ? { query } : {}), excludeCurrent: Boolean(station) });
  }

  return null;
}

export function answerAtlasIntelligently(question: string, context: AtlasAssistantContext = {}): AtlasAssistantReply {
  const normalized = normalizeSpokenInstruction(question);
  const instructed = instructionIntent(normalized, context);
  let result = instructed || answerAtlasQuestion(normalized, context);
  if (result.answer.startsWith(FALLBACK_PREFIX)) {
    const station = context.station;
    const place = [tidy(station?.city), tidy(station?.country)].filter(Boolean).join(', ');
    result = reply(station
      ? `I heard you, but I could not safely turn that into an action. We’re on ${station.name}${place ? ` from ${place}` : ''}. Say the action directly, for example “play gospel from Lagos”, “another one”, “pause”, or “take me to Congo”.`
      : `I heard you, but I could not safely turn that into an action. Tell me the listening goal directly, for example “play Nigerian gospel”, “find news from Abuja”, “take me to Congo”, or “surprise me”.`);
  }
  if (PIDGIN.test(question)) result = { ...result, answer: pidginReply(result.answer) };
  return result;
}
