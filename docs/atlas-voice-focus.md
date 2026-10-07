# Atlas Voice focus

Atlas holds exclusive audio focus from activation through listening, processing,
voice generation and actual playback. The radio stays connected at zero volume
and muted. Station startup and volume controls use the same output gate.

The entire buffered reply completes through `AudioBufferSourceNode.onended`,
not the worker's generation completion. Follow-up listening holds focus across
turns and microphone reconnections. Closing cancels capture, requests and speech
before releasing focus. Muting Atlas alone does not end an active conversation.

Release is allowed only with no conversation, capture, request, speech generation
or playback remaining. After release, a cancellable 350 ms delay precedes a
700 ms fade to the saved radio volume and mute state. Reactivation cancels both
delay and fade synchronously. Restoration never calls play, so an already paused
radio remains paused. Generation and recognition timeouts do not release focus.
