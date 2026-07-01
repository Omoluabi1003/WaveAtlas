# Empty Atlas CTA manual verification

Use this checklist when the Atlas starts without an active station. Verify both iPhone Safari and a desktop browser.

## iPhone Safari

- Tap **Explore Nearby** once. The Empty Atlas status line must change immediately, the Explore drawer should open, and nearby discovery should populate available signals or show the polished fallback message.
- Tap **Wander** once. The Empty Atlas status line must change immediately and Wanderer Mode should start looking for a playable global signal.
- Tap **Search** once. The Atlas search drawer/input should open or receive focus.
- Tap **Voice Search** once. The Atlas should request voice search; if speech recognition or microphone access is unavailable, a clear unavailable message must appear while manual search remains available.
- Tap **Editorial Picks** once. Daily Passport/editorial picks should open, or the user should see the polished unavailable state from the Daily Passport surface.

## Desktop

- Click **Explore Nearby**, **Wander**, **Search**, **Voice Search**, and **Editorial Picks** once each from the Empty Atlas state.
- Confirm every CTA has immediate visible feedback in the Empty Atlas status line.
- Confirm no button is blocked by overlays, z-index layers, disabled states, pointer-events rules, or hydration mismatch.
- Confirm GeoAudio Journey playback and Live Radio behavior remain unchanged while exercising these Empty Atlas CTAs.
