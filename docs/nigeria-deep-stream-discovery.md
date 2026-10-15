# Nigeria Deep Stream Discovery

WaveAtlas initiative for discovering Nigerian terrestrial and online radio streams that are poorly indexed by conventional radio directories.

## Objective

Discover, verify, deduplicate and continuously health-check Nigerian radio streams before admission to the WaveAtlas station catalogue. Existing WaveAtlas stations must never be deleted or overwritten by this process.

## Discovery sources

- Official broadcaster and station websites
- FRCN / Radio Nigeria station catalogue
- Icecast and SHOUTcast mountpoints
- AzuraCast, Zeno and RCast players
- Direct MP3/AAC endpoints
- HLS `.m3u8` manifests
- `.m3u` and `.pls` playlists
- Embedded HTML/JavaScript player configuration

## Admission pipeline

1. Discover candidate station and endpoint.
2. Resolve redirects and playlist wrappers.
3. Perform an HTTP/audio handshake with conservative timeouts.
4. Require evidence of playable audio, not merely HTTP 200.
5. Record codec/MIME type and endpoint health.
6. Match station identity using name, frequency, city/state and official source.
7. Geocode only when location evidence is sufficiently strong.
8. Compare against the existing WaveAtlas catalogue and reject duplicates.
9. Assign confidence and verification timestamp.
10. Admit only verified candidates to production.
11. Recheck stream health periodically without deleting an existing station after a transient outage.

## Candidate schema

```json
{
  "name": "string",
  "frequency": "string|null",
  "city": "string|null",
  "state": "string|null",
  "country": "Nigeria",
  "latitude": "number|null",
  "longitude": "number|null",
  "streamUrl": "string",
  "codec": "string|null",
  "bitrateKbps": "number|null",
  "language": ["string"],
  "website": "string|null",
  "source": "string",
  "verifiedAt": "ISO-8601 timestamp",
  "confidenceScore": "number 0-1",
  "health": "verified|degraded|offline|unknown"
}
```

## Initial FRCN seed network

Use the official Radio Nigeria catalogue as a discovery seed. It identifies stations across Abuja, Enugu, Ibadan, Kaduna, Lagos, North Central, North East and South South operations. The catalogue is a source of station identity and metadata, not proof that every station endpoint is playable.

Priority seed stations include Amuludun FM Ibadan 99.1, Premier FM Ibadan 93.5, Asabari Saki FM 88.3, Kapital FM Abuja 92.9, Bond FM Lagos 92.9, Radio One Lagos 103.5, Metro FM Lagos 97.7, Coal City FM Enugu 92.9, Karama FM Kaduna 92.1, Bronze FM Benin 101.5, Treasure FM Port Harcourt 98.5, Paradise FM Calabar 104.5, Atlantic FM Uyo 104.5 and ClickNaija Radio.

## Safety rules

- Never fabricate a stream URL.
- Never mark a station verified from directory metadata alone.
- Never replace a healthy existing endpoint with an unverified candidate.
- Never delete an existing WaveAtlas station because one health check fails.
- Keep discovery and production admission separate.
- Prefer official broadcaster evidence when station identity conflicts with third-party directories.

## Long-term target

Sweep all 36 Nigerian states plus the FCT, including commercial, public, community, university, religious and online-first stations. The discovery layer should eventually operate as a self-expanding radio intelligence service rather than a manually maintained list.
