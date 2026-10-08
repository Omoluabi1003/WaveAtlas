import assert from 'node:assert/strict';
import { createParticleSeeds, particleBudget, spectrumBands, updateParticles } from '../lib/atlas-particles';

assert.equal(particleBudget(390, 8), 720);
assert.equal(particleBudget(1440, 2), 720);
assert.equal(particleBudget(1440, 8), 1600);
assert.equal(particleBudget(1440, 8, true), 360);
const bins = new Uint8Array(512);
for (let i = 3; i < 13; i++) bins[i] = 255;
const bass = spectrumBands(bins, 24000, 1024);
assert.ok(bass.bass > .8 && bass.mids === 0 && bass.treble === 0, 'Bass must map to real low-frequency bins');
assert.deepEqual(spectrumBands(new Uint8Array(512), 24000, 1024), { bass: 0, mids: 0, treble: 0 });
const seeds = createParticleSeeds(720), silent = { bass: 0, mids: 0, treble: 0 };
for (let i = 0; i < seeds.length; i += 3) assert.ok(Math.abs(Math.hypot(seeds[i], seeds[i + 1], seeds[i + 2]) - 1) < .000001);
const first = new Float32Array(720 * 8), second = new Float32Array(720 * 8);
updateParticles(seeds, first, 0, 'speaking', silent, false);
updateParticles(seeds, second, 0, 'speaking', { bass: 1, mids: .7, treble: .6 }, false);
assert.notDeepEqual(first, second, 'Output must change with genuine speech spectrum');
for (const state of ['live', 'listening', 'thinking', 'speaking'] as const) {
  updateParticles(seeds, first, 1, state, silent, true);
  updateParticles(seeds, second, 100, state, silent, true);
  assert.deepEqual(first, second, 'Reduced motion must not drift with time');
  assert.ok(first.every(Number.isFinite));
}
console.log('Atlas particles: frequency mapping, bounded budgets, unit sphere, audio reactivity and reduced motion passed.');
