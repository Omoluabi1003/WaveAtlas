export type LabelBounds = { left: number; right: number; top: number; bottom: number };

export function labelsOverlap(a: LabelBounds, b: LabelBounds): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Reserve the marker as well as the caption above it. Country centroids can
// otherwise put a neighbouring country's name directly through the beacon.
export function beaconLabelExclusion(x: number, y: number, mobile: boolean): LabelBounds {
  const radius = mobile ? 42 : 48;
  return { left: x - radius, right: x + radius, top: y - radius, bottom: y + radius };
}
