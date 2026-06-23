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

const DEBUG_BEACON = process.env.NEXT_PUBLIC_WAVEATLAS_DEBUG_BEACON === "true";
let canvasBeaconDebugLogged = false;

export function logMapBeaconPulsePath(status: SignalBeaconStatus, tone: string) {
  if (!DEBUG_BEACON || typeof console === "undefined") return;
  console.debug("[WaveAtlas beacon] map DOM CSS pulse path active", { status, tone, rings: 3, timestamp: Date.now() });
}

export function drawSignalBeacon(ctx: CanvasRenderingContext2D, x: number, y: number, options: { now: number; mobile?: boolean; lowPower?: boolean; reducedMotion?: boolean; visibility?: number; landingPulseStartedAt?: number | null }) {
  const { now, mobile = false, lowPower = false, reducedMotion = false, visibility = 1, landingPulseStartedAt = null } = options;
  const liveNow = Number.isFinite(now) && now > 0 ? now : performance.now();
  const landingPulseAge = landingPulseStartedAt ? liveNow - landingPulseStartedAt : 9999;
  const landingBoost = landingPulseAge < 520 ? 1 + (1 - landingPulseAge / 520) * 0.42 : 1;
  const pulsePeriod = reducedMotion ? (mobile ? 1500 : 1180) : (mobile ? 1180 : 1040);
  const corePulsePeriod = reducedMotion ? (mobile ? 1350 : 1100) : (mobile ? 640 : 520);
  const pulseAmplitude = reducedMotion ? (mobile ? 0.14 : 0.18) : (mobile ? 0.24 : 0.32);
  const pulse = (1 + Math.sin(liveNow / corePulsePeriod) * pulseAmplitude) * landingBoost;
  const ringBaseRadius = mobile ? 16 : 22;
  const ringTravelRadius = (mobile ? 58 : 84) * (lowPower ? 0.86 : 1);
  const ringLineWidth = mobile ? 2.1 : 2.8;
  const ringColors = [
    { stroke: "rgba(255,255,255,0.92)", shadow: "rgba(255,59,48,0.72)" },
    { stroke: "rgba(255,201,92,0.78)", shadow: "rgba(214,168,79,0.52)" },
    { stroke: "rgba(54,245,162,0.64)", shadow: "rgba(0,214,143,0.40)" },
  ];
  if (DEBUG_BEACON && !canvasBeaconDebugLogged && typeof console !== "undefined") {
    canvasBeaconDebugLogged = true;
    console.debug("[WaveAtlas beacon] globe canvas pulse path active", { rings: ringColors.length, ringBaseRadius, ringTravelRadius, mobile, lowPower, reducedMotion, timestamp: Date.now() });
  }
  ctx.save();
  ctx.globalAlpha = visibility;
  ctx.shadowColor = "rgba(255,59,48,0.66)";
  ctx.shadowBlur = mobile || lowPower ? 24 : 42;
  ctx.fillStyle = mobile || lowPower ? "rgba(229,57,53,0.24)" : "rgba(229,57,53,0.30)";
  ctx.beginPath(); ctx.arc(x, y, (mobile ? 15 : 21) * pulse, 0, Math.PI * 2); ctx.fill();

  ringColors.forEach((ring, index) => {
    const phase = ((liveNow / pulsePeriod) + index / ringColors.length) % 1;
    const eased = 1 - Math.pow(1 - phase, 2.35);
    const radius = (ringBaseRadius + ringTravelRadius * eased) * landingBoost;
    const opacity = Math.max(0, Math.pow(1 - phase, 1.28));
    ctx.save();
    ctx.globalAlpha = visibility * (reducedMotion ? 0.38 + opacity * 0.36 : 0.08 + opacity * 0.84);
    ctx.shadowColor = ring.shadow;
    ctx.shadowBlur = mobile || lowPower ? 18 + 22 * opacity : 28 + 34 * opacity;
    ctx.strokeStyle = ring.stroke;
    ctx.lineWidth = ringLineWidth * (0.76 + opacity * 0.5);
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });

  ctx.shadowBlur = mobile || lowPower ? 26 : 48;
  ctx.fillStyle = "#ff3838";
  ctx.beginPath(); ctx.arc(x, y, (mobile ? 6.5 : 8) * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "white"; ctx.lineWidth = mobile ? 2.4 : 2.8; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath(); ctx.arc(x, y, mobile ? 2.1 : 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
