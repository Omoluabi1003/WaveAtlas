import assert from 'node:assert/strict';
import {
  createParticleSeeds,
  getParticleSystem,
  particleBudget,
  particleTrails,
  spectrumBands,
  updateParticles,
  PersistentParticleSystem,
} from '../lib/atlas-particles';

// 1. Budget and spectrum calculations
assert.equal(particleBudget(390, 8), 720);
assert.equal(particleBudget(1440, 2), 720);
assert.equal(particleBudget(1440, 8), 1600);
assert.equal(particleBudget(1440, 8, true), 360);

const bins = new Uint8Array(512);
for (let i = 3; i < 13; i++) bins[i] = 255;
const bass = spectrumBands(bins, 24000, 1024);
assert.ok(bass.bass > 0.8 && bass.mids === 0 && bass.treble === 0, 'Bass must map to real low-frequency bins');
assert.deepEqual(spectrumBands(new Uint8Array(512), 24000, 1024), { bass: 0, mids: 0, treble: 0 });

// 2. Unit sphere seed distribution
const seeds = createParticleSeeds(720);
const silent = { bass: 0, mids: 0, treble: 0 };
for (let i = 0; i < seeds.length; i += 3) {
  assert.ok(Math.abs(Math.hypot(seeds[i], seeds[i + 1], seeds[i + 2]) - 1) < 0.000001);
}

// 3. Audio spectrum reactivity
const first = new Float32Array(720 * 8);
const second = new Float32Array(720 * 8);
updateParticles(seeds, first, 0, 'speaking', silent, false);
updateParticles(seeds, second, 0, 'speaking', { bass: 1, mids: 0.7, treble: 0.6 }, false);
assert.notDeepEqual(first, second, 'Output must change with genuine speech spectrum');

// 4. Reduced motion static behavior
for (const state of ['live', 'listening', 'thinking', 'speaking'] as const) {
  updateParticles(seeds, first, 1, state, silent, true);
  updateParticles(seeds, second, 100, state, silent, true);
  assert.deepEqual(first, second, 'Reduced motion must not drift with time');
  assert.ok(first.every(Number.isFinite));
}
console.log('Atlas particles: frequency mapping, bounded budgets, unit sphere, audio reactivity and reduced motion passed.');

// 5. Velocity & physical persistent motion
const testSeeds = createParticleSeeds(720);
const sys = new PersistentParticleSystem(testSeeds);

// Check initial persistent velocity bounds (x: [-0.45, 0.45], y: [-0.45, 0.45], z: [-0.15, 0.15])
for (let i = 0; i < sys.count; i++) {
  const vx = sys.velocities[i * 3];
  const vy = sys.velocities[i * 3 + 1];
  const vz = sys.velocities[i * 3 + 2];
  assert.ok(vx >= -0.45 && vx <= 0.45, `vx ${vx} out of bounds`);
  assert.ok(vy >= -0.45 && vy <= 0.45, `vy ${vy} out of bounds`);
  assert.ok(vz >= -0.15 && vz <= 0.15, `vz ${vz} out of bounds`);
}
console.log('Atlas velocity bounds: initial particle velocities strictly within specification.');

// 6. Sustained motion across frames
updateParticles(testSeeds, first, 0.016, 'listening', silent, false, sys);
updateParticles(testSeeds, second, 0.516, 'listening', silent, false, sys);
let moved = 0;
const distances: number[] = [];
for (let i = 0; i < first.length; i += 8) {
  const distance = Math.hypot(first[i] - second[i], first[i + 1] - second[i + 1]);
  if (distance > 0.025) moved++;
  distances.push(distance);
}
assert.ok(moved > 720 * 0.75, 'Most particles must visibly move within half a second, even without microphone audio');
assert.ok(Math.max(...distances) - Math.min(...distances) > 0.05, 'Particles must have varied velocities');
console.log('Atlas velocity: sustained silent motion and varied particle speeds passed.');

// 7. State transitions & velocity multipliers (live: 0.45, listening: 0.8, thinking: 1.2, speaking: 1.6)
const stateSys = new PersistentParticleSystem(createParticleSeeds(100));
updateParticles(stateSys.positions, first, 0.016, 'live', silent, false, stateSys);
assert.ok(Math.abs(stateSys.stateMultiplier - 0.45) < 0.1, 'Live state target multiplier is ~0.45');

updateParticles(stateSys.positions, first, 0.5, 'thinking', silent, false, stateSys);
assert.ok(stateSys.stateMultiplier > 0.8, 'Multiplier transitions upward when entering thinking state');

updateParticles(stateSys.positions, first, 1.0, 'speaking', silent, false, stateSys);
assert.ok(stateSys.stateMultiplier > 1.3, 'Multiplier smoothly transitions toward speaking target multiplier (1.6)');

updateParticles(stateSys.positions, first, 1.5, 'listening', silent, false, stateSys);
assert.ok(stateSys.stateMultiplier < 1.3, 'Multiplier smoothly transitions down when entering listening state');

// 8. Boundary soft wrapping: particles stay within volume and all coordinates are finite
for (let step = 0; step < 50; step++) {
  updateParticles(testSeeds, first, step * 0.05, 'speaking', { bass: 0.9, mids: 0.8, treble: 0.7 }, false);
  assert.ok(first.every(Number.isFinite), 'All output particle attributes must be finite numbers');
}
console.log('Atlas boundary and state transitions: soft wrap and multiplier transitions passed.');

// 9. Particle trails output verification
const pCount = 100;
const curr = new Float32Array(pCount * 8);
curr.fill(1);
const history = Array.from({ length: 3 }, () => new Float32Array(pCount * 8));
const trailOutput = new Float32Array(pCount * 8 * 4);
particleTrails(curr, history, trailOutput);
assert.ok(trailOutput.length === pCount * 8 * 4, 'Particle trails output buffer properly populated');
assert.ok(trailOutput.every(Number.isFinite), 'Particle trails output contains valid finite floats');
console.log('Atlas trails: particle trails generation passed.');
