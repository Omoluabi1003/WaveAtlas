# FRCN playback integrity

WaveAtlas should prefer an honest `pending` state over a false play button. An outlet is geographically discoverable as soon as its FRCN identity is verified, but the UI must expose playback only when a direct stream has passed transport validation.
