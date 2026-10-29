import test from 'node:test';
import assert from 'node:assert/strict';
import { JOURNEY_COUNTRIES, JOURNEY_PRESETS } from '../lib/atlas-journey';

test('Atlas Journey exposes a genuinely global country catalog', () => {
  assert.ok(JOURNEY_COUNTRIES.length >= 150, `expected at least 150 countries, found ${JOURNEY_COUNTRIES.length}`);
  const codes = new Set(JOURNEY_COUNTRIES.map((place) => place.countryCode));
  for (const code of ['NG', 'ZA', 'GB', 'JP', 'IN', 'US', 'BR', 'AU', 'NZ']) {
    assert.ok(codes.has(code), `missing country ${code}`);
  }
});

test('featured journeys are not a three-route demo', () => {
  assert.ok(JOURNEY_PRESETS.length >= 15, `expected at least 15 featured routes, found ${JOURNEY_PRESETS.length}`);
  const codes = new Set(JOURNEY_PRESETS.flatMap((route) => [route.from.countryCode, route.to.countryCode]).filter(Boolean));
  assert.ok(codes.size >= 20, `expected at least 20 countries across featured routes, found ${codes.size}`);
  for (const code of ['NG', 'KE', 'ZA', 'FR', 'DE', 'JP', 'KR', 'IN', 'US', 'CA', 'BR', 'AR', 'AU', 'NZ']) {
    assert.ok(codes.has(code), `featured catalog missing ${code}`);
  }
});
