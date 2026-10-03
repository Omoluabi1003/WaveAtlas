'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createTapSoundPlayer, FEEDBACK_CHANGE_EVENT, FEEDBACK_STORAGE_KEY, installButtonFeedback, parseFeedbackPreferences, type FeedbackPreferences } from '@/lib/button-feedback';

let memoryPreferences: FeedbackPreferences | undefined;
function rawPreferences() {
  if (memoryPreferences) return JSON.stringify(memoryPreferences);
  try { return window.localStorage.getItem(FEEDBACK_STORAGE_KEY); } catch { return null; }
}
function preferences() { return parseFeedbackPreferences(rawPreferences()); }
function subscribe(refresh: () => void) {
  window.addEventListener(FEEDBACK_CHANGE_EVENT, refresh);
  window.addEventListener('storage', refresh);
  return () => { window.removeEventListener(FEEDBACK_CHANGE_EVENT, refresh); window.removeEventListener('storage', refresh); };
}
function save(value: FeedbackPreferences) {
  try { window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(value)); memoryPreferences = undefined; }
  catch { memoryPreferences = value; }
  window.dispatchEvent(new Event(FEEDBACK_CHANGE_EVENT));
}

export function ButtonFeedback() {
  useEffect(() => {
    const sound = createTapSoundPlayer(() => {
      const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return Constructor ? new Constructor() : undefined;
    });
    document.documentElement.setAttribute('data-waveatlas-feedback-root', 'true');
    const uninstall = installButtonFeedback(document, () => {
      const value = preferences();
      if (value.sound) sound.play();
      if (value.haptics && typeof navigator.vibrate === 'function') { try { navigator.vibrate(9); } catch { /* Hardware feedback is optional. */ } }
    });
    return () => { uninstall(); sound.dispose(); document.documentElement.removeAttribute('data-waveatlas-feedback-root'); };
  }, []);
  return null;
}

export function ButtonFeedbackSettings() {
  const raw = useSyncExternalStore(subscribe, rawPreferences, () => null);
  const value = parseFeedbackPreferences(raw);
  const vibrates = useSyncExternalStore(subscribe, () => typeof navigator.vibrate === 'function', () => false);
  return <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-3">
    <p className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-radio/80">Tap feedback</p>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <button type="button" aria-pressed={value.sound} onClick={() => save({ ...value, sound: !value.sound })} className="rounded-2xl bg-white/[0.06] px-3 py-3 text-left text-sm font-semibold text-ivory">Tap sound · {value.sound ? 'On' : 'Off'}</button>
      {vibrates ? <button type="button" aria-pressed={value.haptics} onClick={() => save({ ...value, haptics: !value.haptics })} className="rounded-2xl bg-white/[0.06] px-3 py-3 text-left text-sm font-semibold text-ivory">Tap vibration · {value.haptics ? 'On' : 'Off'}</button> : null}
    </div>
    <p className="mt-2 px-1 text-[11px] leading-5 text-ivory/55">A crisp click and press highlight across the app. Sound follows your device volume; vibration appears on supported devices.</p>
  </div>;
}
