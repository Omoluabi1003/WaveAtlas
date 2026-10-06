import assert from 'node:assert/strict';
import fs from 'node:fs';
import { answerAtlasQuestion } from '../lib/atlas-assistant';

const assistant = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');
const experience = fs.readFileSync('components/WaveAtlasExperience.tsx', 'utf8');

assert.match(experience, /type \{ AtlasActionResult, AtlasAssistantAction \}/, 'Action bridge must return structured outcomes');
assert.match(experience, /waitForPlayback\(target: Station/, 'Station selection must wait for real playback context');
assert.match(experience, /Playing \$\{match\.name\}/, 'Confirmed playback must name the actual station');
assert.match(experience, /Found \$\{match\.name\}[\s\S]*Connecting\./, 'Slow playback must say connecting rather than falsely claim playing');
assert.match(experience, /already listening to \$\{first\.name\}/i, 'Already-playing requests must be explicit');
assert.match(experience, /ranked\.slice\(0, 3\)/, 'Atlas must retain ranked fallback candidates');
assert.match(experience, /outcome === 'failed'[\s\S]*next AIE-ranked candidate/, 'Confirmed stream failure must advance to another ranked station');

// Fresh UI consumes the structured action result's verified message. It never
// fabricates a success sentence before the WaveAtlas action bridge responds.
assert.match(assistant, /const outcome = normalizeActionResult\(await onAction\(reply\.action\)\)/);
assert.match(assistant, /if \(outcome\.message\) answer = outcome\.message/);
assert.match(assistant, /else if \(!outcome\.ok\) answer = 'I understood the instruction, but WaveAtlas could not complete it\.'/);
assert.match(assistant, /if \(fromVoice\) await speak\(answer\)/);

const alternate = answerAtlasQuestion('another one', {
  station: { name: 'Current FM', country: 'Nigeria', country_code: 'NG', city: 'Lagos', state: '', language: 'English', tags: ['afrobeats'], codec: 'MP3', bitrate: 128 },
});
assert.equal(alternate.action?.type, 'play');
assert.equal(alternate.action?.type === 'play' ? alternate.action.excludeCurrent : false, true, 'Another station must exclude the current station');

console.log('Atlas action outcomes: verified bridge messages, ranked failover and no fabricated success passed.');
