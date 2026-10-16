# Nigeria Deep Stream Discovery

WaveAtlas initiative for discovering Nigerian terrestrial and online radio streams that are poorly indexed by conventional radio directories.

## Objective

Discover, verify, geolocate, deduplicate and continuously health-check Nigerian radio streams before admission to the WaveAtlas station catalogue. Existing WaveAtlas stations must never be deleted or overwritten by this process.

## Core WaveAtlas rule: no location, no admission

WaveAtlas is a geographic radio experience. A playable stream without a defensible location is an incomplete record and must remain in the discovery queue rather than appear on the atlas.

Every admitted Nigerian station must have:

- verified city or town
- verified state or FCT
- country = Nigeria
- latitude and longitude
- location evidence/source
- location confidence score
- coordinate precision classification

Do not infer a station location from its stream host, CDN, IP address, Zeno/RCast server, website server, telephone area code, or a similarly named station. The stream infrastructure may be physically located anywhere.

## Location verification hierarchy

Use the strongest available evidence in this order:

1. Official station/broadcaster contact page or published studio/transmitter address.
2. Official FRCN/Radio Nigeria station identity or government broadcaster documentation naming the city/town.
3. Nigerian broadcast regulator/licensing documentation where publicly available.
4. Verified station social profile that clearly states its operating city/address.
5. Multiple independent reputable directories or news references that agree on the location.

A directory alone may create a candidate but should not normally satisfy high-confidence admission.

## Coordinate policy

- If a verified street/studio/transmitter address exists, geocode that address and store address-level coordinates.
- If only the city/town is authoritatively verified, use a representative city/town coordinate and mark `coordinatePrecision` as `city`, never pretend it is the transmitter location.
- If only a state is known, do not place the station at the state centroid. Keep it pending.
- Never use `(0,0)`, Nigeria's centroid, a state centroid, Abuja, Lagos, or any other fallback coordinate to make an incomplete station appear mapped.
- Coordinates must fall within the verified locality/state. Flag geographic contradictions for manual review.

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
6. Match station identity using name and frequency.
7. Independently establish city/town and state using the location hierarchy.
8. Geocode only the verified locality/address and record coordinate precision.
9. Run a spatial QA check: coordinate must agree with city/state boundaries.
10. Compare against the existing WaveAtlas catalogue and reject duplicates.
11. Assign separate stream-confidence and location-confidence scores plus verification timestamps.
12. Admit only candidates with verified audio AND verified geospatial identity.
13. Recheck stream health periodically without deleting an existing station after a transient outage.

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
  "coordinatePrecision": "address|transmitter|city|null",
  "locationSource": "string|null",
  "locationVerifiedAt": "ISO-8601 timestamp|null",
  "locationConfidenceScore": "number 0-1",
  "streamUrl": "string",
  "codec": "string|null",
  "bitrateKbps": "number|null",
  "language": ["string"],
  "website": "string|null",
  "streamSource": "string",
  "streamVerifiedAt": "ISO-8601 timestamp",
  "streamConfidenceScore": "number 0-1",
  "health": "verified|degraded|offline|unknown",
  "admissionStatus": "verified|pending_location|pending_stream|conflict|rejected"
}
```

## Initial FRCN seed network

Use the official Radio Nigeria catalogue as a discovery seed. It identifies stations across Abuja, Enugu, Ibadan, Kaduna, Lagos, North Central, North East and South South operations. The catalogue is a source of station identity and metadata, not proof that every station endpoint is playable or sufficiently geolocated.

Priority seed stations include Amuludun FM Ibadan 99.1, Premier FM Ibadan 93.5, Asabari Saki FM 88.3, Kapital FM Abuja 92.9, Bond FM Lagos 92.9, Radio One Lagos 103.5, Metro FM Lagos 97.7, Coal City FM Enugu 92.9, Karama FM Kaduna 92.1, Bronze FM Benin City 101.5, Treasure FM Port Harcourt 98.5, Paradise FM Calabar 104.5, Atlantic FM Uyo 104.5 and ClickNaija Radio.

The locality in a seed name is still subject to verification before coordinates are assigned.

## Existing catalogue remediation

Run a geospatial completeness audit over existing Nigerian WaveAtlas stations. Records missing city, state, latitude or longitude must be enriched only when location evidence can be established. Do not invent coordinates. Records with contradictory city/state/coordinates must be flagged for correction. Existing stations should not be deleted solely because their location is incomplete; instead mark them for remediation until verified.

## Safety rules

- Never fabricate a stream URL or station location.
- Never mark a station verified from directory metadata alone.
- Never replace a healthy existing endpoint with an unverified candidate.
- Never delete an existing WaveAtlas station because one health check fails.
- Keep discovery and production admission separate.
- Prefer official broadcaster evidence when station identity conflicts with third-party directories.
- No location, no admission to the map.

## Long-term target

Sweep all 36 Nigerian states plus the FCT, including commercial, public, community, university, religious and online-first stations. The discovery layer should eventually operate as a self-expanding radio intelligence service with GIS-grade location integrity rather than a manually maintained list.