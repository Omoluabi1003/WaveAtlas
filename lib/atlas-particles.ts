export type AtlasParticleState = 'live' | 'listening' | 'thinking' | 'speaking';
export type AtlasSpectrum = { bass: number; mids: number; treble: number };
export const ATLAS_PARTICLE_COLORS = [[0, .84, .56], [.31, .78, .76], [.83, .65, .29], [.97, .96, .94], [.24, .57, .96]] as const;

export function particleBudget(width: number, cores = 4, reduced = false) {
  return reduced ? 360 : width < 640 || cores <= 4 ? 720 : 1600;
}

export function spectrumBands(samples: Uint8Array, sampleRate: number, fftSize: number): AtlasSpectrum {
  const average = (low: number, high: number) => {
    const start = Math.max(1, Math.ceil(low * fftSize / sampleRate));
    const end = Math.min(samples.length, Math.ceil(high * fftSize / sampleRate));
    let sum = 0; for (let i = start; i < end; i++) sum += samples[i];
    return end > start ? sum / ((end - start) * 255) : 0;
  };
  return { bass: average(60, 300), mids: average(300, 2400), treble: average(2400, 9000) };
}

// Fibonacci distribution keeps both renderers identical, with no random frame jitter.
export function createParticleSeeds(count: number) {
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + .5) / count, radius = Math.sqrt(1 - y * y), angle = i * 2.39996323;
    seeds.set([Math.cos(angle) * radius, y, Math.sin(angle) * radius], i * 3);
  }
  return seeds;
}

// Interleaved x/y/depth, RGB, alpha, and point radius for one GPU draw call.
export function updateParticles(seeds: Float32Array, output: Float32Array, time: number, state: AtlasParticleState, spectrum: AtlasSpectrum, reduced: boolean) {
  const count = seeds.length / 3;
  const t = reduced ? 0 : time;
  // Each particle has its own angular velocity and latitude drift, so the
  // silhouette flows instead of looking like a rigid rotating photograph.
  for (let i = 0; i < count; i++) {
    const phase = i * 2.39996323;
    const speed = .42 + (i % 23) / 23 * .7;
    const direction = i % 7 === 0 ? -.65 : 1;
    const rotation = t * speed * direction;
    const latitude = Math.asin(seeds[i * 3 + 1]) + (reduced ? 0 : Math.sin(t * .75 + phase) * .12);
    const longitude = Math.atan2(seeds[i * 3 + 2], seeds[i * 3]) + rotation;
    const sy = Math.sin(latitude), ring = Math.cos(latitude);
    const sx = Math.cos(longitude) * ring, sz = Math.sin(longitude) * ring;
    const wave = Math.sin(sy * 8 + t * 2.4 + sz * 3);
    const audio = state === 'speaking' || state === 'listening';
    const drift = reduced ? 0 : .035 * Math.sin(t * 1.3 + phase);
    const radius = .67 + drift + (reduced ? 0 : audio ? spectrum.bass * .13 + spectrum.mids * wave * .065 : state === 'thinking' ? wave * .035 : Math.sin(t + i * .07) * .008);
    const x = sx, z = sz;
    const perspective = 1 / (1.7 - z * .28);
    const color = ATLAS_PARTICLE_COLORS[i % 17 === 0 ? 4 : i % 11 === 0 ? 3 : i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0];
    const front = (z + 1) / 2, spark = audio ? spectrum.treble * Math.max(0, wave) : 0;
    const offset = i * 8;
    output[offset] = x * radius * perspective * 1.8;
    output[offset + 1] = sy * radius * perspective * 1.8;
    output[offset + 2] = z;
    output[offset + 3] = color[0]; output[offset + 4] = color[1]; output[offset + 5] = color[2];
    output[offset + 6] = .16 + front * .66 + spark * .16;
    output[offset + 7] = .65 + front * .75 + spark * 1.2;
  }
}

// Faint previous positions make velocity visible without a full-screen blur.
export function particleTrails(current: Float32Array, history: Float32Array[], output: Float32Array) {
  output.set(current);
  for (let layer = 0; layer < history.length; layer++) {
    const previous = history[layer], offset = current.length * (layer + 1);
    output.set(previous, offset);
    for (let i = 0; i < previous.length; i += 8) {
      output[offset + i + 6] *= .38 * (1 - layer / history.length);
      output[offset + i + 7] *= .8 - layer * .12;
    }
  }
  for (let layer = history.length - 1; layer > 0; layer--) history[layer].set(history[layer - 1]);
  history[0]?.set(current);
}
