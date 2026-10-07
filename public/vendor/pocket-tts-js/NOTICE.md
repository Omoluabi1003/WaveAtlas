Pocket TTS JS 0.1.0, https://github.com/vlapky/pocket-tts-js
Vendored from the npm package pocket-tts-js@0.1.0 (MIT).
Package SHA-1: 010cbc42a4338e245f3b9d07deb7fac814c63300

WaveAtlas extensions in index.js, worker.js, index.d.ts and voice-state.js:
export/import compact prepared speaker tensors; preserve typed arrays and NaN
padding; copy reference-conditioned state before each utterance; allow a full
precision encoder independently of the quantized generation models. The
upstream MIT license remains in LICENSE.

Runtime modules and nested worker URLs use the same WaveAtlas release query to
avoid mixing incompatible SDK versions retained by an installed service worker.

The worker and its relative imports are hosted on the WaveAtlas origin so
browser worker creation does not depend on a rewritten cross-origin CDN module.
The ONNX runtime and model weights are still downloaded from upstream hosts.

Pocket TTS weights: © Kyutai, CC-BY-4.0.
https://huggingface.co/kyutai/pocket-tts
https://creativecommons.org/licenses/by/4.0/

Omoluabi reference: derived from the user-authorized repository file
Omoluabi voice.mp3, first 10 seconds after leading silence removal,
mono PCM16 at 24 kHz. No voice replacement or pitch transformation applied.

The bundled omoluabi-voice-profile.bin was prepared once from that reference
using the full precision encoder and pinned model revision
c469236dbc5f68287fa2fbf175b66de3b80123af. It retains float32 tensor values without
additional quantization. Provenance and regeneration instructions are in
docs/omoluabi-voice-profile-provenance.json and docs/atlas-omoluabi-primary-voice.md.
