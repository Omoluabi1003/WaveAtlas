# Atlas Voice focus

Atlas Voice keeps the live radio stream connected while giving the conversation foreground audio priority.

- Opening: 5% of the listener's radio level.
- Listening: 2% to prevent talk-radio bleed into recognition.
- Thinking: 4% so the live signal remains perceptible without competing with Atlas.
- Speaking: 1.5% so Atlas is clearly foregrounded.
- Closing Voice Mode restores the listener's previous radio level.

Voice requests have an 8 second assistant timeout and automatically recover to listening. Recent conversation turns are sent to the local Atlas assistant so follow-up phrases retain context. Station choices are ranked through the existing Atlas Intelligence Engine instead of taking the first raw search result.
