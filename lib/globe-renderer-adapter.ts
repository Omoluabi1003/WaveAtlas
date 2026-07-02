import type { Station } from "@/lib/stations";
import type { GlobeBasemapKey } from "@/lib/globe-renderer-types";
import type { GlobeGeoPoint, GlobeRotation, GlobeScreen } from "@/lib/globe-math";

export type WaveAtlasRendererKind = "canvas2d" | "photorealistic-preview";

export type WaveAtlasRendererFeatureFlags = {
  /** Keeps the current 2D canvas renderer as the default and instant rollback path. */
  rendererKind: WaveAtlasRendererKind;
  /** Allows preview-only photorealistic Earth work without replacing the production renderer. */
  photorealisticPreview: boolean;
  /** Emergency switch that forces the legacy 2D renderer regardless of preview settings. */
  forceLegacyCanvas: boolean;
};

export type GlobeRendererRuntimeState = {
  station: Station;
  stations: Station[];
  currentPoint: GlobeGeoPoint | null;
  rotation: GlobeRotation;
  screen: GlobeScreen;
  basemap: GlobeBasemapKey;
  teleporting: boolean;
  selectionVersion?: number;
};

export type GlobeRendererProjection = {
  x: number;
  y: number;
  z: number;
  frontFacing: boolean;
};

export type GlobeRendererAdapter = {
  kind: WaveAtlasRendererKind;
  mount(target: HTMLElement): void;
  update(state: GlobeRendererRuntimeState): void;
  project(point: GlobeGeoPoint, state: Pick<GlobeRendererRuntimeState, "rotation" | "screen">): GlobeRendererProjection;
  dispose(): void;
};

export const DEFAULT_RENDERER_FLAGS: WaveAtlasRendererFeatureFlags = {
  rendererKind: "canvas2d",
  photorealisticPreview: false,
  forceLegacyCanvas: true,
};

function readSafeRendererEnv(): Partial<NodeJS.ProcessEnv> {
  if (typeof process !== "undefined" && typeof process.env !== "undefined") return process.env;
  const browserEnv = typeof window !== "undefined" ? (window as Window & { __WAVEATLAS_RENDERER_FLAGS__?: Partial<NodeJS.ProcessEnv> }).__WAVEATLAS_RENDERER_FLAGS__ : undefined;
  return browserEnv ?? {};
}

export function readRendererFeatureFlags(env: Partial<NodeJS.ProcessEnv> = readSafeRendererEnv()): WaveAtlasRendererFeatureFlags {
  const preview = env.NEXT_PUBLIC_WAVEATLAS_PHOTOREALISTIC_RENDERER === "preview";
  const forceLegacy = env.NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER !== "false";
  return {
    rendererKind: preview && !forceLegacy ? "photorealistic-preview" : "canvas2d",
    photorealisticPreview: preview,
    forceLegacyCanvas: forceLegacy,
  };
}

export function shouldUsePhotorealisticPreview(flags: WaveAtlasRendererFeatureFlags = readRendererFeatureFlags()) {
  return flags.photorealisticPreview && !flags.forceLegacyCanvas && flags.rendererKind === "photorealistic-preview";
}
