import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const arrival = readFileSync(new URL('../components/AtlasJourneyArrival.tsx', import.meta.url), 'utf8');
const corridor = readFileSync(new URL('../components/AtlasCorridorTravelPanel.tsx', import.meta.url), 'utf8');

assert.match(arrival, /Welcome to \{destination\.label\}/);
assert.match(arrival, /\/api\/weather\?/);
assert.match(arrival, /Source: \{source\}/);
assert.match(arrival, />Listen local</);
assert.match(arrival, />Destination Brief</);
assert.match(arrival, />Explore destination</);

assert.match(corridor, /progress >= 1 && session/);
assert.match(corridor, /session\.route\.to/);
assert.match(corridor, /journeySoundPhaseQueue\(session, progress, 5\)/);
assert.match(corridor, /\[role="dialog"\]\[aria-labelledby="journey-title"\] button\[aria-label="Close Atlas Journey"\]/);
assert.match(corridor, /waveatlas:open-mobile-brief/);
