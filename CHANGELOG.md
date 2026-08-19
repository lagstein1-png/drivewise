# Changelog

תיאוריה בקלות / EasyTheory — https://lagstein1-png.github.io/drivewise

The visible build marker in the app header (`BUILD`) doubles as the service
worker cache key, so each version below corresponds to one cache generation.

## v42 - Speech engine hardening & static audio groundwork

Covers the unreleased v37-v41 steps; only v42 ever shipped.

### Voice selection
- `speakLocal()` now waits for `voiceschanged` before creating an utterance.
  Previously the first sentence could speak in the browser default voice
  simply because the voice list had not arrived yet. Includes polling for
  browsers that never fire the event (Safari) and a 4s cap so the app can
  never hang waiting.
- Voice ranking rewritten: exact `he-IL` scores 10, generic `he` 8, and
  Google or Microsoft add 4 each. `espeak`/`compact`/`pico` are penalised.
- Falls back to the best available English voice when no voice exists for
  the selected language, instead of leaving the choice to the browser.
- Voices reporting an empty or wrong `lang` are matched by name, covering
  Android devices that mislabel their own voices.
- Female voices are preferred as a tiebreaker (+2 / -1), never overriding
  language match or engine quality. Toggle with `PREFER_FEMALE`.

### Playback reliability
- A live reference to the active utterance is retained; Chrome's garbage
  collector was free to collect it and take `onend`/`onboundary` with it,
  which surfaced as speech stopping mid-sentence.
- Keepalive `pause()`/`resume()` every 9s on desktop Chrome/Edge only,
  for the long-standing ~15s truncation bug.
- `stopSpeech()` calls `resume()` before `cancel()`; an engine left paused
  ignores `cancel()` and stays silent for the rest of the session.
- Watchdog releases the queue when `onend` never fires, so `S.playing`
  can no longer stay stuck on.
- `try`/`catch` around `getVoices`, utterance creation, `speak()` and
  `onboundary`; failures report through a callback instead of stalling.

### Voice testing
- "בדוק את הקול" now renders in device-voice mode too. It previously only
  existed for external providers and returned failure immediately without
  an API key, so the device-voice path could not be tested at all.
- The test reports which voice actually spoke, and falls back from the
  external provider to the device voice rather than just failing.
- Added a test button to the home-screen tip, with a status line and fix
  instructions that unfold automatically when no voice exists for the
  selected language.
- Tip dismissal is now recorded per diagnosis state, so a genuine "no voice
  installed" problem resurfaces once instead of being hidden forever by an
  earlier dismissal. Legacy `'1'` values still count as dismissed.

### Static audio
- `buildAudioMap()` extended from the 24 `PRACTICE` items to the full
  1,273-question bank including answers and hints: 6,906 map entries.
  Rebuilt after `loadBank()` and on every language change.
- Audio file ids are now derived from a content hash rather than from the
  item's position. Editing a question's wording produces a new id, so a
  stale recording can never play over changed text; identical strings
  across questions collapse to one file (559 duplicates merged, 7,295
  strings to 6,736 files).
- `probeStatic()` checks a single file at startup and enables the static
  tier only if it is present. Without it, every sentence would pay a 404
  before falling back to the device voice.
- Added `tools/tts-build.js`, a development-only generator for the MP3
  set. Not loaded by the app; `index.html` remains dependency-free. The
  API key is read from `TTS_KEY` and never written to disk.
- Removed five stale files from `audio/` — three byte-identical copies of
  an ElevenLabs demo clip and a CSV export using a retired id scheme.

### Known issue
- The ElevenLabs provider in `index.html` sends
  `model_id: 'eleven_multilingual_v2'`, which does not support Hebrew.
  Only Eleven v3 does. That path has never worked for Hebrew.

## v22 - Image integrity & answerability gating

### Changed
- Added image-field validation and answerability gating in `loadBank()`.
- Questions that require an image are now withheld when no usable image is attached.

### Data fixes
- Removed invalid `img` values from `data/questions.he.json` (e.g., non-file placeholders such as `img/x`).
- Broken image references in the served bank reduced from **3** to **0**.

### Result
- Bank now serves **1270/1273** questions.
- Withheld IDs: **q0483, q0574, q0907** (missing source images).
- `q0120` remains correctly served (does not require an image).

### Important notes
- This change does **not** modify the renderer behavior (`onerror="this.remove()"` is unchanged).
- The fix prevents unanswerable image-dependent questions from being served, rather than changing image error rendering.

### Restore behavior
- Questions are restored automatically **without code changes** once both are supplied:
  1. the missing image file under `img/`
  2. a valid `img` path in `data/questions.he.json`
