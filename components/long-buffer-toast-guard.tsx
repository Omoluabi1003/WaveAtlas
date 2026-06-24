"use client";

import { useEffect } from "react";

const FALLBACK_TOAST = "Signal unavailable. Trying another station.";
const LONG_BUFFER_TOAST = "Holding Jay 101.9 FM. This station may take longer to open.";
const JAY_FM_PATTERN = /Jay\s*(?:101\.9\s*)?FM|Jay\s*101\.9/i;

function pageShowsJayBuffering() {
  if (typeof document === "undefined") return false;
  const text = document.body.innerText || "";
  return JAY_FM_PATTERN.test(text) && /buffering/i.test(text);
}

function rewriteFallbackToastText() {
  if (typeof document === "undefined" || !pageShowsJayBuffering()) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue?.includes(FALLBACK_TOAST)) {
      node.nodeValue = node.nodeValue.replace(FALLBACK_TOAST, LONG_BUFFER_TOAST);
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
      frame = window.requestAnimationFrame(rewriteFallbackToastText);
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
