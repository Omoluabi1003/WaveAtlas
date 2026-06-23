export type SignalBeaconStatus = "idle" | "playing" | "paused" | "buffering" | "failed" | "blocked";
export type SignalBeaconPoint = { lat: number; lng: number };
export type SignalBeaconLabel = { place: string; mood: string; station: string };

export function signalBeaconTravelDuration(distanceKm: number) {
  return Math.max(700, Math.min(4200, 650 + distanceKm * 0.55));
}

export function interpolateSignalBeacon(start: SignalBeaconPoint, target: SignalBeaconPoint, progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  const eased = 1 - Math.pow(1 - t, 3);
  const lngDelta = ((((target.lng - start.lng) % 360) + 540) % 360) - 180;
  return { lat: start.lat + (target.lat - start.lat) * eased, lng: start.lng + lngDelta * eased };
}

function escapeBeaconText(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
}

export function signalBeaconHtml(label?: SignalBeaconLabel) {
  const labelHtml = label ? `<span class="station-living-label"><b>${escapeBeaconText(label.place)}</b><span>${escapeBeaconText(label.mood)}</span><em>${escapeBeaconText(label.station)}</em></span>` : "";
  return `<span class="station-beacon-glow" aria-hidden="true"></span><span class="station-pulse-ring radio-wave one"></span><span class="station-pulse-ring radio-wave two"></span><span class="station-pulse-ring radio-wave three"></span><span class="station-signal-accent" aria-hidden="true"></span><span class="station-beacon-core" aria-hidden="true"></span><span class="station-pulse-dot" aria-hidden="true"></span>${labelHtml}`;
}

export function signalBeaconClassName(tone: string, status: SignalBeaconStatus) {
  return `station-pulse-marker tone-${tone} status-${status}`;
}

export function drawSignalBeacon(ctx: CanvasRenderingContext2D, x: number, y: number, options: { now: number; mobile?: boolean; lowPower?: boolean; reducedMotion?: boolean; visibility?: number; landingPulseStartedAt?: number | null }) {
  const { now, mobile = false, lowPower = false, reducedMotion = false, visibility = 1, landingPulseStartedAt = null } = options;
  const landingPulseAge = landingPulseStartedAt ? now - landingPulseStartedAt : 9999;
  const landingBoost = landingPulseAge < 520 ? 1 + (1 - landingPulseAge / 520) * 0.42 : 1;
  const pulse = reducedMotion ? 1 : (1 + Math.sin(now / (mobile ? 360 : 180)) * (mobile ? 0.08 : 0.22)) * landingBoost;
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
