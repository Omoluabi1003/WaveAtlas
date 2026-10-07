# Omoluabi Paul as Atlas's primary voice

Atlas uses the repository recording `Omoluabi voice.mp3` as the reference for
Pocket TTS. No API key, paid inference endpoint, account, or device voice is
required. All new speech runs on the listener's device.

## Prepare once, reuse

`public/omoluabi-voice-profile.bin` contains the prepared speaker state generated
once from the unchanged canonical reference using a full precision voice encoder.
It is 6,200,016 bytes, rather than shipping the encoder model to every visitor.
Model weights are pinned to Hugging Face revision
`c469236dbc5f68287fa2fbf175b66de3b80123af`, matching the profile. The binary
container preserves float32 values, BigInt state and NaN padding; only occupied
cache runs are stored. Source and model hashes are recorded in
`omoluabi-voice-profile-provenance.json`.

On opening Atlas, the worker restores the saved profile or fetches the bundled
profile. It reports **prepared**, without starting the generation models. On a
cache miss it loads those models and reports **ready** only after the prepared
speaker state has been imported. Reference decoding and voice encoding are a
recovery path if the prepared profile is unavailable or invalid.

The profile and completed response PCM persist in IndexedDB. A saved response
plays before model initialization, including after a reload. Responses are
keyed by voice version and normalized wording. A changed reference/model version
cannot reuse old speech. Storage is bounded to 64 responses and 32 MiB of PCM,
with a smaller 16-response memory cache. Blocked or full browser storage leaves
speech usable without persistence. Clearing site data or eviction means a
response must be generated again.

New wording still requires synthesis. Initial downloads and model session
initialization are needed for the first uncached response on a device; browser
CPU speed and memory determine its latency. Models and runtime assets remain
cached by the SDK. Cached speech does not need those models to replay.

## Playback and voice fidelity

The worker delivers float32 audio chunks as they are generated. The PCM player
holds the complete reply, joins its samples in order, and plays one AudioBuffer
at the model's 24 kHz sample rate. A small initial streaming buffer ran dry when
browser synthesis was slower than real time. Waiting for the complete reply
removes those playback underruns without encoding WAV or calling `decodeAudioData`
on each response. Cached replies need no generation wait. New wording waits for
local synthesis to finish; this change does not make slow devices synthesize faster.
Playback rate stays at 1. The canonical reference's samples and
level are unchanged, and each utterance gets an independent copy of the prepared
speaker state so generation cannot mutate the reference conditioning.

Output gain raises quiet speech toward a moderate RMS level, with a sixfold gain
limit and peak headroom. The previous compressor is removed. These changes do
not shift pitch or add bass. One gain applies to the entire reply, avoiding volume
changes at chunk boundaries. Existing cached PCM remains compatible and receives
the same whole-reply gain as new audio.

Voice runtime URLs share the `omoluabi-continuous-20261007` release query, including
the SDK's nested worker and relative dependencies. This bypasses unversioned SDK
files retained by an older service worker. New service workers load voice scripts
from the network first and use the exact cached URL when offline. App activation
only deletes older WaveAtlas app caches; it preserves the SDK's downloaded models.
Runtime updates do not invalidate Paul's unchanged profile or completed replies.
An SDK lacking profile import/export fails before downloading models or re-encoding
the reference instead of silently entering the expensive enrollment recovery path.

Interruption stops scheduled audio, cancels synthesis, rejects pending requests,
and prevents partial/stale speech from being stored or delivered. Generation
completion waits for audible playback before Atlas resumes listening. Preparation
and first output have a 120-second limit, stalled chunks a 45-second limit, and
generation an overall 240-second limit. Failed speech remains in the transcript
with a retry control. Preparation status appears only while a reply is being
prepared, switches to speaking when its source starts, and clears on completion
or interruption. Late model progress cannot replace playback status. The AudioContext
is resumed again before a completed reply plays in case it was suspended during
first-load preparation. All Voice Search entry points use this same Atlas surface.

## Verification

`npm run test:omoluabi-voice` covers real reference samples, executable worker
streaming, fresh-device preparation, persistent replay without a model, concurrent
reuse, cancellation, IndexedDB limits/failure, binary tensor fidelity, and PCM
scheduling/volume/pitch behavior, delayed generation, status transitions, actual
SDK profile methods, the complete versioned module graph, stale app caches and
service worker preservation of model caches. Existing voice/media-session and recognition
regressions, TypeScript and the production build are also checked.

The public Netlify preview for PR #343 was tested in a browser with a fresh
origin. Atlas restored the bundled profile, generated a new reply, switched to
speaking, and cleared preparation status on completion. After reloading, the same
reply reached speaking in an observed 482 ms from Send and returned to the saved
voice state, without initializing models. This includes the assistant request and
UI observation; it is one browser measurement, not a cross-device latency promise.
Muting during preparation prevented late speech, and muting during playback
stopped output and restored idle status. Voice tests used keyboard input; microphone
recognition and perceptual voice likeness were not evaluated. The verification
screenshot is `atlas-voice-preview-2026-10-07.jpg`.

The offline preparation script ran the actual pinned models with
`onnxruntime-node@1.20.0`, restored the exported speaker state, generated audible
speech and verified synthesis did not mutate the original conditioning. The
sample was 4.08 seconds; one two-thread CPU run produced its first PCM chunk in
268 ms and finished synthesis in about 2.3 seconds. These are native validation
measurements, not browser timing promises. Exact perceptual likeness to Paul's
voice still requires a listening comparison on the target devices.

## Reproduce the bundled profile

Install the native runtime separately from the app:

```sh
npm install --prefix /tmp/atlas-voice-preparation onnxruntime-node@1.20.0
```

Download these files from the pinned revision's `onnx/english_2026-04/` folder:
`bundle.json`, `tokenizer.model`, `bos_before_voice.npy`, `mimi_encoder.onnx`,
`text_conditioner_int8.onnx`, `flow_lm_main_int8.onnx`, `flow_lm_flow_int8.onnx`,
and `mimi_decoder_int8.onnx`.

```sh
node scripts/prepare-omoluabi-voice.mjs /absolute/path/to/models /tmp/atlas-voice-preparation/node_modules/onnxruntime-node/dist/index.js
```

The script runs the actual vendored inference worker through a native CPU adapter,
checks a binary round trip and real speech generation, and writes the profile and
its provenance. Update the reference hash, model revision and cache version before
preparing a deliberately changed speaker/model. This script is a development tool;
the deployed app requires no native runtime dependency or server inference.

## Attribution

Pocket TTS JS 0.1.0: https://github.com/vlapky/pocket-tts-js (MIT).
Pocket TTS weights: https://huggingface.co/kyutai/pocket-tts (CC-BY-4.0).
WaveAtlas extensions are documented in the vendored NOTICE; upstream license and
model attribution remain included. The original MP3 remains the authorized source.
