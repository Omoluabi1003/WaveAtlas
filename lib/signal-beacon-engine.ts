export type SignalBeaconStatus = "idle" | "playing" | "paused" | "buffering" | "failed" | "blocked";
export type SignalBeaconPoint = { lat: number; lng: number };

export function signalBeaconTravelDuration(distanceKm: number) {
  return Math.max(700, Math.min(4200, 650 + distanceKm * 0.55));
}

export function interpolateSignalBeacon(start: SignalBeaconPoint, target: SignalBeaconPoint, progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  const eased = 1 - Math.pow(1 - t, 3);
  const lngDelta = ((((target.lng - start.lng) % 360) + 540) % 360) - 180;
  return { lat: start.lat + (target.lat - start.lat) * eased, lng: start.lng + lngDelta * eased };
}

export function signalBeaconHtml() {
  return `<span class="station-beacon-glow" aria-hidden="true"></span><span class="station-pulse-ring radio-wave one"></span><span class="station-pulse-ring radio-wave two"></span><span class="station-pulse-ring radio-wave three"></span><span class="station-signal-accent" aria-hidden="true"></span><span class="station-beacon-core" aria-hidden="true"></span><span class="station-pulse-dot" aria-hidden="true"></span>`;
}

export function signalBeaconClassName(tone: string, status: SignalBeaconStatus) {
  return `station-pulse-marker tone-${tone} status-${status}`;
}

export function drawSignalBeacon(ctx: CanvasRenderingContext2D, x: number, y: number, options: { now: number; mobile?: boolean; lowPower?: boolean; reducedMotion?: boolean; visibility?: number; landingPulseStartedAt?: number | null }) {
  const { now, mobile = false, lowPower = false, reducedMotion = false, visibility = 1, landingPulseStartedAt = null } = options;
  const liveNow = Number.isFinite(now) && now > 0 ? now : performance.now();
  const landingPulseAge = landingPulseStartedAt ? liveNow - landingPulseStartedAt : 9999;
  const landingBoost = landingPulseAge < 520 ? 1 + (1 - landingPulseAge / 520) * 0.42 : 1;
  const pulsePeriod = reducedMotion ? (mobile ? 1320 : 960) : (mobile ? 360 : 180);
  const pulseAmplitude = reducedMotion ? (mobile ? 0.045 : 0.1) : (mobile ? 0.08 : 0.22);
  const pulse = (1 + Math.sin(liveNow / pulsePeriod) * pulseAmplitude) * landingBoost;
  ctx.save();
  ctx.globalAlpha = visibility;
  ctx.shadowColor = "rgba(255,59,48,0.58)";
  ctx.shadowBlur = mobile || lowPower ? 18 : 30;
  ctx.fillStyle = mobile || lowPower ? "rgba(229,57,53,0.14)" : "rgba(229,57,53,0.20)";
  ctx.beginPath(); ctx.arc(x, y, (mobile ? 13 : 18) * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = mobile || lowPower ? 24 : 42;
  ctx.strokeStyle = "rgba(255,255,255,0.58)"; ctx.lineWidth = mobile ? 1.1 : 1.4;
  ctx.beginPath(); ctx.arc(x, y, (mobile ? 17 : 23) * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(214,168,79,0.42)"; ctx.lineWidth = mobile ? 1 : 1.2;
  ctx.beginPath(); ctx.arc(x, y, (mobile ? 22 : 30) * (0.82 + (pulse - 1) * 0.7), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#ff3838";
  ctx.beginPath(); ctx.arc(x, y, mobile ? 5 : 6, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}
