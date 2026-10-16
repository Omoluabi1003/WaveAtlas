# FRCN playback admission states

- `pending`: official FRCN outlet exists in GeoTruth but no direct public audio endpoint has been proven.
- `candidate`: a direct HTTPS audio endpoint has been discovered but still requires WaveAtlas runtime probing.
- `verified`: the endpoint has passed the existing stream probe and may be promoted into the playable station catalog.

A social-media live page or station website is not a direct stream. Failed endpoints stay out of playback while the station remains on the FRCN geographic registry.
