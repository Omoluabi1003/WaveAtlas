export type AtlasParticleState = 'live' | 'listening' | 'thinking' | 'speaking';
export type AtlasSpectrum = { bass: number; mids: number; treble: number };
export const ATLAS_PARTICLE_COLORS = [
  [0, 0.84, 0.56],
  [0.31, 0.78, 0.76],
  [0.83, 0.65, 0.29],
  [0.97, 0.96, 0.94],
  [0.24, 0.57, 0.96],
] as const;

const STATE_VELOCITY_MULTIPLIERS: Record<AtlasParticleState, number> = {
  live: 0.65,
  listening: 1.0,
  thinking: 1.25,
  speaking: 1.5,
};

export function particleBudget(width: number, cores = 4, reduced = false) {
  return reduced ? 360 : width < 640 || cores <= 4 ? 720 : 1600;
}

export function spectrumBands(samples: Uint8Array, sampleRate: number, fftSize: number): AtlasSpectrum {
  const average = (low: number, high: number) => {
    const start = Math.max(1, Math.ceil((low * fftSize) / sampleRate));
    const end = Math.min(samples.length, Math.ceil((high * fftSize) / sampleRate));
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i];
    return end > start ? sum / ((end - start) * 255) : 0;
  };
  return { bass: average(60, 300), mids: average(300, 2400), treble: average(2400, 9000) };
}

// Fibonacci distribution for deterministic seed distribution on unit sphere.
export function createParticleSeeds(count: number) {
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + 0.5) / count;
    const radius = Math.sqrt(1 - y * y);
    const angle = i * 2.39996323;
    seeds.set([Math.cos(angle) * radius, y, Math.sin(angle) * radius], i * 3);
  }
  return seeds;
}

export class PersistentParticleSystem {
  count: number;
  positions: Float32Array;
  velocities: Float32Array;
  accelerations: Float32Array;
  phases: Float32Array;
  baseSizes: Float32Array;
  colors: Float32Array;
  stateMultiplier = 0.65;
  elapsed = 0;
  lastTime: number | null = null;

  constructor(seeds: Float32Array) {
    this.count = seeds.length / 3;
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.accelerations = new Float32Array(this.count * 3);
    this.phases = new Float32Array(this.count);
    this.baseSizes = new Float32Array(this.count);
    this.colors = new Float32Array(this.count * 3);

    for (let i = 0; i < this.count; i++) {
      const sx = seeds[i * 3];
      const sy = seeds[i * 3 + 1];
      const sz = seeds[i * 3 + 2];

      // Initial positions distributed in shell volume
      const shellRad = 0.55 + (Math.abs(Math.sin(i * 1.7)) * 0.4);
      this.positions[i * 3] = sx * shellRad;
      this.positions[i * 3 + 1] = sy * shellRad;
      this.positions[i * 3 + 2] = sz * shellRad;

      // Independent velocity bounds: x: [-0.45, 0.45], y: [-0.45, 0.45], z: [-0.15, 0.15]
      const dirX = (i % 7 === 0 ? -1 : 1) * (0.15 + ((i % 11) / 11) * 0.3);
      const dirY = (i % 5 === 0 ? -1 : 1) * (0.15 + ((i % 13) / 13) * 0.3);
      const dirZ = (i % 3 === 0 ? -1 : 1) * (0.04 + ((i % 17) / 17) * 0.11);

      this.velocities[i * 3] = Math.max(-0.45, Math.min(0.45, dirX));
      this.velocities[i * 3 + 1] = Math.max(-0.45, Math.min(0.45, dirY));
      this.velocities[i * 3 + 2] = Math.max(-0.15, Math.min(0.15, dirZ));

      this.phases[i] = i * 2.39996323;
      this.baseSizes[i] = 0.65 + ((i % 19) / 19) * 0.35;

      const color = ATLAS_PARTICLE_COLORS[i % 17 === 0 ? 4 : i % 11 === 0 ? 3 : i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0];
      this.colors[i * 3] = color[0];
      this.colors[i * 3 + 1] = color[1];
      this.colors[i * 3 + 2] = color[2];
    }
  }
}

const systemCache = new WeakMap<Float32Array, PersistentParticleSystem>();

export function getParticleSystem(seeds: Float32Array): PersistentParticleSystem {
  let sys = systemCache.get(seeds);
  if (!sys || sys.count !== seeds.length / 3) {
    sys = new PersistentParticleSystem(seeds);
    systemCache.set(seeds, sys);
  }
  return sys;
}

/**
 * Velocity-driven, audio-reactive particle update simulation loop.
 * Updates interleaved output Float32Array:
 * [x, y, z, r, g, b, alpha, pointSize] per particle.
 */
export function updateParticles(
  seeds: Float32Array,
  output: Float32Array,
  time: number,
  state: AtlasParticleState,
  spectrum: AtlasSpectrum,
  reduced: boolean,
  systemOverride?: PersistentParticleSystem
) {
  const sys = systemOverride || getParticleSystem(seeds);
  const count = sys.count;

  // Determine total delta time
  let totalDt = 0.016;
  if (sys.lastTime !== null) {
    const rawDelta = time - sys.lastTime;
    if (rawDelta > 0 && rawDelta <= 2.0) {
      totalDt = rawDelta;
    } else if (time > 0 && time <= 2.0) {
      totalDt = time;
    }
  } else if (time > 0 && time <= 2.0) {
    totalDt = time;
  }
  sys.lastTime = time;

  // Substep physics loop for stability and accuracy across variable delta times
  const maxSubstep = 0.02;
  const substeps = Math.min(25, Math.max(1, Math.ceil(totalDt / maxSubstep)));
  const subDt = totalDt / substeps;

  const isAudioActive = state === 'speaking' || state === 'listening';
  const bassFactor = isAudioActive ? spectrum.bass : 0;
  const midsFactor = isAudioActive ? spectrum.mids : 0;
  const trebleFactor = isAudioActive ? spectrum.treble : 0;

  // For reduced motion preference, internally scale target velocity down without leaving particles frozen
  const baseTargetMult = STATE_VELOCITY_MULTIPLIERS[state] ?? 0.65;
  const targetMult = reduced ? baseTargetMult * 0.35 : baseTargetMult;

  for (let s = 0; s < substeps; s++) {
    sys.elapsed += subDt;
    const t = sys.elapsed;
    const fpsScale = subDt * 60;

    // Smooth state transition for velocity multiplier
    sys.stateMultiplier += (targetMult - sys.stateMultiplier) * (1 - Math.exp(-subDt * 5));
    const mult = sys.stateMultiplier;

    const accelStrength = 0.015;
    const damping = Math.pow(0.985, fpsScale);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const px = sys.positions[i3];
      const py = sys.positions[i3 + 1];
      const pz = sys.positions[i3 + 2];

      const phase = sys.phases[i];

      // 1. Organic Drift Force (noise-based with position and phase harmonics)
      const driftX = Math.sin(t * 1.3 + phase + py * 2.5) * 0.12;
      const driftY = Math.cos(t * 1.1 + phase * 1.3 + px * 2.5) * 0.12;
      const driftZ = Math.sin(t * 1.5 + phase * 0.7 + pz * 2.5) * 0.08;

      let ax = driftX;
      let ay = driftY;
      let az = driftZ;

      // 2. State-Specific Dynamics & Forces
      const distSq = px * px + py * py + pz * pz;
      const dist = Math.sqrt(distSq) || 0.001;

      if (state === 'live') {
        // Idle: slow breathing orbital drift
        const orbitX = -py * 0.35;
        const orbitY = px * 0.35;
        const orbitZ = Math.sin(t * 0.8 + phase) * 0.12;
        const breath = Math.sin(t * 0.7) * 0.08;
        ax += orbitX + px * breath;
        ay += orbitY + py * breath;
        az += orbitZ + pz * breath;
      } else if (state === 'listening') {
        // Listening: gentle attraction toward voice core with continuous circulation
        const coreAttract = (dist - 0.45) * -0.45;
        const circX = -py * 0.6;
        const circY = px * 0.6;
        const circZ = -pz * 0.2;
        ax += px * coreAttract + circX;
        ay += py * coreAttract + circY;
        az += pz * coreAttract + circZ;
      } else if (state === 'thinking') {
        // Thinking: organized swirling vortex with subtle acceleration
        const vortexX = -py * 1.4 - px * 0.15;
        const vortexY = px * 1.4 - py * 0.15;
        const vortexZ = Math.cos(t * 2.2 + phase) * 0.35;
        ax += vortexX;
        ay += vortexY;
        az += vortexZ;
      } else if (state === 'speaking') {
        // Speaking: audio-reactive expansion, contraction and directional energy pulses
        const radialPulse = (bassFactor * 1.8 + Math.sin(t * 3.5 - dist * 4.0) * (0.2 + midsFactor * 0.8)) * 0.8;
        const orbitalFlowX = -py * (0.4 + midsFactor * 0.8);
        const orbitalFlowY = px * (0.4 + midsFactor * 0.8);
        ax += px * radialPulse + orbitalFlowX;
        ay += py * radialPulse + orbitalFlowY;
        az += pz * radialPulse;
      }

      // 3. Velocity Integration & Acceleration
      let vx = sys.velocities[i3] + ax * accelStrength * fpsScale;
      let vy = sys.velocities[i3 + 1] + ay * accelStrength * fpsScale;
      let vz = sys.velocities[i3 + 2] + az * accelStrength * fpsScale;

      // Apply physics damping
      vx *= damping;
      vy *= damping;
      vz *= damping;

      // Clamp velocity components within specs (scaled by state velocity multiplier)
      const maxVx = 0.45 * mult;
      const maxVy = 0.45 * mult;
      const maxVz = 0.15 * mult;
      vx = Math.max(-maxVx, Math.min(maxVx, vx));
      vy = Math.max(-maxVy, Math.min(maxVy, vy));
      vz = Math.max(-maxVz, Math.min(maxVz, vz));

      sys.velocities[i3] = vx;
      sys.velocities[i3 + 1] = vy;
      sys.velocities[i3 + 2] = vz;

      // 4. Position Integration: position += velocity * deltaTime
      let newPx = px + vx * subDt * mult;
      let newPy = py + vy * subDt * mult;
      let newPz = pz + vz * subDt * mult;

      // 5. Boundary behavior: soft_wrap
      const newDist = Math.hypot(newPx, newPy, newPz);
      if (newDist > 1.22) {
        // Soft wrap to opposite side with continuous velocity vector across volume
        const scale = 0.88 / newDist;
        newPx = -newPx * scale;
        newPy = -newPy * scale;
        newPz = -newPz * scale;
      }

      sys.positions[i3] = newPx;
      sys.positions[i3 + 1] = newPy;
      sys.positions[i3 + 2] = newPz;
    }
  }

  // Write final rendering positions and visual attributes
  const tFinal = sys.elapsed;
  const multFinal = sys.stateMultiplier;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const px = sys.positions[i3];
    const py = sys.positions[i3 + 1];
    const pz = sys.positions[i3 + 2];

    const vx = sys.velocities[i3];
    const vy = sys.velocities[i3 + 1];
    const vz = sys.velocities[i3 + 2];

    const phase = sys.phases[i];

    // 6. Visual rendering attributes & depth parallax projection
    const z = pz;
    const perspective = 1 / (1.7 - z * 0.28);
    const screenX = px * perspective * 1.8;
    const screenY = py * perspective * 1.8;

    const front = (z + 1) / 2; // 0 (back) to 1 (front)
    const speed = Math.hypot(vx, vy, vz);

    // Treble micro-bursts and shimmer
    const isShimmerParticle = (i % 7 === 0) || (i % 13 === 0);
    const trebleShimmer = isAudioActive && isShimmerParticle ? trebleFactor * Math.max(0, Math.sin(phase + tFinal * 9.0)) : 0;

    const baseRadius = sys.baseSizes[i];
    const radius = (baseRadius + front * 0.28 + trebleShimmer * 0.45 + speed * 0.25) * perspective;

    const r = sys.colors[i3];
    const g = sys.colors[i3 + 1];
    const b = sys.colors[i3 + 2];

    const alpha = Math.min(1.0, 0.18 + front * 0.62 + speed * 0.38 + trebleShimmer * 0.85);

    const offset = i * 8;
    output[offset] = screenX;
    output[offset + 1] = screenY;
    output[offset + 2] = z;
    output[offset + 3] = r;
    output[offset + 4] = g;
    output[offset + 5] = b;
    output[offset + 6] = alpha;
    output[offset + 7] = radius;
  }
}

// Particle Trails with velocity-dependent trail length and brightness scaling.
export function particleTrails(current: Float32Array, history: Float32Array[], output: Float32Array) {
  output.set(current);
  const layerCount = history.length;
  const pSize = current.length;

  for (let layer = 0; layer < layerCount; layer++) {
    const previous = history[layer];
    const offset = pSize * (layer + 1);
    output.set(previous, offset);

    const layerFactor = 1 - (layer + 1) / (layerCount + 1);
    for (let i = 0; i < previous.length; i += 8) {
      // Velocity / brightness factor from current particle state
      const currAlpha = current[i + 6];
      const speedFactor = Math.min(1.8, Math.max(0.6, currAlpha * 1.4));

      // Fast particles display slightly longer trails and higher brightness
      output[offset + i + 6] *= 0.42 * layerFactor * speedFactor;
      output[offset + i + 7] *= (0.85 - layer * 0.1) * Math.min(1.3, 0.85 + speedFactor * 0.25);
    }
  }

  for (let layer = layerCount - 1; layer > 0; layer--) {
    history[layer].set(history[layer - 1]);
  }
  history[0]?.set(current);
}
