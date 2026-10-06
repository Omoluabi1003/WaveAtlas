import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');

assert.match(source, /if \(!open\) return null;/, 'Atlas must render nothing while Voice Mode is closed');
assert.match(source, /push to talk voice command\|push to talk\|microphone blocked/i, 'Existing WaveAtlas microphone must launch Atlas Voice');
assert.match(source, /RADIO_FOCUS = \{ opening: 0\.05, listening: 0\.02, thinking: 0\.04, speaking: 0\.015 \}/, 'Voice mode must keep radio connected but nearly inaudible');
assert.match(source, /ASSISTANT_TIMEOUT_MS = 8000/, 'Assistant requests must have a bounded recovery timeout');
assert.match(source, /context: \{ station, history \}/, 'Atlas must send recent conversation context for follow-up understanding');
assert.match(source, /conversationModeRef\.current && openRef\.current[\s\S]*void listen\(true\)/, 'Voice conversation must return to listening instead of freezing after an answer');
assert.match(source, /aria-label="Atlas Voice"/, 'Atlas Voice must use a dedicated transient voice surface');
assert.match(source, /meterAnalyser\(analyser/, 'Neural speech must drive Atlas Signal from real output amplitude');
assert.match(source, /if \(isIOSFamily\(\)\) spoken = await speakSystem/, 'iOS must retain the reliable gesture-unlocked system speech path');
assert.doesNotMatch(source, /fixed bottom-\[13\.1rem\][\s\S]*Talk to Atlas/, 'The old permanent floating orb must not return');
assert.match(source, /if \(speaking\) \{ stopVoiceOutput\(\); setVoiceMessage\('Listening'\); void listen\(true\); return; \}/, 'Pressing the Signal while Atlas speaks must interrupt and return to listening');

console.log('Atlas Signal: recovery timeout, near-mute focus, context memory, audio-reactive speech and iOS fallback passed.');
