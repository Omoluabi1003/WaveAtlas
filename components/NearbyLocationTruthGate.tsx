"use client";

import { useEffect, useRef, useState } from "react";
import { readAtlasLocation } from "@/lib/atlas-location";

const EXPLORE_NEARBY_LABEL = "explore nearby";
const BYPASS_ATTRIBUTE = "data-waveatlas-location-gate-bypass";

export function isExploreNearbyLabel(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase().includes(EXPLORE_NEARBY_LABEL);
}

function interactiveElement(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>("button,a,[role='button']") : null;
}

function labelFor(element: HTMLElement) {
  return element.getAttribute("aria-label")
    || element.getAttribute("title")
    || element.textContent
    || "";
}

export function NearbyLocationTruthGate() {
  const [message, setMessage] = useState<string | null>(null);
  const locating = useRef(false);
  const dismissTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearMessageLater = () => {
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
      dismissTimer.current = window.setTimeout(() => setMessage(null), 8000);
    };

    const onClick = (event: MouseEvent) => {
      const element = interactiveElement(event.target);
      if (!element || !isExploreNearbyLabel(labelFor(element))) return;
      if (element.hasAttribute(BYPASS_ATTRIBUTE)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (locating.current) return;

      locating.current = true;
      setMessage("Locating you precisely…");

      void readAtlasLocation({ allowPrompt: true, timeoutMs: 10_000 })
        .then((coords) => {
          if (!coords) {
            setMessage("Explore Nearby needs precise location. Allow location access and Precise Location, then try again.");
            clearMessageLater();
            return;
          }

          setMessage(null);
          element.setAttribute(BYPASS_ATTRIBUTE, "true");
          queueMicrotask(() => {
            try {
              element.click();
            } finally {
              element.removeAttribute(BYPASS_ATTRIBUTE);
            }
          });
        })
        .catch(() => {
          setMessage("Explore Nearby could not verify your location. Check location permission and try again.");
          clearMessageLater();
        })
        .finally(() => {
          locating.current = false;
        });
    };

    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+92px)] left-1/2 z-[190] w-[min(92vw,430px)] -translate-x-1/2 rounded-2xl border border-emerald-300/25 bg-slate-950/92 px-4 py-3 text-center text-sm font-medium text-white shadow-2xl backdrop-blur-xl"
    >
      {message}
    </div>
  );
}
