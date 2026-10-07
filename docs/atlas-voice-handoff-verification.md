# Atlas voice capture and playback handoff

The microphone abort call requests release; it does not confirm device release.
Atlas now tracks recognition through its actual end event and waits for that event
before switching to voice playback or restoring radio focus. Native capture may
end while station-directory transcript resolution is still pending; abort in the
final result handler now preserves that completion notification.

Repeated capture stops share one promise and issue one abort. The recognition
watchdog retains ownership until end, allowing normal follow-up reconnection.
Interim results cannot submit an instruction. Interrupting a preparing response
returns to listening instead of accidentally closing the conversation.

Foreground synthesis invalidates background prefetch and waits for the prior
engine stop acknowledgement before starting inference. That prevents a delayed
stop from truncating the new response. The production module graph has a new
runtime version; voice reference, model revision, prepared recordings, pitch,
speech rate and existing output gain are unchanged.

## Verification on 2026-10-07

Chromium ran the local Next.js application with controlled recognition events and
real Web Audio playback of the shipped Omoluabi greeting. Instrumentation recorded:

- Before microphone end: zero speech starts, microphone abort requested.
- After microphone end: one source, 53,760 samples, duration 2.24 seconds, rate 1.
- Actual source ended approximately 2,239 ms after start.
- No radio restore event during the conversation.
- A second recognition capture started after playback completion.
- No browser page errors.

This verifies the UI → recognition handoff → prepared voice worker → PCM playback
→ actual ended event → follow-up listening path. It does not measure physical
speaker loudness or replace phone hardware testing. Dynamic inference cancellation
and delayed stop acknowledgement are exercised separately by worker regressions.

Typecheck, audio-focus/PCM, recognition/capture, media-session/runtime and the
complete Omoluabi voice regression suite pass. The capture tests cover failed
starts, duplicate aborts and exclusion of simultaneous microphone sessions.
