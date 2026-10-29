"use client";

import { useEffect } from "react";

export function MobileCockpitGeometry() {
  useEffect(() => {
    const root = document.documentElement;
    let dock: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const measure = () => {
      const next = document.querySelector<HTMLElement>(".waveatlas-mobile-dock");
      if (!next) return;

      if (dock !== next) {
        resizeObserver?.disconnect();
        dock = next;
        resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(next);
      }

      // One coordinate system only: measure the dock itself, including its
      // top padding and iPhone safe-area/bottom padding. The player then sits
      // exactly this many pixels above the viewport bottom, plus the gap.
      const fullDockHeight = Math.max(0, Math.ceil(next.getBoundingClientRect().height));
      root.style.setProperty("--waveatlas-mobile-dock-full-height", `${fullDockHeight}px`);
    };

    measure();
    mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", measure, { passive: true });
    window.visualViewport?.addEventListener("resize", measure, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      root.style.removeProperty("--waveatlas-mobile-dock-full-height");
    };
  }, []);

  return null;
}
