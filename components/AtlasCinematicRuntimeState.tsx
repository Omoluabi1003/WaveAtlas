"use client";

import { useEffect } from "react";

export function AtlasCinematicRuntimeState() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.waveatlasVisual = "v2";
    root.dataset.waveatlasCinematic = "v1";
    return () => {
      delete root.dataset.waveatlasCinematic;
    };
  }, []);
  return null;
}
