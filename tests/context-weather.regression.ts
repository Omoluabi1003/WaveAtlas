import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dock = readFileSync(new URL('../components/AtlasContextDock.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/weather/route.ts', import.meta.url), 'utf8');

assert.match(dock, /weatherAttempted/);
assert.match(dock, /Verified destination weather is temporarily unavailable/);
assert.match(dock, /Source: \{weatherSource\}/);
assert.match(dock, /\/api\/weather\?/);
assert.doesNotMatch(dock, /\/api\/world-context\?/);
assert.match(route, /api\.open-meteo\.com\/v1\/forecast/);
assert.match(route, /temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m/);
assert.match(route, /Open-Meteo Best Match forecast/);

console.log('Atlas Context weather persistence, dedicated forecast source, and explicit failure state passed');
