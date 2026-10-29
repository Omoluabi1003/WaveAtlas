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
      if (frame) return;
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

        const playerRect = player.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();
        const desiredPlayerBottom = dockRect.top - COCKPIT_GAP_PX;
        const currentShift = Number.parseFloat(getComputedStyle(root).getPropertyValue("--waveatlas-player-rendered-shift")) || 0;
        const delta = desiredPlayerBottom - playerRect.bottom;
        const nextShift = Math.round(currentShift + delta);

        if (Math.abs(delta) >= 1) {
          root.style.setProperty("--waveatlas-player-rendered-shift", `${nextShift}px`);
        }
      });
    };

    schedule();

    // Only watch for the player/dock entering or leaving the DOM. Never watch
    // global class/style mutations: WaveAtlas has continuously animated UI and
    // observing those mutations creates a Safari feedback loop.
    mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

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
