# Atlas music intent and clear confirmations

Atlas now separates music programming requests from literal station names.
“Jazz Blues genre” and “play jazz and blues” carry structured genre intent to
the station API. Both genres must appear in programming tags. “Jazz or blues”
accepts either. A station named Blues FM with pop tags is rejected; its name
cannot satisfy a genre request. Missing genre metadata does not become a match.

Location constraints and follow-up requests retain the musical intent. Explicit
station names such as Jazz FM and Premier FM retain station-name lookup. The
same interpretation works through the existing assistant endpoint and client.
Aliases cover R&B, hip-hop, smooth jazz and other supported styles. A bounded
reference list maps common artists and selected song titles to associated genres;
it does not claim universal music knowledge or identify songs from live audio.
Unknown explicit references ask for the artist/genre. Live radio cannot guarantee
that a particular song will play, or that every track matches its format tags.

Playing, connecting and already-playing confirmations keep their existing short
prepared Omoluabi recordings. Their higher RMS target uses a soft peak limiter
with 4x oversampling, instead of turning up a waveform that is already near peak.
General conversation retains the original gain path. Reference recordings,
voice identity/model, pitch and playback rate are unchanged. Radio stays silent
until actual response completion, with the existing guarded restoration.

## Validation

- The real station-search handler is exercised with controlled directory data:
  a name-only Blues FM and a jazz-only station are rejected for Jazz Blues;
  a station tagged jazz and blues is accepted.
- Music intent tests cover aliases, combined genres, all/either matching, place,
  common artist/song references, explanations, follow-up and station controls.
- Shipped confirmation waveforms through the gain/curve transfer function show
  +4.52 dB RMS (playing), +3.50 dB (connecting), +3.49 dB (already playing),
  with estimated peak 0.914. These are signal-level estimates excluding browser
  oversampling; physical speaker loudness has not been measured.
- Typecheck, music/API/loudness, PCM/audio-focus, capture/recognition,
  media-session/runtime and the Omoluabi voice regression suites pass.
- Browser rendering could not run because the execution sandbox blocked Chromium
  socket setup. Phone output still needs device validation.
