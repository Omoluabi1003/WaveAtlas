export type FeedbackPreferences = { sound: boolean; haptics: boolean };
export const FEEDBACK_STORAGE_KEY = 'waveatlas.button-feedback.v1';
export const FEEDBACK_CHANGE_EVENT = 'waveatlas-button-feedback-change';
export const DEFAULT_FEEDBACK: FeedbackPreferences = { sound: true, haptics: true };
export function parseFeedbackPreferences(raw: string | null): FeedbackPreferences {
  try { const value = JSON.parse(raw || '{}'); return { sound: typeof value?.sound === 'boolean' ? value.sound : true, haptics: typeof value?.haptics === 'boolean' ? value.haptics : true }; }
  catch { return { ...DEFAULT_FEEDBACK }; }
}
export function feedbackControl(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest('button, [role="button"], [role="tab"], a[href]');
  if (!control || control.closest('[disabled], [aria-disabled="true"], [inert], [data-feedback="off"]')) return null;
  return control;
}

export function installButtonFeedback(doc: Pick<Document, 'addEventListener' | 'removeEventListener'>, activate: () => void) {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  const click = (event: Event) => {
    // Native click covers touch, mouse, and keyboard activation once. Synthetic clicks stay silent.
    if (!event.isTrusted || (event as MouseEvent).button > 0) return;
    const control = feedbackControl(event.target);
    if (!control) return;
    const previous = timers.get(control);
    if (previous) clearTimeout(previous);
    control.setAttribute('data-waveatlas-tap', 'true');
    timers.set(control, setTimeout(() => { control.removeAttribute('data-waveatlas-tap'); timers.delete(control); }, 180));
    activate();
  };
  doc.addEventListener('click', click, true);
  return () => {
    doc.removeEventListener('click', click, true);
    for (const [control, timer] of timers) { clearTimeout(timer); control.removeAttribute('data-waveatlas-tap'); }
    timers.clear();
  };
}

export function createTapSoundPlayer(factory: () => AudioContext | undefined, now = () => Date.now()) {
  let context: AudioContext | undefined;
  let lastTap = -Infinity;
  let sequence = 0;
  let disposed = false;
  const play = () => {
    const tappedAt = now();
    if (disposed || tappedAt - lastTap < 65) return;
    lastTap = tappedAt;
    const ownSequence = ++sequence;
    try {
      if (!context || context.state === 'closed') context = factory();
      if (!context) return;
      const active = context;
      const render = () => {
        if (disposed || ownSequence !== sequence || now() - tappedAt > 200 || active.state !== 'running') return;
        const start = active.currentTime;
        const duration = 0.055;
        const oscillator = active.createOscillator();
        const gain = active.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(1650, start);
        oscillator.frequency.exponentialRampToValueAtTime(850, start + 0.035);
        // One audible envelope, rather than multiplying two near-silent gain stages.
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain); gain.connect(active.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(start + duration);
      };
      if (active.state !== 'running') void active.resume().then(render).catch(() => undefined);
      else render();
    } catch { /* Feedback never prevents the requested button action. */ }
  };
  return {
    play,
    dispose: () => { disposed = true; sequence++; if (context && context.state !== 'closed') void context.close().catch(() => undefined); },
  };
}
