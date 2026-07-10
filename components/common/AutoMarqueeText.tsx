"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { marqueeOffsetAt, resolveMarqueeTiming } from "@/lib/marquee-motion";

type AutoMarqueeTextProps = {
  text: string;
  className?: string;
};

type MarqueeMetrics = {
  containerWidth: number;
  textWidth: number;
  distance: number;
};

type MarqueeEngine = "idle" | "waapi" | "raf" | "reduced-motion";

const OVERFLOW_EPSILON_PX = 1;
const MARQUEE_GAP_PX = 44;
const MEASURE_RETRY_MS = [0, 60, 220, 700, 1600] as const;
const DEBUG_MARQUEE = process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_MARQUEE === "true";

const trackStyle: CSSProperties = {
  animation: "none",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  transform: "translate3d(0,0,0)",
  willChange: "transform",
};

export function AutoMarqueeText({ text, className = "" }: AutoMarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLSpanElement | null>(null);
  const measureFrameRef = useRef<number | null>(null);
  const [metrics, setMetrics] = useState<MarqueeMetrics>({ containerWidth: 0, textWidth: 0, distance: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [engine, setEngine] = useState<MarqueeEngine>("idle");

  const isOverflowing = metrics.containerWidth > 0 && metrics.textWidth - metrics.containerWidth > OVERFLOW_EPSILON_PX;
  const shouldAnimate = isOverflowing && !reducedMotion && metrics.distance > 0;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    media.addListener?.(sync);
    return () => {
      media.removeEventListener?.("change", sync);
      media.removeListener?.(sync);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const measureNode = measureRef.current;
    if (!container || !measureNode) return;

    const measure = () => {
      const textRectWidth = measureNode.getBoundingClientRect().width;
      const textWidth = Math.ceil(Math.max(textRectWidth, measureNode.scrollWidth));
      const containerRectWidth = container.getBoundingClientRect().width;
      const containerWidth = Math.floor(Math.max(containerRectWidth, container.clientWidth));
      const next = {
        containerWidth,
        textWidth,
        distance: textWidth > 0 ? textWidth + MARQUEE_GAP_PX : 0,
      };
      setMetrics((current) => current.containerWidth === next.containerWidth && current.textWidth === next.textWidth && current.distance === next.distance ? current : next);
    };

    const scheduleMeasure = () => {
      if (measureFrameRef.current !== null) cancelAnimationFrame(measureFrameRef.current);
      measureFrameRef.current = requestAnimationFrame(() => {
        measureFrameRef.current = null;
        measure();
      });
    };

    const timers = MEASURE_RETRY_MS.map((delay) => window.setTimeout(scheduleMeasure, delay));
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleMeasure) : null;
    resizeObserver?.observe(container);
    resizeObserver?.observe(measureNode);

    const fontSet = document.fonts;
    fontSet?.ready.then(scheduleMeasure).catch(() => undefined);
    fontSet?.addEventListener?.("loadingdone", scheduleMeasure);

    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleMeasure();
    };
    const onPageShow = () => scheduleMeasure();

    window.addEventListener("resize", scheduleMeasure, { passive: true });
    window.addEventListener("orientationchange", scheduleMeasure, { passive: true });
    window.addEventListener("pageshow", onPageShow, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleMeasure, { passive: true });
    window.visualViewport?.addEventListener("scroll", scheduleMeasure, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (measureFrameRef.current !== null) cancelAnimationFrame(measureFrameRef.current);
      timers.forEach((timer) => window.clearTimeout(timer));
      resizeObserver?.disconnect();
      fontSet?.removeEventListener?.("loadingdone", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("orientationchange", scheduleMeasure);
      window.removeEventListener("pageshow", onPageShow);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [text]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !shouldAnimate) {
      setEngine(reducedMotion && isOverflowing ? "reduced-motion" : "idle");
      return;
    }

    const timing = resolveMarqueeTiming(metrics.distance);
    let animation: Animation | null = null;
    let fallbackFrame: number | null = null;
    let fallbackStartedAt = performance.now();
    let restartFrame: number | null = null;
    let disposed = false;

    const stop = () => {
      animation?.cancel();
      animation = null;
      if (fallbackFrame !== null) cancelAnimationFrame(fallbackFrame);
      fallbackFrame = null;
      if (restartFrame !== null) cancelAnimationFrame(restartFrame);
      restartFrame = null;
      track.style.transform = "translate3d(0,0,0)";
    };

    const startRafFallback = () => {
      setEngine("raf");
      fallbackStartedAt = performance.now();
      const tick = (now: number) => {
        if (disposed || document.visibilityState === "hidden") return;
        const offset = marqueeOffsetAt(now - fallbackStartedAt, timing);
        track.style.transform = `translate3d(${offset}px,0,0)`;
        fallbackFrame = requestAnimationFrame(tick);
      };
      fallbackFrame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (disposed || document.visibilityState === "hidden") return;
      stop();
      track.style.transform = "translate3d(0,0,0)";
      void track.offsetWidth;

      if (typeof track.animate === "function") {
        try {
          setEngine("waapi");
          animation = track.animate([
            { transform: "translate3d(0,0,0)", offset: 0 },
            { transform: "translate3d(0,0,0)", offset: timing.startTravelOffset },
            { transform: `translate3d(${-timing.distancePx}px,0,0)`, offset: timing.endTravelOffset },
            { transform: `translate3d(${-timing.distancePx}px,0,0)`, offset: 1 },
          ], {
            duration: timing.cycleMs,
            iterations: Number.POSITIVE_INFINITY,
            easing: "linear",
            fill: "both",
          });
          animation.play();
          return;
        } catch {
          animation = null;
        }
      }

      startRafFallback();
    };

    const restart = () => {
      if (disposed || document.visibilityState === "hidden") return;
      stop();
      restartFrame = requestAnimationFrame(start);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") restart();
      else stop();
    };

    start();
    window.addEventListener("pageshow", restart, { passive: true });
    window.addEventListener("orientationchange", restart, { passive: true });
    window.visualViewport?.addEventListener("resize", restart, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener("pageshow", restart);
      window.removeEventListener("orientationchange", restart);
      window.visualViewport?.removeEventListener("resize", restart);
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [isOverflowing, metrics.distance, reducedMotion, shouldAnimate, text]);

  useEffect(() => {
    if (!DEBUG_MARQUEE) return;
    console.info("[WaveAtlas marquee]", {
      text,
      engine,
      isOverflowing,
      reducedMotion,
      containerWidth: metrics.containerWidth,
      textWidth: metrics.textWidth,
      distance: metrics.distance,
      visibilityState: document.visibilityState,
      visualViewport: window.visualViewport ? {
        width: window.visualViewport.width,
        height: window.visualViewport.height,
        scale: window.visualViewport.scale,
      } : null,
    });
  }, [engine, isOverflowing, metrics, reducedMotion, text]);

  const state = metrics.containerWidth <= 0 || metrics.textWidth <= 0
    ? "measuring"
    : reducedMotion && isOverflowing
      ? "reduced-motion"
      : isOverflowing
        ? "overflow"
        : "fit";

  return (
    <div
      ref={containerRef}
      className={`waveatlas-auto-marquee ${isOverflowing ? "is-overflowing" : ""} ${className}`}
      style={{ maskImage: "none", WebkitMaskImage: "none" }}
      title={text}
      aria-label={text}
      data-waveatlas-marquee-state={state}
      data-waveatlas-marquee-engine={engine}
      data-waveatlas-marquee-container-width={metrics.containerWidth || undefined}
      data-waveatlas-marquee-text-width={metrics.textWidth || undefined}
    >
      <span
        ref={measureRef}
        className="waveatlas-auto-marquee__measure"
        aria-hidden="true"
        style={{ display: "inline-block", width: "max-content" }}
      >
        {text}
      </span>
      {shouldAnimate ? (
        <span ref={trackRef} className="waveatlas-auto-marquee__track" aria-hidden="true" style={trackStyle}>
          <span className="waveatlas-auto-marquee__text">{text}</span>
          <span className="waveatlas-auto-marquee__text waveatlas-auto-marquee__text--ghost">{text}</span>
        </span>
      ) : (
        <span className="waveatlas-auto-marquee__text">{text}</span>
      )}
    </div>
  );
}
