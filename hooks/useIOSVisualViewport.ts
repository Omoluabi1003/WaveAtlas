"use client";

import { useCallback, useEffect, useState } from "react";

type IOSVisualViewportState = {
  keyboardOpen: boolean;
  viewportHeight: number;
  viewportOffsetTop: number;
  viewportOffsetLeft: number;
  viewportWidth: number;
};

function readVisualViewport(): IOSVisualViewportState {
  if (typeof window === "undefined") {
    return { keyboardOpen: false, viewportHeight: 0, viewportOffsetTop: 0, viewportOffsetLeft: 0, viewportWidth: 0 };
  }

  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportOffsetTop = viewport?.offsetTop ?? 0;
  const viewportOffsetLeft = viewport?.offsetLeft ?? 0;
  const keyboardOpen = viewportHeight < window.innerHeight - 80;

  return { keyboardOpen, viewportHeight, viewportOffsetTop, viewportOffsetLeft, viewportWidth };
}

export function useIOSVisualViewport() {
  const [state, setState] = useState<IOSVisualViewportState>(() => readVisualViewport());

  const refresh = useCallback(() => {
    setState(readVisualViewport());
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(refresh);
    const viewport = window.visualViewport;
    window.addEventListener("resize", refresh, { passive: true });
    window.addEventListener("orientationchange", refresh, { passive: true });
    viewport?.addEventListener("resize", refresh, { passive: true });
    viewport?.addEventListener("scroll", refresh, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
      viewport?.removeEventListener("resize", refresh);
      viewport?.removeEventListener("scroll", refresh);
    };
  }, [refresh]);

  return state;
}
