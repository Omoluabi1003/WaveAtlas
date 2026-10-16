# FRCN playback follow-up PR scope

This follow-up should merge only the playback-discovery layer added after PR #374:

- full FRCN discovery registry
- candidate/pending/verified state model
- targeted probe runner
- regression guards
- playback evidence policy

It must not downgrade the already merged GeoTruth protections or mark unprobed endpoints as playable.
