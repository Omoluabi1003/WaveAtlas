"use client";

import { useEffect } from "react";

const COCKPIT_GAP_PX = 14;

export function MobileCockpitGeometry() {
  useEffect(() => {
    const root = document.documentElement;
    let player: HTMLElement | null = null;
    let dock: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let frame = 0;

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        const nextPlayer = document.querySelector<HTMLElement>("[data-waveatlas-player]");
        const nextDock = document.querySelector<HTMLElement>(".waveatlas-mobile-dock");
        if (!nextPlayer || !nextDock) return;

        if (player !== nextPlayer || dock !== nextDock) {
          player = nextPlayer;
          dock = nextDock;
          resizeObserver?.disconnect();
          resizeObserver = new ResizeObserver(schedule);
          resizeObserver.observe(player);
          resizeObserver.observe(dock);
        }

        // Measure both cards in the same rendered viewport coordinate system.
        // Reset the correction first so the next shift is derived from the
        // element's real CSS position, not from a previous correction.
        root.style.setProperty("--waveatlas-player-rendered-shift", "0px");

        requestAnimationFrame(() => {
          if (!player || !dock) return;
          const playerRect = player.getBoundingClientRect();
          const dockRect = dock.getBoundingClientRect();
          const desiredPlayerBottom = dockRect.top - COCKPIT_GAP_PX;
          const shift = Math.round(desiredPlayerBottom - playerRect.bottom);
          root.style.setProperty("--waveatlas-player-rendered-shift", `${shift}px`);
        });
      });
    };

    schedule();
    mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      root.style.removeProperty("--waveatlas-player-rendered-shift");
    };
  }, []);

  return null;
}
