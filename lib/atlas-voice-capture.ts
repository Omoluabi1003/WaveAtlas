import type { BrowserSpeechRecognition } from './voice-command-engine';

// abort() requests a stop; only onend confirms capture has released the device.
export class AtlasVoiceCapture {
  private current: { recognition: BrowserSpeechRecognition; ended: Promise<void>; finish: () => void; stopping: boolean } | null = null;
  get active() { return this.current !== null; }
  start(recognition: BrowserSpeechRecognition) {
    if (this.current) throw new Error('Voice capture is still active');
    const onend = recognition.onend;
    let resolve!: () => void;
    const ended = new Promise<void>(done => { resolve = done; });
    const capture = { recognition, ended, stopping: false, finish: () => {
      if (this.current === capture) this.current = null;
      resolve();
    } };
    recognition.onend = () => { capture.finish(); onend?.(); };
    this.current = capture;
    try { recognition.start(); }
    catch (error) { capture.finish(); throw error; }
  }
  stop() {
    const capture = this.current;
    if (!capture) return Promise.resolve();
    if (!capture.stopping) { capture.stopping = true; capture.recognition.abort(); }
    return capture.ended;
  }
}
