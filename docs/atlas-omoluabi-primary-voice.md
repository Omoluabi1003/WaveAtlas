# Omoluabi Paul as Atlas's primary voice

Production Atlas encodes the user's repository recording `Omoluabi voice.mp3`
as the reference for Pocket TTS speech generation. It does not select a named
system voice and call that a clone. There is no automatic system-voice substitution.

## Changes

- Packaged `public/omoluabi-voice-reference.wav`: first 10 seconds after leading
  silence removal, mono PCM16 at 24 kHz, derived from the existing recording.
- Serve the pinned Pocket TTS JS 0.1.0 SDK and all its relative worker modules
  from `public/vendor/pocket-tts-js`. The previous CDN `+esm` entry constructs
  its own worker using a relative URL, which is not a reliable same-origin
  worker entry. Local SDK files retain that relative structure.
- Decode the packaged WAV without downloading an MP3 decoder or fetching the
  voice reference from GitHub during runtime. No browser enrollment can replace
  the repository reference in production.
- Report model progress and actual readiness. Show transcript-only recovery when personal synthesis fails, retry failed preparation on reopening, and bound loading to 120s.
- Serialize synthesis and cache eight recent generated phrases. Interrupted
  requests cannot deliver stale audio, and worker errors settle pending requests.

## Free operation

No API key, paid voice endpoint, token billing, or account enrollment is required.
Inference runs on the listener's device. Initial model weights and ONNX runtime
are downloaded from upstream hosting and model assets are cached by the SDK.
Internet access and adequate browser memory are needed for first use. This does
not change existing website hosting or transfer costs.

## Validation

The reference WAV was decoded and validated against real bytes. The executable
worker test uses a mocked inference SDK to verify cloning receives that PCM,
uses the returned voice identity, announces readiness correctly, generates audio
and reuses phrase cache. Existing voice/media-session tests and production build
are also checked. Actual model inference and perceptual similarity to Paul's
voice have not been verified on physical devices. The cloned output approximates
the recording; it is not a guarantee of exact identity or accent.

## Upstream

https://github.com/vlapky/pocket-tts-js
https://huggingface.co/kyutai/pocket-tts
SDK MIT license and model CC-BY-4.0 attribution are included in the vendored
NOTICE and the public attribution policy.

## Personal voice readiness correction

The merged implementation still abandoned initial model preparation after 4.5s
and synthesized the reply using the system voice. Production checks confirmed
that the reference asset is deployed and the live engine can reach personal
voice readiness. The correction waits for the actual ready state (within the
120s preparation limit), verifies audio metadata names the repository clone,
and removes system synthesis entirely. Generation has a 60s limit rather than
20s. If preparation or generation fails, the answer remains readable, with the
failure reason and a retry control. No alternate speaker is selected.

All Voice Search and microphone entry points now launch the same Atlas voice
surface. The empty-state entry no longer starts a random station or bypasses
Atlas through the legacy command recognizer.
