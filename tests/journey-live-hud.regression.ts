import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = readFileSync(new URL('../components/AtlasJourneyWorldEntry.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/AtlasCorridorTravelPanel.tsx', import.meta.url), 'utf8');

assert.match(entry, /\[role="dialog"\]\[aria-labelledby="journey-title"\] button\[aria-label="Close Atlas Journey"\]/);
assert.doesNotMatch(entry, /querySelector<HTMLButtonElement>\('button\[aria-label="Close Atlas Journey"\]'\)/);

assert.match(panel, />Live Journey</);
assert.match(panel, />Remaining</);
assert.match(panel, />ETA</);
assert.match(panel, />Route timeline</);
assert.match(panel, /journeySoundPhaseLabel\(soundPhase\)/);
assert.match(panel, /journeySoundPhaseQueue\(session, progress, 5\)/);
assert.match(panel, /queue\.slice\(0, 4\)/);
assert.doesNotMatch(panel, />Signals ahead</);
assert.doesNotMatch(panel, />Route source</);
assert.doesNotMatch(panel, /Choose how this journey moves through geography/);
assert.doesNotMatch(panel, /Opt-in only\. Corridor ordering/);
