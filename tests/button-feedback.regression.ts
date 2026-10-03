import assert from 'node:assert/strict';
import { createTapSoundPlayer, feedbackControl, installButtonFeedback, parseFeedbackPreferences } from '../lib/button-feedback';

class FakeElement {
  attributes = new Map<string, string>();
  control: FakeElement | null = this;
  disabled = false;
  closest(selector: string) { return selector.startsWith('button') ? this.control : this.disabled ? this : null; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { this.attributes.delete(key); }
}
const originalElement = globalThis.Element;
Object.assign(globalThis, { Element: FakeElement });
const button = new FakeElement(); const icon = new FakeElement(); icon.control = button;
assert.equal(feedbackControl(icon as unknown as EventTarget), button);
button.disabled = true; assert.equal(feedbackControl(icon as unknown as EventTarget), null); button.disabled = false;
const background = new FakeElement(); background.control = null;
assert.equal(feedbackControl(background as unknown as EventTarget), null);
let handler: ((event: Event) => void) | undefined; let activations = 0;
const doc = { addEventListener(_type: string, fn: EventListenerOrEventListenerObject) { handler = fn as EventListener; }, removeEventListener() { handler = undefined; } } as unknown as Document;
const cleanup = installButtonFeedback(doc, () => activations++);
const click = (target: FakeElement, trusted = true, mouseButton = 0) => handler?.({ target, isTrusted: trusted, button: mouseButton } as unknown as Event);
click(icon); assert.equal(activations, 1); assert.equal(button.attributes.get('data-waveatlas-tap'), 'true');
click(icon, false); click(icon, true, 2); click(background); assert.equal(activations, 1);
button.disabled = true; click(icon); assert.equal(activations, 1); button.disabled = false;
// Keyboard activation arrives as one native click, just like a touch activation.
click(button); assert.equal(activations, 2);
cleanup(); assert.equal(handler, undefined); assert.equal(button.attributes.size, 0);
Object.assign(globalThis, { Element: originalElement });
assert.deepEqual(parseFeedbackPreferences(null), { sound: true, haptics: true });
assert.deepEqual(parseFeedbackPreferences('broken'), { sound: true, haptics: true });
assert.deepEqual(parseFeedbackPreferences('{"sound":false,"haptics":false}'), { sound: false, haptics: false });
assert.equal(parseFeedbackPreferences('{"sound":"yes"}').sound, true);

async function audioTests() {
  let now = 0; let factories = 0; let starts = 0; let closes = 0; let disconnects = 0;
  const peaks: number[] = [];
  const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime(value: number) { peaks.push(value); } };
  const context = { state: 'running', currentTime: 0, destination: {}, createGain() { return { gain: parameter, connect() {}, disconnect() { disconnects++; } }; }, createOscillator() { return { frequency: parameter, connect() {}, disconnect() { disconnects++; }, start() { starts++; }, stop() { this.onended?.(); }, onended: undefined as (() => void) | undefined }; }, async resume() { this.state = 'running'; }, async close() { closes++; this.state = 'closed'; } };
  const sound = createTapSoundPlayer(() => { factories++; return context as unknown as AudioContext; }, () => now);
  sound.play(); now = 20; sound.play(); assert.equal(starts, 1, 'Rapid duplicate clicks are throttled');
  now = 80; sound.play(); assert.equal(starts, 2); assert.equal(factories, 1, 'Share one context across taps');
  assert.ok(peaks.some((value) => value > 0.1 && value < 1), 'Tap envelope is audible and bounded');
  assert.equal(disconnects, 4, 'Finished sound nodes are disconnected');
  sound.dispose(); now = 200; sound.play(); assert.equal(starts, 2); assert.equal(closes, 1);
  createTapSoundPlayer(() => undefined).play();
  createTapSoundPlayer(() => { throw new Error('Audio unavailable'); }).play();
  let resolveResume: (() => void) | undefined;
  context.state = 'suspended'; context.resume = () => new Promise<void>((resolve) => { resolveResume = () => { context.state = 'running'; resolve(); }; });
  now = 300; const delayed = createTapSoundPlayer(() => context as unknown as AudioContext, () => now);
  delayed.play(); now = 600; resolveResume?.(); await Promise.resolve(); assert.equal(starts, 2, 'Discard late audio after a slow resume'); delayed.dispose();
  context.state = 'suspended'; now = 800; const pending = createTapSoundPlayer(() => context as unknown as AudioContext, () => now);
  pending.play(); pending.dispose(); resolveResume?.(); await Promise.resolve(); assert.equal(starts, 2, 'Cleanup cancels pending sounds');
  console.log('Button feedback: nested and keyboard controls, disabled/synthetic exclusions, cleanup, preferences, shared audio, audible envelope, resume and throttling passed.');
}
audioTests().catch((error) => { console.error(error); process.exitCode = 1; });
