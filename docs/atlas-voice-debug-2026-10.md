# Atlas Voice reliability audit

## Corrected faults

- Search execution previously returned no completion message, leaving the assistant's provisional “Searching” response audible after results opened. It now resolves the directory, names the first match, reports no matches and timeouts, and hands focus back to results.
- Playback confirmation listeners were attached after navigation. They now subscribe before the station switch so immediate events are observed.
- Recognition resolution previously transformed interim speech into final commands, had no request deadline, and could deliver commands after abort. Interim state is preserved, directory resolution is bounded to 1.8 seconds, final delivery is guarded per recognition session, and native end waits for pending resolution.
- Recognition callbacks from a replaced session could reset the active microphone. Callbacks now check session identity; denied permission ends automatic conversation retries.
- The clone worker reported ready during model download. It now distinguishes loading from actual readiness and retains safe system fallback.
- In-flight generated speech could restart after interruption or closing. Output generation checks invalidate that audio and its fallback; closing cancels the assistant request.
- The eight-second assistant request timer could expire during action execution and discard an otherwise successful result. It now ends after the response arrives.
- System speech selection now favors compatible enhanced/neural voices and uses English for the English responses rather than the browser UI language. Muting stops current output.

## Validation and limitations

TypeScript checks, production build, existing media-session/voice/conversation/action regression suites, and an executable recognition lifecycle test are run for this change. Existing source-pattern tests are updated to allow cancellation guards between neural output and fallback.

This is a reliability correction, not demonstrated Alexa/Siri parity. Browser recognition permissions, model downloads, external model hosting and device speech voices still affect experience. Real microphone recognition, perceived voice naturalness, local clone generation on low-memory phones, and live external station audio require device testing. The assistant remains a deterministic radio-focused intent engine. Broader conversation, interruptible streaming synthesis, robust follow-up disambiguation and confirmed outcomes for every control require further work.
