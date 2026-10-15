import type { Station } from './stations';
export type StreamCandidate = { url: string; verified: boolean; health: number; confidence: number; authority: number; lastSuccessAt?: number };
export function rankStreamCandidates(candidates: StreamCandidate[], now = Date.now()) {
  const score = (item: StreamCandidate) => item.health * .45 + item.confidence * 25 + item.authority * 20 + (item.lastSuccessAt && now - item.lastSuccessAt >= 0 && now - item.lastSuccessAt < 48 * 3600000 ? 10 : 0);
  return [...new Map(candidates.filter(item => item.verified && /^https?:\/\//i.test(item.url) && Number.isFinite(item.health) && item.confidence >= .75).map(item => [item.url.trim(), { ...item, url: item.url.trim() }])).values()].sort((a, b) => score(b) - score(a) || a.url.localeCompare(b.url));
}
export function canonicalStreamCandidates(station: Station): StreamCandidate[] {
  // These URLs belong to the same canonical directory record, never a name match.
  return rankStreamCandidates([station.url_resolved, station.url].filter((url): url is string => Boolean(url)).map(url => ({ url, verified: station.last_check_ok === true || station.verification_status === 'verified', health: station.health_score, confidence: station.source_confidence ?? .8, authority: station.curation_tier === 'curated_atlas' ? 1 : .8 })));
}
export class FailoverCycle {
  readonly attempted = new Set<string>();
  constructor(readonly limit = 4) {}
  next(candidates: StreamCandidate[], failedUrl: string) {
    this.attempted.add(failedUrl);
    if (this.attempted.size >= this.limit) return undefined;
    const next = rankStreamCandidates(candidates).find(item => !this.attempted.has(item.url));
    if (next) this.attempted.add(next.url);
    return next;
  }
  get backoffMs() { return Math.min(4000, 250 * 2 ** Math.max(0, this.attempted.size - 2)); }
}
export type CoordinatedPlaybackState = 'idle' | 'connecting' | 'playing' | 'buffering' | 'voice_active' | 'failing_over' | 'paused' | 'unavailable';
export function coordinatedPlaybackState(status: string, voiceActive: boolean, failingOver: boolean): CoordinatedPlaybackState {
  if (voiceActive) return 'voice_active';
  if (status === 'paused') return 'paused';
  if (failingOver) return 'failing_over';
  if (status === 'failed') return 'unavailable';
  if (status === 'blocked' || status === 'idle') return 'idle';
  if (status === 'connecting') return 'connecting';
  return status === 'playing' ? 'playing' : 'buffering';
}
