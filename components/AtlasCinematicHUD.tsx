"use client";

import { motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type StationContext = {
  name?: string;
  station_uuid?: string;
  id?: string;
} | null;

export function AtlasCinematicHUD() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [station, setStation] = useState<StationContext>(null);
  const [pulse, setPulse] = useState(0);
  const reducedMotion = Boolean(useReducedMotion());

  useEffect(() => {
    const sync = () => setTarget(document.querySelector<HTMLElement>(".waveatlas-globe-shell"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onStation = (event: Event) => {
      setStation((event as CustomEvent<StationContext>).detail);
      setPulse(value => value + 1);
    };
    window.addEventListener("waveatlas:station-context", onStation);
    window.dispatchEvent(new Event("waveatlas:request-station-context"));
    return () => window.removeEventListener("waveatlas:station-context", onStation);
  }, []);

  if (!target || !station) return null;

  return createPortal(
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden="true" data-cinematic-hud="v1">
      <motion.div
        key={pulse}
        initial={reducedMotion ? false : { opacity: 0.34, scale: 0.82 }}
        animate={reducedMotion ? { opacity: 0.08 } : { opacity: 0, scale: 1.08 }}
        transition={{ duration: reducedMotion ? 0 : 1.1, ease: "easeOut" }}
        className="absolute left-1/2 top-1/2 aspect-square w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/16 shadow-[0_0_44px_rgba(86,245,187,.08)]"
      />
    </div>,
    target,
  );
}
