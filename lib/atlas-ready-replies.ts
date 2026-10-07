import catalogue from './atlas-ready-replies.json';
import { answerAtlasIntelligently } from './atlas-intelligence';
import type { AtlasActionResult, AtlasAssistantAction, AtlasAssistantContext } from './atlas-assistant';

export const ATLAS_READY_REPLIES = catalogue;
const byId = new Map(catalogue.map(reply => [reply.id, reply.text]));
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');
const exact = new Map(catalogue.map(reply => [normalize(reply.text), reply.text]));
const text = (id: string) => byId.get(id)!;

// Only confirmed outcomes select completion clips. The full named result stays
// in the transcript; routine voice confirmations do not wait to synthesize names.
export function readyAtlasReply(answer: string, action?: AtlasAssistantAction, outcome?: AtlasActionResult | boolean) {
  if (action) {
    if (outcome === false || (outcome && typeof outcome === 'object' && !outcome.ok)) return text(typeof outcome === 'object' && outcome.status === 'not_found' ? 'not_found' : 'failed');
    if (!outcome) return null;
    if (typeof outcome === 'object') {
      if (outcome.status === 'playing' || outcome.status === 'connecting' || outcome.status === 'already_playing') return text(outcome.status);
      if (outcome.status !== 'completed') return null;
    }
    if (action.type === 'search') return text('search_results');
    if (action.type === 'pause') return text('pause');
    if (action.type === 'resume' || action.type === 'play') return text('resume');
    if (action.type === 'volume') return text(action.value === 0 ? 'mute' : /Turning the signal up/.test(answer) ? 'volume_up' : /Turning the signal down/.test(answer) ? 'volume_down' : 'volume');
    if (action.type === 'switch_view') return text(action.view);
    if (action.type === 'open_settings') return text('settings');
    if (action.type === 'open_brief') return text('brief');
    if (action.type === 'wander') return text(/^Oya/.test(answer) ? 'wander_pidgin' : 'wander');
    if (action.type === 'teleport') return text('teleport');
    return null;
  }
  const saved = exact.get(normalize(answer));
  if (saved) return saved;
  if (answer.startsWith('Hello.')) return text('greeting_live');
  if (answer.startsWith('I can identify and explain the current signal')) return text('capabilities');
  if (answer.startsWith('I don’t have a live signal selected yet.')) return text('no_signal');
  if (answer.startsWith('I’m following you. Give me the listening goal naturally')) return text('no_context');
  return null;
}

export function atlasStationVoicePhrases(station: AtlasAssistantContext['station']) {
  if (!station) return [];
  return [...new Set(['What am I listening to?', 'Where is this station?', 'What language does it use?', 'What genre is it?', 'What is the stream quality?', 'Hello Atlas', 'Why did you pick this station?']
    .map(question => answerAtlasIntelligently(question, { station }))
    .filter(reply => !reply.action && !readyAtlasReply(reply.answer))
    .map(reply => reply.answer))];
}
