export const REPORT_REASONS = ['not_playing', 'wrong_station', 'severe_buffering', 'wrong_location', 'incorrect_metadata'] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export type CommunityReport = { stationId: string; reason: ReportReason };
export function validateCommunityReport(value: unknown): CommunityReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !['stationId', 'reason'].includes(key)) || typeof row.stationId !== 'string' || !/^[\w-]{1,200}$/.test(row.stationId) || !REPORT_REASONS.includes(row.reason as ReportReason)) return null;
  return { stationId: row.stationId, reason: row.reason as ReportReason };
}
