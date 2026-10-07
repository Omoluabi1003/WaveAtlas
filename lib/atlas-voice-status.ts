export type AtlasReplyVoiceStatus = { phase: 'idle' | 'preparing' | 'speaking' | 'failed'; detail: string };
export type AtlasVoiceStatusEvent = { type: 'idle' | 'preparing' | 'speaking' } | { type: 'progress' | 'failed'; detail: string };
export const INITIAL_ATLAS_VOICE_STATUS: AtlasReplyVoiceStatus = { phase: 'idle', detail: '' };
// Update this version together with the public worker's module graph.
export const ATLAS_VOICE_RUNTIME_VERSION = 'omoluabi-handoff-20261007-v2';

export function atlasVoiceStatusTransition(status: AtlasReplyVoiceStatus, event: AtlasVoiceStatusEvent): AtlasReplyVoiceStatus {
  if (event.type === 'progress') return status.phase === 'preparing' ? { ...status, detail: event.detail } : status;
  if (event.type === 'failed') return { phase: 'failed', detail: event.detail };
  return { phase: event.type, detail: '' };
}

export function atlasVoiceStatusLabel(status: AtlasReplyVoiceStatus, readiness: 'idle' | 'prepared' | 'loading' | 'ready' | 'unavailable') {
  if (status.phase === 'speaking') return 'Omoluabi Paul speaking';
  if (status.phase === 'failed' || readiness === 'unavailable') return 'Voice is unavailable. Your answer is in the transcript.';
  if (status.phase === 'preparing') return 'Thinking';
  return 'Omoluabi Paul';
}
