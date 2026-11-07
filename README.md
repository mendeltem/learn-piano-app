# Learn Piano

Play the piano, read what you played, and practise with falling notes. Everything runs in the browser.

**Open the app:** https://mendeltem.github.io/learn-piano-app/

## What it does

- **Record or upload** a piano recording. Spotify's open-source [Basic Pitch](https://github.com/spotify/basic-pitch-ts)
  model turns it into notes on your device; the audio never leaves it.
- **Score:** the notes as sheet music (treble and bass clef, 16th-note grid, 4/4) with [abcjs](https://www.abcjs.net/),
  plus a piano roll. Tempo, sensitivity and the shortest note can be adjusted afterwards.
- **Practice:** notes fall onto a keyboard. *Learn* plays them with sound; *Practice* is silent, so you play along on
  your real piano. Speed 25-150 %, look-ahead 1-8 s. Left hand (below middle C) and right hand in different colours.
- **MIDI:** download what was recognised, or open any MIDI file to practise it.

## Run locally

```bash
python3 -m http.server 8000
```
then open http://localhost:8000 (the microphone needs `localhost` or https).

## Files

- `index.html`, `app.js` -- recording, recognition, score, playback, MIDI export
- `practice.js` -- falling-notes view and a small MIDI file reader
- `model/` -- the Basic Pitch model (Apache-2.0, Spotify), served next to the page

## Licence

MIT for this app (see `LICENSE`). The Basic Pitch model in `model/` is Apache-2.0 (Spotify AB).
