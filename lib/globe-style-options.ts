import type { GlobeBasemapKey } from "@/lib/globe-renderer-types";

export const globeBasemapStyles: Record<GlobeBasemapKey, { label: string; name: string; description: string }> = {
  photorealistic: { label: "🌍 Photorealistic Globe", name: "Photorealistic Globe", description: "Realistic Earth texture, clouds, atmosphere, city lights, directional light, and ocean depth." },
  blueMarble: { label: "🌊 Blue Marble Globe", name: "Blue Marble Globe", description: "Procedural oceans, landmasses, borders, labels, and live beacon." },
  night: { label: "🌃 Night Globe", name: "Night Globe", description: "Dark Earth with country outlines, city-light style points, and live beacon." },
  signal: { label: "📡 Signal Globe", name: "Signal Globe", description: "Minimal navy globe with grid, country outlines, and live beacon." },
};

const SELECTABLE_GLOBE_BASEMAP_KEYS: GlobeBasemapKey[] = ["photorealistic", "blueMarble", "night", "signal"];

export function getSelectableGlobeBasemapKeys(): GlobeBasemapKey[] {
  return [...SELECTABLE_GLOBE_BASEMAP_KEYS];
}
