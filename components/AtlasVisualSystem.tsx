"use client";

import { useEffect, useRef, useState } from "react";

type PlaybackContext = { status?: string };
type Particle = { x: number; y: number; vx: number; vy: number; size: number; phase: number };

export function AtlasVisualSystem() {
  const [status, setStatus] = useState("idle");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  useEffect(() => {
    const root = document.documentElement;
    let dock: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const syncDockHeight = () => {
      const next = document.querySelector<HTMLElement>(".waveatlas-mobile-dock > div");
      if (!next) return;
      if (dock !== next) {
        resizeObserver?.disconnect();
        dock = next;
        resizeObserver = new ResizeObserver(() => {
          root.style.setProperty("--waveatlas-mobile-dock-height", `${Math.ceil(next.getBoundingClientRect().height)}px`);
        });
        resizeObserver.observe(next);
      }
      root.style.setProperty("--waveatlas-mobile-dock-height", `${Math.ceil(next.getBoundingClientRect().height)}px`);
    };

    syncDockHeight();
    mutationObserver = new MutationObserver(syncDockHeight);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", syncDockHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", syncDockHeight, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", syncDockHeight);
      window.visualViewport?.removeEventListener("resize", syncDockHeight);
      root.style.removeProperty("--waveatlas-mobile-dock-height");
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let pointerX = 0.5;
    let pointerY = 0.38;
    let particles: Particle[] = [];

    const reset = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = width < 768 ? 42 : 78;
      particles = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * (index % 3 === 0 ? 0.23 : 0.12),
        vy: (Math.random() - 0.5) * 0.11,
        size: 0.7 + Math.random() * 1.55,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const onPointer = (event: PointerEvent) => {
      pointerX = event.clientX / Math.max(1, width);
      pointerY = event.clientY / Math.max(1, height);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const playing = document.documentElement.dataset.waveatlasPlayback === "playing";
      const buffering = document.documentElement.dataset.waveatlasPlayback === "buffering";
      const energy = playing ? 1 : buffering ? 0.82 : 0.56;
      const cx = width * pointerX;
      const cy = height * pointerY;

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.48);
      glow.addColorStop(0, `rgba(86,245,187,${0.11 * energy})`);
      glow.addColorStop(0.38, `rgba(98,217,255,${0.055 * energy})`);
      glow.addColorStop(1, "rgba(2,6,13,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.lineWidth = 0.65;
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (!reducedMotion) {
          p.x += p.vx * energy;
          p.y += p.vy * energy;
          if (p.x < -16) p.x = width + 16;
          if (p.x > width + 16) p.x = -16;
          if (p.y < -16) p.y = height + 16;
          if (p.y > height + 16) p.y = -16;
        }
        const pulse = 0.56 + Math.sin(time * 0.0014 + p.phase) * 0.28;
        ctx.beginPath();
        ctx.fillStyle = i % 5 === 0 ? `rgba(232,189,106,${0.28 * pulse})` : `rgba(121,242,218,${0.35 * pulse})`;
        ctx.arc(p.x, p.y, p.size * (playing ? 1.18 : 1), 0, Math.PI * 2);
        ctx.fill();

        if (i % 2 === 0) {
          for (let j = i + 1; j < Math.min(particles.length, i + 9); j += 1) {
            const q = particles[j];
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 112) {
              ctx.beginPath();
              ctx.strokeStyle = `rgba(98,217,255,${(1 - distance / 112) * 0.075 * energy})`;
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
            }
          }
        }
      }

      const ringRadius = Math.min(width, height) * (width < 768 ? 0.315 : 0.27);
      const ringX = width * 0.5;
      const ringY = height * (width < 768 ? 0.43 : 0.48);
      for (let i = 0; i < 3; i += 1) {
        const drift = reducedMotion ? 0 : Math.sin(time * 0.00042 + i) * 4;
        ctx.beginPath();
        ctx.strokeStyle = i === 0 ? `rgba(86,245,187,${0.07 * energy})` : `rgba(98,217,255,${0.045 * energy})`;
        ctx.lineWidth = i === 0 ? 1.2 : 0.7;
        ctx.arc(ringX, ringY, ringRadius + i * 28 + drift, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
      }

      if (!reducedMotion) frame = window.requestAnimationFrame(draw);
    };

    reset();
    window.addEventListener("resize", reset, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    draw(performance.now());

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", reset);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <div className="atlas-visual-system" aria-hidden="true" data-status={status}>
      <canvas ref={canvasRef} className="atlas-visual-system__canvas" />
      <div className="atlas-visual-system__mesh" />
      <div className="atlas-visual-system__aurora atlas-visual-system__aurora--one" />
      <div className="atlas-visual-system__aurora atlas-visual-system__aurora--two" />
      <div className="atlas-visual-system__scan" />
      <div className="atlas-visual-system__grain" />
    </div>
  );
}
