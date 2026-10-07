export type AtlasReplyVoiceStatus = { phase: 'idle' | 'preparing' | 'speaking' | 'failed'; detail: string };
export type AtlasVoiceStatusEvent = { type: 'idle' | 'preparing' | 'speaking' } | { type: 'progress' | 'failed'; detail: string };
export const INITIAL_ATLAS_VOICE_STATUS: AtlasReplyVoiceStatus = { phase: 'idle', detail: '' };
// Update this version together with the public worker's module graph.
export const ATLAS_VOICE_RUNTIME_VERSION = 'omoluabi-continuous-20261007';

export function atlasVoiceStatusTransition(status: AtlasReplyVoiceStatus, event: AtlasVoiceStatusEvent): AtlasReplyVoiceStatus {
  if (event.type === 'progress') return status.phase === 'preparing' ? { ...status, detail: event.detail } : status;
  if (event.type === 'failed') return { phase: 'failed', detail: event.detail };
  return { phase: event.type, detail: '' };
}

export function atlasVoiceStatusLabel(status: AtlasReplyVoiceStatus, readiness: 'idle' | 'prepared' | 'loading' | 'ready' | 'unavailable') {
  if (status.phase === 'speaking') return 'Omoluabi Paul speaking';
  if (status.phase === 'failed') return `Omoluabi personal voice unavailable${status.detail ? ` · ${status.detail}` : ''}`;
  if (status.phase === 'preparing') return `Preparing Omoluabi reply${status.detail ? ` · ${status.detail}` : ''}`;
  if (readiness === 'loading') return 'Loading Omoluabi personal voice';
  if (readiness === 'prepared') return 'Saved Omoluabi personal voice';
  if (readiness === 'ready') return 'Omoluabi personal voice ready';
  if (readiness === 'unavailable') return 'Omoluabi personal voice unavailable';
  return 'Omoluabi personal voice';
}
