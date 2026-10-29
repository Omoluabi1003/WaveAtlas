import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../components/AtlasJourneyWorldEntry.tsx', import.meta.url), 'utf8');

assert.match(source, /\[role="dialog"\]\[aria-labelledby="journey-title"\][\s\S]*Close Atlas Journey/);
assert.doesNotMatch(source, /querySelector<HTMLButtonElement>\('button\[aria-label="Close Atlas Journey"\]'\)/);
