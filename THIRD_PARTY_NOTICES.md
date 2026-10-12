# Third-party notices

## Atlas voice: Pocket TTS

WaveAtlas uses the `pocket-tts-js` browser integration for the optional neural Atlas voice path.

- `pocket-tts-js` source code: MIT License, copyright its respective contributors.
- Pocket TTS model weights and voice assets: Kyutai, Creative Commons Attribution 4.0 International (CC BY 4.0).
- Atlas runs the Pocket TTS inference path client-side in the user's browser. WaveAtlas does not require an API key or a paid text-to-speech account for this path.

The Omoluabi Paul reference recording is a WaveAtlas project asset supplied by the project owner and is used to condition the Atlas voice locally in the browser.

See the upstream Pocket TTS and `pocket-tts-js` projects for their complete license terms and notices.

## Station social previews

Country flags are local SVG assets from flag-icons 7.5.0 (MIT, https://github.com/lipis/flag-icons); license: public/flags/LICENSE.txt. ISO country identifiers and names are sourced from Debian iso-codes, representing the ISO 3166-1 factual country list.

Social image fonts are Noto Sans, Noto Sans CJK, Noto Sans Arabic, Hebrew, Devanagari and Thai, bundled from the Noto project (SIL Open Font License 1.1). CJK is subset and the fonts are compressed to WOFF for server rendering. License and attribution: assets/social-fonts/LICENSE.txt.

Server-side RTL card text uses bidi-js (MIT) and arabic-persian-reshaper (MIT); their licenses are included in the installed packages. These dependencies are used only by the social image renderer.
