# FRCN playback completion

WaveAtlas maintains the complete FRCN station identity/geography registry separately from playback verification.

## Admission rule

An FRCN outlet may exist geographically without a playable internet stream. A station becomes playable only after a direct HTTPS MP3/AAC/HLS/Icecast/Shoutcast endpoint passes the existing `probeStream` validation.

Never infer a stream from a station website, social-media live page, CDN hostname, city, frequency, or another FRCN outlet.

## Discovery order

For each pending FRCN outlet:

1. Inspect the official FRCN station/zonal page and embedded player/network requests.
2. Inspect station-owned web properties for audio elements, `.m3u8`, `.m3u`, `.pls`, Icecast/Shoutcast status pages and AzuraCast/Zeno/RCast endpoints.
3. Search reputable radio directories only as candidate discovery sources.
4. Probe the direct endpoint with WaveAtlas `probeStream` using GET/range behavior rather than relying on HEAD.
5. Promote to `verified` only after an audio transport succeeds.
6. Keep failed or unresolved stations `pending`; never fabricate playback.

## Current first candidate

Kapital FM 92.9 Abuja has an independently discovered direct candidate at `https://cast4.asurahosting.com/proxy/radioni1/stream/;/`. It is deliberately marked `candidate` until the WaveAtlas runtime probe succeeds.

The FRCN registry must remain additive and complete even when some outlets are temporarily offline or have no public internet stream.
