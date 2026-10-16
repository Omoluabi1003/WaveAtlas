# FRCN complete-network follow-up

PR #374 merged the 48-outlet geographic baseline before this branch's playback-discovery commits were added. This follow-up records the additional work that must be reviewed separately:

- `lib/stations/frcnNetwork.ts`: complete FRCN stream-discovery registry with explicit pending/candidate/verified states.
- `scripts/probe-frcn-network.ts`: targeted direct-endpoint validation through the existing WaveAtlas stream probe.
- `tests/frcn-network.regression.ts`: guarantees every GeoTruth FRCN outlet remains represented.
- `tests/frcn-probe-runner.regression.ts`: prevents unprobed candidates from being mislabeled verified.
- `docs/frcn-stream-discovery.md`: authoritative playback-discovery procedure.

No stream is admitted merely because the station exists. Geographic identity and playback verification remain separate.
