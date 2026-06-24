"use client";

import { useEffect } from "react";

const FALLBACK_TOAST = "Signal unavailable. Trying another station.";
const WEAK_SIGNAL_TOAST = "This signal is weak. We are checking it in the background.";
const LONG_BUFFER_TOAST = "Holding Jay 101.9 FM. This station may take longer to open.";
const JAY_FM_PATTERN = /Jay\s*(?:101\.9\s*)?FM|Jay\s*101\.9/i;

function pageShowsJayFm() {
  if (typeof document === "undefined") return false;
  return JAY_FM_PATTERN.test(document.body.innerText || "");
}

function rewriteLongBufferStatusText() {
  if (typeof document === "undefined" || !pageShowsJayFm()) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue || "";
    if (value.includes(FALLBACK_TOAST)) {
      node.nodeValue = value.replace(FALLBACK_TOAST, LONG_BUFFER_TOAST);
    } else if (value.includes(WEAK_SIGNAL_TOAST)) {
      node.nodeValue = value.replace(WEAK_SIGNAL_TOAST, LONG_BUFFER_TOAST);
    } else if (/Jay\s*101\.9\s*FM\s*Jos\s*·\s*failed/i.test(value)) {
      node.nodeValue = value.replace(/failed/i, "holding signal");
    }
    node = walker.nextNode();
  }
}

export function LongBufferToastGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;
    let frame = 0;
    const scheduleRewrite = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(rewriteLongBufferStatusText);
    };
    scheduleRewrite();
    const observer = new MutationObserver(scheduleRewrite);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}
