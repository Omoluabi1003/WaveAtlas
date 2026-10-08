export type GlobeViewportBounds = { left: number; top: number; right: number; bottom: number };

// Automatic station focus uses zooms up to 1.2. Keep the whole earth inside
// its available region at those zooms; deliberate street/pinch zoom can enlarge it.
export function fitGlobeToViewport(width: number, height: number, zoom: number, bounds?: GlobeViewportBounds) {
  const usableBounds = {
    left: Math.max(0, Math.min(width, bounds?.left ?? 0)),
    top: Math.max(0, Math.min(height, bounds?.top ?? 0)),
    right: Math.max(0, Math.min(width, bounds?.right ?? width)),
    bottom: Math.max(0, Math.min(height, bounds?.bottom ?? height)),
  };
  const usableWidth = Math.max(0, usableBounds.right - usableBounds.left);
  const usableHeight = Math.max(0, usableBounds.bottom - usableBounds.top);
  return {
    width, height, usableBounds,
    radius: Math.min(usableWidth, usableHeight) * .46 * zoom / 1.2,
    centerX: usableBounds.left + usableWidth / 2,
    centerY: usableBounds.top + usableHeight / 2,
  };
}
