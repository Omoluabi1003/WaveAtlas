"use client";

import { Pause, Play, Volume2 } from "lucide-react";
import { flagFor, type Station, type StationInventoryStats } from "@/lib/stations";
import styles from "@/components/GeoAwareExperience.module.css";

type GeoAwareExperienceProps = {
  station: Station;
  status: "idle" | "buffering" | "playing" | "paused" | "blocked" | "failed";
  playing: boolean;
  volume: number;
  inventoryStats?: StationInventoryStats;
  onTogglePlayback: () => void;
};

function stationText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function stationCountry(station: Station) {
  const code = stationText(station.country_code).toUpperCase();
  const country = stationText(station.country, code || "Earth");
  return `${code ? `${flagFor(code)} ` : ""}${country}`;
}

export function GeoAwareExperience({ station, status, playing, volume, inventoryStats, onTogglePlayback }: GeoAwareExperienceProps) {
  const stationName = stationText(station.name, "Unknown station");
  const city = stationText(station.city);
  const state = stationText(station.state);
  const language = stationText(station.language);
  const place = [city, state, stationCountry(station)].filter(Boolean).join(" · ");
  const stationTags = Array.isArray(station.tags) ? station.tags : [];
  const tags = stationTags
    .map((tag) => stationText(tag))
    .filter(Boolean)
    .slice(0, 4)
    .join(" · ") || language || "Live local signal";
  const passport = inventoryStats
    ? `${inventoryStats.globalCount.toLocaleString()} indexed global signals${inventoryStats.source === "radio-browser" ? " from Radio Browser inventory" : " in curated passport mode"}.`
    : "Daily Passport intelligence appears here when fresh inventory context is available.";
  return (
    <section className={styles.shell} aria-label="GeoAware cinematic Earth experience">
      <div className={styles.stars} />
      <div className={styles.halo} />
      <div className={styles.earthWrap} aria-hidden="true">
        <div className={styles.earth} />
        <div className={styles.clouds} />
        <div className={styles.terminator} />
        <div className={styles.beacon} />
      </div>
      <article className={styles.card}>
        <p className={styles.eyebrow}>GeoAware™ · cinematic discovery</p>
        <h1 className={styles.title}>{stationName}</h1>
        <p className={styles.meta}>{place}</p>
        <p className={styles.meta}>{tags}</p>
        <div className={styles.controls}>
          <button type="button" onClick={onTogglePlayback} className={styles.button} aria-label={playing ? "Pause station" : "Play station"}>{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
          <Volume2 className="size-4 text-radio" />
          <span className="text-sm text-ivory/70">{status === "buffering" ? "Tuning signal…" : status} · {Math.round(volume * 100)}%</span>
        </div>
        <p className={styles.passport}><b className="text-gold">Daily Passport</b><br />{passport}</p>
      </article>
    </section>
  );
}
