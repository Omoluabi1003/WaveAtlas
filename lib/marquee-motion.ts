export type MarqueeTiming = {
  distancePx: number;
  travelMs: number;
  dwellMs: number;
  cycleMs: number;
  startTravelOffset: number;
  endTravelOffset: number;
};

const DEFAULT_SPEED_PX_PER_SECOND = 36;
const DEFAULT_DWELL_MS = 1200;
const MIN_TRAVEL_MS = 5000;
const MAX_TRAVEL_MS = 32000;

export function resolveMarqueeTiming(
  distancePx: number,
  speedPxPerSecond = DEFAULT_SPEED_PX_PER_SECOND,
  dwellMs = DEFAULT_DWELL_MS,
): MarqueeTiming {
  const safeDistance = Number.isFinite(distancePx) ? Math.max(0, distancePx) : 0;
  const safeSpeed = Number.isFinite(speedPxPerSecond) ? Math.max(1, speedPxPerSecond) : DEFAULT_SPEED_PX_PER_SECOND;
  const safeDwell = Number.isFinite(dwellMs) ? Math.max(0, dwellMs) : DEFAULT_DWELL_MS;
  const naturalTravelMs = (safeDistance / safeSpeed) * 1000;
  const travelMs = Math.min(MAX_TRAVEL_MS, Math.max(MIN_TRAVEL_MS, naturalTravelMs));
  const cycleMs = travelMs + safeDwell * 2;

  return {
    distancePx: safeDistance,
    travelMs,
    dwellMs: safeDwell,
    cycleMs,
    startTravelOffset: cycleMs > 0 ? safeDwell / cycleMs : 0,
    endTravelOffset: cycleMs > 0 ? (safeDwell + travelMs) / cycleMs : 1,
  };
}

export function marqueeOffsetAt(elapsedMs: number, timing: MarqueeTiming) {
  if (timing.distancePx <= 0 || timing.cycleMs <= 0) return 0;
  const normalizedElapsed = ((elapsedMs % timing.cycleMs) + timing.cycleMs) % timing.cycleMs;
  if (normalizedElapsed <= timing.dwellMs) return 0;
  if (normalizedElapsed >= timing.dwellMs + timing.travelMs) return -timing.distancePx;
  const progress = (normalizedElapsed - timing.dwellMs) / timing.travelMs;
  return -timing.distancePx * progress;
}
