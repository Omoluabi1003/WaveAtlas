"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type AutoMarqueeTextProps = {
  text: string;
  className?: string;
};

const OVERFLOW_EPSILON_PX = 1;
const MARQUEE_GAP_PX = 44;
const MARQUEE_MASK = "linear-gradient(90deg, transparent 0, #000 .85rem, #000 calc(100% - .85rem), transparent 100%)";

type MarqueeStyle = CSSProperties & {
  "--waveatlas-marquee-distance": string;
  "--waveatlas-marquee-offset": string;
};

export function AutoMarqueeText({ text, className = "" }: AutoMarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const measuredWidth = measureRef.current?.getBoundingClientRect().width ?? 0;
      const renderedTextWidth = Math.ceil(Math.max(measuredWidth, measureRef.current?.scrollWidth ?? 0));
      const availableWidth = Math.floor(container.getBoundingClientRect().width || container.clientWidth);
      const overflowDistance = Math.max(0, renderedTextWidth - availableWidth);
      setIsOverflowing(availableWidth > 0 && overflowDistance > OVERFLOW_EPSILON_PX);
      setDistance(renderedTextWidth > 0 ? renderedTextWidth + MARQUEE_GAP_PX : 0);
    };

    const scheduleMeasure = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measure();
      });
    };

    scheduleMeasure();

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleMeasure) : undefined;
    resizeObserver?.observe(container);
    if (measureRef.current) resizeObserver?.observe(measureRef.current);

    const fontSet = document.fonts;
    fontSet?.ready.then(scheduleMeasure).catch(() => undefined);
    fontSet?.addEventListener?.("loadingdone", scheduleMeasure);

    window.addEventListener("resize", scheduleMeasure, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleMeasure, { passive: true });
    window.addEventListener("orientationchange", scheduleMeasure, { passive: true });

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      resizeObserver?.disconnect();
      fontSet?.removeEventListener?.("loadingdone", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("orientationchange", scheduleMeasure);
    };
  }, [text]);

  const style = {
    "--waveatlas-marquee-distance": `${distance}px`,
    "--waveatlas-marquee-offset": `${-distance}px`,
    ...(isOverflowing ? { maskImage: MARQUEE_MASK, WebkitMaskImage: MARQUEE_MASK } : {}),
  } as MarqueeStyle;

  return (
    <>
      <div
        ref={containerRef}
        className={`waveatlas-auto-marquee ${isOverflowing ? "is-overflowing" : ""} ${className}`}
        style={style}
        title={text}
        aria-label={text}
      >
        <span ref={measureRef} className="waveatlas-auto-marquee__measure">{text}</span>
        {isOverflowing ? (
          <span
            className="waveatlas-auto-marquee__track"
            aria-hidden="true"
            style={{ animationName: "waveatlas-auto-marquee-scroll-v2", animationPlayState: "running" }}
          >
            <span className="waveatlas-auto-marquee__text">{text}</span>
            <span className="waveatlas-auto-marquee__text waveatlas-auto-marquee__text--ghost">{text}</span>
          </span>
        ) : (
          <span className="waveatlas-auto-marquee__text">{text}</span>
        )}
      </div>
      <style jsx global>{`
        @keyframes waveatlas-auto-marquee-scroll-v2 {
          0%, 14% { transform: translate3d(0, 0, 0); }
          86%, 100% { transform: translate3d(var(--waveatlas-marquee-offset, 0px), 0, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .waveatlas-auto-marquee.is-overflowing .waveatlas-auto-marquee__track {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </>
  );
}
