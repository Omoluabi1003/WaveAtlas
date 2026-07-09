"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type AutoMarqueeTextProps = {
  text: string;
  className?: string;
};

const OVERFLOW_EPSILON_PX = 1;
const MARQUEE_GAP_PX = 44;

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
      const renderedTextWidth = measureRef.current?.scrollWidth ?? container.scrollWidth;
      const overflowDistance = Math.max(0, renderedTextWidth - container.clientWidth);
      setIsOverflowing(overflowDistance > OVERFLOW_EPSILON_PX);
      setDistance(renderedTextWidth + MARQUEE_GAP_PX);
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

    window.addEventListener("resize", scheduleMeasure);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      resizeObserver?.disconnect();
      fontSet?.removeEventListener?.("loadingdone", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={`waveatlas-auto-marquee ${isOverflowing ? "is-overflowing" : ""} ${className}`}
      style={{ "--waveatlas-marquee-distance": `${distance}px` } as CSSProperties}
      title={text}
      aria-label={text}
    >
      <span ref={measureRef} className="waveatlas-auto-marquee__measure">{text}</span>
      {isOverflowing ? (
        <span className="waveatlas-auto-marquee__track" aria-hidden="true">
          <span className="waveatlas-auto-marquee__text">{text}</span>
          <span className="waveatlas-auto-marquee__text waveatlas-auto-marquee__text--ghost">{text}</span>
        </span>
      ) : (
        <span className="waveatlas-auto-marquee__text">{text}</span>
      )}
    </div>
  );
}
