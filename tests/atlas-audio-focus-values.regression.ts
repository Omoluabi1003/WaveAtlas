import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/AtlasAssistant.tsx', 'utf8');
assert.match(source, /opening: 0\.05/);
assert.match(source, /listening: 0\.02/);
assert.match(source, /thinking: 0\.04/);
assert.match(source, /speaking: 0\.015/);
assert.match(source, /sendPlayback\('restore'\)/);
console.log('Atlas audio focus keeps radio nearly muted during voice and preserves restore behavior.');
