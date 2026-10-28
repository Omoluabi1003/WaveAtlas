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

      const rect = next.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const footprint = Math.max(0, Math.ceil(viewportHeight - rect.top));
      root.style.setProperty("--waveatlas-mobile-dock-footprint", `${footprint}px`);
    };

    measure();
    mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("resize", measure, { passive: true });
    window.visualViewport?.addEventListener("resize", measure, { passive: true });
    window.visualViewport?.addEventListener("scroll", measure, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      root.style.removeProperty("--waveatlas-mobile-dock-footprint");
    };
  }, []);

  return null;
}
