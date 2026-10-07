# Omoluabi Paul as Atlas's primary voice

Atlas uses the repository recording `Omoluabi voice.mp3` as the reference for
Pocket TTS. No API key, paid inference endpoint, account or device voice is
required. Routine replies ship as prepared Omoluabi audio; new wording is
synthesized on the listener's device.

## Ready replies on the first visit

`public/omoluabi-ready-speech.bin` contains 28 replies generated once from Paul's
existing speaker profile with the actual pinned models. The 3,409,628-byte pack
includes greetings, capabilities, playback and volume controls, navigation,
station connection outcomes and useful failure replies. Source, model, profile
and output hashes and each reply's wording are recorded in
`omoluabi-ready-speech-provenance.json`. The catalogue is
`lib/atlas-ready-replies.json`; changing it requires regenerating the pack.

The app starts loading this lightweight audio pack shortly after mounting,
before Voice Search opens. The worker decodes the pack once and retains every
reply independently of the bounded dynamic speech cache. These replies need no
inference SDK, model downloads, voice enrollment, profile restoration or
IndexedDB, including on a fresh browser. Cache Storage retains the pack for
offline reuse; denied persistence still permits playback. The first visit still
needs to download the pack, so connection speed affects its availability.

The same pure, keyless intent engine used by `/api/atlas-assistant` now runs in
the app, avoiding a server request for routine interpretation. Actual station
searches and actions still run through the existing action callbacks. Spoken
confirmations are chosen only after those callbacks report their outcome:
playing, connecting, already playing, completed, not found or failed. A
connecting station is never described as playing. The full station name and
result remain in the transcript; the concise spoken confirmation uses the ready
audio. No omitted callback or failed action selects a successful confirmation.

When Atlas is open and a station is selected, it quietly prepares that station's
likely questions, such as its identity, location, language, genre and stream
quality. These sentences come from the actual station context. Background
preparation emits no speech. A user request interrupts this work, and a routine
reply can play even while model initialization is stalled or has failed. New
uncached wording still needs local synthesis, whose speed depends on the device;
ready replies do not make arbitrary new sentences instantaneous.

The product interface shows normal listening, thinking and speaking states.
Model downloads, decoding and preparation details are internal rather than
displayed as the conversation state. An actual speech failure leaves the answer
in the transcript and offers a voice retry.

## Prepared profile and completed speech

`public/omoluabi-voice-profile.bin` contains the speaker state generated once
from the unchanged canonical reference using a full precision encoder. It is
6,200,016 bytes. Models are pinned to Hugging Face revision
`c469236dbc5f68287fa2fbf175b66de3b80123af`, matching the profile. The binary
container preserves float32 values, BigInt state and NaN padding; only occupied
cache runs are stored. Its hashes are in `omoluabi-voice-profile-provenance.json`.

The worker loads the generation SDK and models only when it needs new speech.
It imports the saved or bundled profile without repeating reference decoding or
voice encoding. Those steps remain a recovery path if the profile is invalid or
unavailable. A runtime missing profile import/export fails before model downloads
or enrollment, instead of silently entering that expensive recovery path.

Completed generated PCM and the profile persist in IndexedDB. Responses are
keyed by voice version and normalized wording. A changed reference/model version
cannot reuse old speech. Dynamic storage is bounded to 64 responses and 32 MiB,
with a smaller 16-response memory cache. Blocked or full storage leaves speech
usable without persistence. Shipped replies take precedence over older generated
speech and are unaffected by dynamic cache eviction.

## Continuous playback and voice fidelity

The PCM player holds the complete reply, joins samples in order and plays one
AudioBuffer at the model's 24 kHz sample rate. This prevents playback gaps when
local synthesis is slower than real time. Ready and cached replies bypass
generation; an uncached sentence finishes synthesis before playback starts.
Playback rate stays at 1. One gain applies to the entire reply, raising quiet
speech toward a moderate RMS level with a sixfold limit and peak headroom.
No pitch shift, bass adjustment or compressor is applied.

The ready pack stores scaled PCM16 and restores its original level for playback.
Scaling avoids clipping model samples outside the usual amplitude range. The
reference recording and speaker tensors are unchanged, and each generated
utterance receives an independent state copy. This protects conditioning from
mutation but is not a perceptual guarantee of exact voice likeness.

Runtime URLs share the `omoluabi-ready-20261007-v1` release query, including
nested worker imports. Service workers load voice scripts from the network first
and use the exact cached URL offline. App activation deletes only older app
caches; it preserves the SDK model cache and `waveatlas-ready-speech-v1`.
Updates do not invalidate Paul's unchanged profile or completed dynamic replies.

Interruption stops scheduled audio, cancels synthesis and prevents partial or
stale speech from being stored or delivered. Atlas resumes listening after
audible completion. First output has a 120-second limit, stalled chunks a
45-second limit and generation an overall 240-second limit. The AudioContext is
resumed again before playback in case it was suspended during synthesis. All
Voice Search entry points use this same Atlas surface.

## Verification

`npm run test:omoluabi-voice` covers the real audio asset and provenance, catalogue
completeness, fresh-device playback of all 28 replies with no SDK initialization,
blocked storage, offline reuse and corrupt-cache recovery. Executable worker
tests cover stalled and failed background model initialization, silent station
preparation, persistent replay, concurrent reuse and interruption. Existing
regressions cover reference samples, profile tensor fidelity, PCM scheduling,
gain and pitch, truthful action outcomes, voice status, versioned imports and
service worker cache preservation. Media-session and recognition regressions,
Atlas lifecycle, TypeScript, targeted lint and the production build also pass.

The earlier PR #343 browser check observed 482 ms from Send to speaking for a
previously generated reply after reload. That measures its dynamic replay path,
not first-visit prepared replies in this change. Its screenshot remains
`atlas-voice-preview-2026-10-07.jpg` as historical verification. Keyboard input is
used for browser voice-output tests; microphone recognition and perceptual voice
likeness require separate evaluation.

## Reproduce the assets

Install the native runtime separately from the app:

```sh
npm install --prefix /tmp/atlas-voice-preparation onnxruntime-node@1.20.0
```

Download these files from the pinned revision's `onnx/english_2026-04/` folder:
`bundle.json`, `tokenizer.model`, `bos_before_voice.npy`, `mimi_encoder.onnx`,
`text_conditioner_int8.onnx`, `flow_lm_main_int8.onnx`, `flow_lm_flow_int8.onnx`
and `mimi_decoder_int8.onnx`.

To deliberately rebuild the profile:

```sh
node scripts/prepare-omoluabi-voice.mjs /absolute/path/to/models /tmp/atlas-voice-preparation/node_modules/onnxruntime-node/dist/index.js
```

To regenerate the ready replies from the existing profile:

```sh
node scripts/prepare-atlas-ready-speech.mjs /absolute/path/to/models /tmp/atlas-voice-preparation/node_modules/onnxruntime-node/dist/index.js
```

These scripts run the actual vendored inference worker through a native CPU
adapter, check serialization and audible samples, and verify synthesis preserves
the original speaker state. The ready-reply script does not re-encode Paul's
voice. Update identity hashes and versions when intentionally changing the
speaker, model or audio pack. These are development tools; the deployed app has
no native runtime dependency or server inference.

## Attribution

Pocket TTS JS 0.1.0: https://github.com/vlapky/pocket-tts-js (MIT).
Pocket TTS weights: https://huggingface.co/kyutai/pocket-tts (CC-BY-4.0).
WaveAtlas extensions are documented in the vendored NOTICE; upstream license
and attribution remain included. The original MP3 is the authorized source.
