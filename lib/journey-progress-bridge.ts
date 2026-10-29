export const JOURNEY_PROGRESS_CONTROL_ID = 'journey-progress';

export function normalizeJourneyProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function progressToControlValue(value: number) {
  return String(Math.round(normalizeJourneyProgress(value) * 1000));
}

export function setJourneyProgressFromTimeline(value: number, root: Document = document) {
  const input = root.getElementById(JOURNEY_PROGRESS_CONTROL_ID) as HTMLInputElement | null;
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) return false;
  setter.call(input, progressToControlValue(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
