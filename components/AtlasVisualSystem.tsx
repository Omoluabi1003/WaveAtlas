"use client";

import { useEffect, useState } from "react";

type PlaybackContext = { status?: string };

export function AtlasVisualSystem() {
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.waveatlasVisual = "v2";

    const onPlayback = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackContext>).detail;
      if (!detail?.status) return;
      setStatus(detail.status);
      root.dataset.waveatlasPlayback = detail.status;
    };

    window.addEventListener("waveatlas:playback-context", onPlayback);
    window.dispatchEvent(new Event("waveatlas:request-playback-context"));

    return () => {
      delete root.dataset.waveatlasVisual;
      delete root.dataset.waveatlasPlayback;
      window.removeEventListener("waveatlas:playback-context", onPlayback);
    };
  }, []);

  return (
    <div className="atlas-visual-system" aria-hidden="true" data-status={status}>
      <div className="atlas-visual-system__mesh" />
      <div className="atlas-visual-system__aurora atlas-visual-system__aurora--one" />
      <div className="atlas-visual-system__aurora atlas-visual-system__aurora--two" />
      <div className="atlas-visual-system__scan" />
      <div className="atlas-visual-system__grain" />
    </div>
  );
}
