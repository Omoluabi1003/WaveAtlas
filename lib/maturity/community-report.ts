export const REPORT_REASONS = ['not_playing','wrong_station','severe_buffering','wrong_location','incorrect_metadata'] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export function validateReport(value: unknown): { stationId: string; reason: ReportReason } | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  return typeof data.stationId === 'string' && /^[\p{L}\p{N}_.:-]{1,256}$/u.test(data.stationId) && REPORT_REASONS.includes(data.reason as ReportReason) ? { stationId: data.stationId, reason: data.reason as ReportReason } : null;
}
