import assert from 'node:assert/strict';
import fs from 'node:fs';
import { answerAtlasQuestion } from '../lib/atlas-assistant';

const source = fs.readFileSync('components/AtlasAssistant.tsx', 'utf8');

assert.match(source, /if \(!open\) return null;/, 'Atlas must render nothing while Voice Mode is closed');
assert.match(source, /push to talk voice command\|push to talk\|microphone blocked/i, 'Existing WaveAtlas microphone must launch Atlas Voice');
assert.match(source, /RADIO_FOCUS = \{ opening: 0\.05, listening: 0\.02, thinking: 0\.04, speaking: 0\.015 \}/, 'Voice mode must keep radio connected but nearly inaudible');
assert.match(source, /ASSISTANT_TIMEOUT_MS = 8000/, 'Assistant requests must have a bounded recovery timeout');
assert.match(source, /context: \{ station, history \}/, 'Atlas must send recent conversation context for follow-up understanding');
assert.match(source, /conversationModeRef\.current && openRef\.current[\s\S]*void listen\(true\)/, 'Voice conversation must return to listening instead of freezing after an answer');
assert.match(source, /aria-label="Atlas Voice"/, 'Atlas Voice must use a dedicated transient voice surface');
assert.match(source, /meterAnalyser\(analyser/, 'Neural speech must drive Atlas Signal from real output amplitude');
assert.match(source, /if \(await waitForNeuralVoice\(\)\) spoken = await speakNeural\(text\);[\s\S]*if \(!spoken\) spoken = await speakSystem\(text\);/, 'Atlas must attempt enrolled neural voice first and preserve system speech fallback');
assert.match(source, /primeSystemSpeech\(\); void primeVoiceOutput\(\);[\s\S]*warmNeuralVoice\(\);/, 'Atlas must retain gesture-unlocked fallback while warming the neural clone');
assert.doesNotMatch(source, /profile\.systemOnly/, 'Rolled-back #327 voice-gallery routing must not leak into the stable Signal runtime');
assert.doesNotMatch(source, /fixed bottom-\[13\.1rem\][\s\S]*Talk to Atlas/, 'The old permanent floating orb must not return');
assert.match(source, /if \(speaking\) \{ stopVoiceOutput\(\); setVoiceMessage\('Listening'\); void listen\(true\); return; \}/, 'Pressing the Signal while Atlas speaks must interrupt and return to listening');

const naturalPlay = answerAtlasQuestion('Atlas, can you play jazz in Lagos?');
assert.equal(naturalPlay.action?.type, 'play');
if (naturalPlay.action?.type !== 'play') throw new Error('Expected natural play action');
assert.match(naturalPlay.action.query || '', /jazz in Lagos/i);

const followUp = answerAtlasQuestion('another one', {
  station: { name: 'Test FM', country: 'Nigeria', country_code: 'NG', city: 'Lagos', state: '', language: 'English', tags: ['jazz', 'music'], codec: 'MP3', bitrate: 128 },
  history: [{ role: 'user', text: 'Play jazz in Lagos' }, { role: 'atlas', text: 'Tuning in.' }],
});
assert.equal(followUp.action?.type, 'play');
if (followUp.action?.type !== 'play') throw new Error('Expected contextual follow-up play action');
assert.match(followUp.action.query || '', /Nigeria jazz/i);

const capability = answerAtlasQuestion('what can you do?');
assert.match(capability.answer, /identify.*current signal.*find and play stations/i);

console.log('Atlas Signal: recovery timeout, near-mute focus, conversational intent, context memory, audio-reactive cloned speech and stable fallback passed.');
