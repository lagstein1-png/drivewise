# Changelog

תאוריה מדברת — https://lagstein1-png.github.io/theory

The visible build marker in the app header (`BUILD`) doubles as the service
worker cache key, so each version below corresponds to one cache generation.

## v98 - כללי ההגייה חוזרים לעבוד אופליין

הדף ביקש את `data/speech-rules.json?v=` עם מספר הגרסה, ואילו
ה-service worker מקדים-טוען את אותו קובץ בלי ה-query. ההגשה
מהמטמון משווה כתובת מלאה, ולכן שתי הכתובות אינן אותה רשומה:
הקובץ ישב במטמון ולא נמצא. מי שפתח את האפליקציה בלי רשת קיבל
הקראה בלי כללי ההגייה — בדיוק המילים שתוקנו חזרו להיקרא שגוי.

ה-query ירד. דור המטמון ממילא מתחלף עם BUILD, ולכן הוא היה
מיותר מלכתחילה.

## v97 - ערבית ורוסית כבר לא נקראות בקול אנגלי

כשלא היה במכשיר קול בשפת הממשק, האפליקציה לקחה את הקול האנגלי
הטוב ביותר. הכוונה הייתה להימנע ממנוע רובוטי ישן, אבל מה שיצא
בפועל הוא טקסט ערבי שנקרא בקול אנגלי — מילה במילה, בלתי מובן.
עכשיו היא לא בוחרת קול כלל, ומשאירה את שפת האמירה נכונה.

ובנוסף: כשהקול היחיד בשפה הוא גברי, גובה הקול מורם. זה לא קול
נשי אמיתי, אבל זו הדרך היחידה בדפדפן להתקרב בלי הקלטות.

## v96 - הקול הנשי מזוהה גם בקולות החדשים

טבלת השמות שמזהה קול נשי או גברי הייתה חסרה את הקולות הנוירליים
ש-Edge מתקין בשנתיים האחרונות — הילה ואברי בעברית, זריה ושאכיר
בערבית, סבטלנה ודמיטרי ברוסית — ואת קולות אפל (סמנתה, מילנה,
מאג'ד). הם נחשבו "לא ידוע", והעדפת הקול הנשי פשוט לא חלה עליהם.
עכשיו הטבלה זהה לזו שבשאר האפליקציות ונבדקה מול 63 שמות קולות
שהמערכות באמת מתקינות.

## v95 - Sound on the phone

The app was silent on mobile. Not quiet, not the wrong voice — nothing
at all, and with no error to show for it.

### Fixed
- A phone gives permission to play sound only inside the tap itself,
  and both of the app's routes were asking too late: the recorded file
  plays after its download finishes, and the device voice speaks after
  the voice list loads. Both are rejected in silence, which is why it
  looked like the app simply did not speak.
- The first tap anywhere now unlocks playback, and every later
  utterance goes through that same unlocked player. The permission on
  a phone belongs to the player, not to the page — a new one created
  after a download never gets it.

### Unchanged
- The recordings themselves. All 6,823 files are in place and were
  never the problem.
- Everything about which voice is used, and the fallback to the device
  voice when a recording is missing.

## v94 - A Latin name above the Hebrew one

The app now carries "Talking Theory" alongside תאוריה מדברת. The
Hebrew name stays the heading; the Latin one sits under it in the
header, in the browser tab, and in a shared link.

### Changed
- The header is two lines instead of one. The Hebrew name keeps its
  size and weight; the Latin line is 12px at full contrast, not a
  faded grey — small is not the same as hard to read.
- In English the second line is hidden. The heading already reads
  "Talking Theory" there, and repeating it word for word said nothing.
  Hebrew, Arabic and Russian keep both.
- `manifest.json`, the tab title, the iOS home-screen title and the
  Open Graph tags carry the paired name. `privacy.html` matches.

### Unchanged, deliberately
- The package name `com.teoriamedaberet.app`. It is locked in Play
  Console and cannot be revised.
- The address. Still `lagstein1-png.github.io/theory/`, and the
  canonical tag still points there.
- Every internal identifier, filename and repository path that reads
  `theory`.

## v57 - Recorded voices, and a choice between them

Recordings are generated once from Google Cloud Text-to-Speech and
served as plain files. No key at runtime, no per-user cost, no
dependency on what the device happens to have installed.

### Added
- `audio/<lang>/<voice>/` replaces `audio/<lang>/`, and `staticUrl`
  resolves through the selected voice. The text-to-id map is unaffected:
  it maps text to a content hash and knows nothing about voices, so
  switching only redirects to another folder.
- `AUDIO_VOICES` registers four: Aoede and Achernar (female), Algenib
  and Iapetus (male). Within each gender these are the slower readers of
  the ones auditioned — the spread across candidates was close to a
  second on a single sentence, and slower serves this audience better.
- Voice chips sit with the language and text-size settings. Labels name
  the gender, not the voice: "Aoede" means nothing to someone studying
  for a theory test. Selecting one speaks a line immediately, so the
  choice is heard rather than read. It persists.
- `probeStatic` checks every registered voice, not only the selected
  one, and chips appear only for voices that answered. A generation run
  stopped partway — which is how you stay inside the free quota — would
  otherwise have offered a voice with no files behind it.
- If the stored choice is missing, playback falls back to the first
  voice present while the preference is left untouched, so it is
  honoured as soon as that voice is generated.
- `tts-build.js verify` reports per voice how many of the expected files
  exist and how many are too small to hold speech. An empty file is
  worse than a missing one: the app finds it, plays silence, and never
  falls back to the device voice.

### Tooling
- `tools/run-*.cmd` are double-click launchers. The API key is read with
  `Read-Host -AsSecureString`, so it is never shown, never written to
  disk, and cleared afterwards. Earlier instructions asked for
  copy-paste-Enter cycles into PowerShell, and a slip concatenated them
  into one line — twice, with the key echoed on screen both times.
- `try` renders the same real bank sentences across shortlisted voices,
  one row per sentence, for comparison on actual content.
- `tools/samples/` is git-ignored. Auditions are regenerated on demand.

## v55 - The reading voice can be switched

Superseded by v57; see above.

## v51 - Network voices without stranding the reader offline

Edge exposes Microsoft's online neural voices to the Web Speech API,
Hebrew included — a natural female voice that Chrome never showed,
since Chrome surfaces only locally installed voices.

### Fixed
- The ranking already preferred those voices, and correctly: online
  voices are usually better. But they are silent without a connection,
  in an app whose home screen advertises offline use. The bonus flips to
  a penalty when `navigator.onLine` is false, and a network voice that
  fails mid-sentence retries once on a local voice and is demoted for
  the rest of the session.

## v54 - An empty voice list is not proof of no speech

### Fixed
- v53 read an empty `getVoices()` as proof no engine was installed and
  told the user speech was unsupported. Android devices exist where that
  list is permanently empty while `speak()` works fine on the system
  default — so the message appeared on exactly the devices it was meant
  to help, and was false. Only a missing `speechSynthesis` counts as
  unsupported now, and the voice test decides by attempting to speak
  rather than by inspecting the list.

## v52 - Question of the day removed

Removed at the maintainer's request: the card, its CSS, the stored key,
`dayOfYear`, four strings per language, three click handlers, and the
keydown listener that existed only to read it aloud. `dayKey` stayed —
the day streak and progress history both use it.

## v50 - Answers announced by number

Driven by tester feedback: the question and its four answers were read as
one continuous stretch, so a listener who cannot read Hebrew had no way
to tell where one answer ended and the next began.

### Added
- Each answer is preceded by a spoken "תשובה 1", "תשובה 2" and so on, in
  all four languages, and `speakQueue` leaves 320ms between items.
  The number is queued as its own item rather than prepended to the
  answer text, which keeps the answer byte-identical to the bank entry —
  so it still matches its recording — and keeps the karaoke word offsets
  aligned.
- A matching number badge is drawn beside each answer, outside the span
  the highlighter rewrites.

### Fixed
- The exam's wrong-answer feedback said "התשובה הנכונה מסומנת בירוק" —
  an instruction about colour delivered through the audio channel, which
  told a listening user nothing. It now names the answer number and reads
  the correct answer aloud.
- `speakQueue` drops empty items. A question without a second hint used
  to queue an empty utterance, which wasted a slot, added a pause, and
  would have requested a recording for the empty string.
- The spoken UI strings, including the new numbers, are now in the audio
  map, so they will be recorded along with everything else. Without this
  the voice would switch mid-question between a recording and the device
  voice.

### Changed
- `tools/tts-build.js` no longer reimplements the id mapping. It extracts
  `audioId` and `buildAudioMap` from `index.html` and runs them against
  the real bank, so the generated set is by construction exactly what the
  app looks for. The cross-check gained a reverse assertion — every
  string the app can speak has a file — which is what caught the missing
  UI strings above. Count rose from 6,736 to 6,794.

## v45 - Provider fix, static tier default, image loading

### Fixed
- The ElevenLabs provider sent `model_id: 'eleven_multilingual_v2'`, a
  model with no Hebrew support, so that path could never have worked for
  the app's primary language. Now sends `eleven_v3`, the only ElevenLabs
  model that supports Hebrew. Still unverified against the live API —
  no key has been used against it.
- `STATIC.on` now starts `false` and is switched on by `probeStatic()`
  only when a recording is actually present. It previously started `true`,
  so any sentence spoken in the window before the probe resolved paid a
  wasted 404 before falling back.

### Changed
- Question images carry `loading="lazy"` and `decoding="async"`. The app
  renders one question at a time, so the practical gain is small; it
  mainly stops image decode from competing with the first paint.

## v44 - Script isolation

### Fixed
- The whole app script is wrapped in an IIFE. Every declaration used to
  live in the page's global scope, including a top-level `const t`. Any
  other script declaring `t` — a browser extension injecting into the
  main world — made the entire script fail to parse, so nothing ran at
  all while the static markup still rendered and the page looked fine.
  Observed in practice: the app was dead on `localhost` in one Chrome
  profile while the byte-identical file worked on the Pages origin.
- No `use strict` was added; the change is name isolation only.

## v43 - Real service worker

### Fixed
- There was no service worker on the live site at all. Registration built
  one from a `blob:` URL, which browsers reject as a worker script, and
  the fallback registered `sw.js`, a file that had never existed in the
  repo. Both failures were swallowed by empty catch blocks, so the
  "works offline" badge was claiming something the app could not do and
  `BUILD` was keying a cache that was never created.
- Adds `sw.js` at the root, registered as `sw.js?v=' + BUILD` so `BUILD`
  stays the single source of truth: changing it changes the script URL,
  which installs a new worker and drops the old cache.
- HTML is served network-first, so a code change always reaches the
  device. Assets are cache-first. Cache cleanup only removes keys
  prefixed `theory-`, leaving the app's own `dw-tts-v1` audio store
  intact.
- Removed `SW_SRC`, 33 lines of dead code whose presence concealed the
  fact that no worker was running.

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
  *(Fixed in v45.)*

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
