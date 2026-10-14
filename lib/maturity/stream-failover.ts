export type StreamCandidate = { url: string; source: string; authority: number; confidence: number; health: number; verifiedAt: string; lastSuccess?: number; token?: string };
export function rankStreamCandidates(candidates: StreamCandidate[], now = Date.now()) {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const age = now - Date.parse(candidate.verifiedAt);
    if (!/^https?:\/\//i.test(candidate.url) || candidate.confidence < 0.75 || candidate.health < 65 || !Number.isFinite(age) || age < 0 || age > 48 * 3600_000 || seen.has(candidate.url)) return false;
    seen.add(candidate.url); return true;
  }).sort((a, b) => (b.health + b.confidence * 20 + b.authority * 15 + (b.lastSuccess && now - b.lastSuccess < 86400_000 ? 15 : 0)) - (a.health + a.confidence * 20 + a.authority * 15 + (a.lastSuccess && now - a.lastSuccess < 86400_000 ? 15 : 0))).slice(0, 4);
}
export class FailoverCycle {
  readonly failed = new Set<string>();
  private attempts = 0;
  constructor(readonly stationId: string, readonly limit = 3) {}
  next(failedUrl: string, candidates: StreamCandidate[]) {
    this.failed.add(failedUrl);
    if (this.attempts >= this.limit) return null;
    const candidate = rankStreamCandidates(candidates).find(item => !this.failed.has(item.url));
    if (!candidate) return null;
    this.attempts++; this.failed.add(candidate.url);
    return { candidate, delayMs: Math.min(4000, 400 * 2 ** (this.attempts - 1)) };
  }
}
export type CoordinatedPlayback = 'idle' | 'connecting' | 'playing' | 'buffering' | 'voice_active' | 'failing_over' | 'paused' | 'unavailable';
export function coordinatedPlayback(status: string, voiceActive: boolean, failingOver: boolean): CoordinatedPlayback {
  if (voiceActive) return 'voice_active';
  if (failingOver) return 'failing_over';
  if (status === 'failed') return 'unavailable';
  if (status === 'blocked') return 'idle';
  return ['idle','connecting','playing','buffering','paused','unavailable'].includes(status) ? status as CoordinatedPlayback : 'idle';
}
