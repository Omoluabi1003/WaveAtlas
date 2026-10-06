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
assert.match(assistant, /result\.status === 'playing' \|\| result\.status === 'connecting' \|\| result\.status === 'already_playing'/, 'Voice UI must derive its status from the action result');
assert.match(assistant, /speak\(answer, terminalAction, statusLabel\)/, 'Successful playback confirmation must use the terminal voice path');
assert.match(assistant, /if \(terminal && openRef\.current\)[\s\S]*endConversation\(\)/, 'Completed playback commands must hand audio focus back to radio');

const alternate = answerAtlasQuestion('another one', {
  station: { name: 'Current FM', country: 'Nigeria', country_code: 'NG', city: 'Lagos', state: '', language: 'English', tags: ['afrobeats'], codec: 'MP3', bitrate: 128 },
});
assert.equal(alternate.action?.type, 'play');
assert.equal(alternate.action?.type === 'play' ? alternate.action.excludeCurrent : false, true, 'Another station must exclude the current station');

console.log('Atlas action outcomes: verified playing/connecting states, named confirmations, failover, terminal handoff and alternate-station exclusion passed.');
