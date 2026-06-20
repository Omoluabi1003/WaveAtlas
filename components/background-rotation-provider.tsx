"use client";

import Image from "next/image";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WAVEATLAS_BACKGROUNDS, type WaveAtlasBackground } from "@/lib/backgrounds";

const BACKGROUND_STORAGE_KEY = "waveatlas:background";
const ROTATION_INTERVAL_MS = 30 * 60 * 1000;

type StoredBackground = {
  id: string;
  updatedAt: number;
};

function chooseBackground(previousId?: string): WaveAtlasBackground {
  const candidates = WAVEATLAS_BACKGROUNDS.filter((background) => background.id !== previousId);
  const pool = candidates.length ? candidates : WAVEATLAS_BACKGROUNDS;
  return pool[Math.floor(Math.random() * pool.length)] ?? WAVEATLAS_BACKGROUNDS[0];
}

function readStoredBackground(): WaveAtlasBackground | null {
  try {
    const raw = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredBackground>;
    if (typeof stored.id !== "string") return null;
    return WAVEATLAS_BACKGROUNDS.find((background) => background.id === stored.id) ?? null;
  } catch {
    return null;
  }
}

function persistBackground(background: WaveAtlasBackground) {
  try {
    window.localStorage.setItem(
      BACKGROUND_STORAGE_KEY,
      JSON.stringify({ id: background.id, updatedAt: Date.now() } satisfies StoredBackground),
    );
  } catch {
    // Cosmetic persistence should never block the app shell.
  }
}

export function BackgroundRotationProvider({ children }: { children: React.ReactNode }) {
  const [background, setBackground] = useState<WaveAtlasBackground>(() => WAVEATLAS_BACKGROUNDS[0]);
  const [failedBackgroundIds, setFailedBackgroundIds] = useState<Set<string>>(() => new Set());
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isFirstImage, setIsFirstImage] = useState(true);

  const rotateBackground = useCallback((previousId?: string) => {
    setBackground((current) => {
      const next = chooseBackground(previousId ?? current.id);
      persistBackground(next);
      return next;
    });
  }, []);

  useEffect(() => {
    window.queueMicrotask(() => {
      const stored = readStoredBackground();
      if (stored) setBackground(stored);
      else rotateBackground(WAVEATLAS_BACKGROUNDS[0]?.id);
      setHasHydrated(true);
    });
  }, [rotateBackground]);

  useEffect(() => {
    if (!hasHydrated) return;
    const timer = window.setInterval(() => rotateBackground(), ROTATION_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasHydrated, rotateBackground]);

  const imageFailed = failedBackgroundIds.has(background.id);
  const attribution = useMemo(() => `${background.name} — ${background.attribution}`, [background]);

  return (
    <>
      <div className="waveatlas-ambient-background" aria-hidden="true">
        <div className="waveatlas-ambient-gradient" />
        {!imageFailed ? (
          <Image
            key={background.id}
            src={background.url}
            alt=""
            fill
            sizes="100vw"
            {...(isFirstImage ? { priority: true } : { loading: "lazy" as const })}
            className="waveatlas-ambient-image"
            onLoad={() => {
              setIsFirstImage(false);
            }}
            onError={() => {
              setIsFirstImage(false);
              setFailedBackgroundIds((ids) => new Set(ids).add(background.id));
            }}
          />
        ) : null}
        <span className="sr-only">Background: {attribution}</span>
      </div>
      {children}
    </>
  );
}
