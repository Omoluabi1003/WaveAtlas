import type { AtlasAssistantContext, AtlasAssistantReply } from '../atlas-assistant';
export function maturityVoiceIntent(question: string, context: AtlasAssistantContext): AtlasAssistantReply | null {
  const q=question.trim().replace(/^(?:hey\s+)?atlas[, ]*/i,'').replace(/[.!?]+$/, ''); const station=context.station;
  if (/^(?:stop|pause)(?: the radio)?$/i.test(q)) return { answer: 'Pausing the signal.', action: { type: 'pause' }, source: 'waveatlas-local' };
  if (/^(?:continue|resume)(?: the radio)?$/i.test(q)) return { answer: 'Resuming the signal.', action: { type: 'resume' }, source: 'waveatlas-local' };
  if (/^(?:find|play|give me|take me to)(?:\s+something|\s+a station)?\s+nearby[.!?]?$/i.test(q)) return { answer:'I’ll explore nearby signals. If location is unavailable, discovery still works worldwide.', action:{type:'nearby'}, source:'waveatlas-local' };
  if (/^(?:play|give me|find)(?:\s+me)?\s+another station from (?:this|the same) country[.!?]?$/i.test(q)) return station?.country ? { answer:`I’ll find another signal from ${station.country}.`,action:{type:'play',query:station.country,excludeCurrent:true},source:'waveatlas-local'}:{answer:'Select a station first so I can keep the country context.',source:'waveatlas-local'};
  if (/^(?:give me|play|find)(?:\s+another station|\s+something) (?:like this|similar)[.!?]?$/i.test(q)) return station ? {answer:'I’ll keep the country and format while changing the station.',action:{type:'play',query:[station.country,station.tags?.[0]].filter(Boolean).join(' '),excludeCurrent:true},source:'waveatlas-local'}:null;
  return null;
}
