---
name: drivewise
description: Project rules and debugging playbook for DriveWise / נהג חכם, a Hebrew driving-theory PWA built as a single vanilla-JS index.html. Use this skill whenever the work touches DriveWise, נהג חכם, למידה חכמה, the driving theory app, the question bank, Hebrew TTS, the service worker, or the GitHub Pages deployment — even if the user only describes a symptom ("questions repeat", "my change didn't show up", "TTS reads it wrong") without naming the project. Always consult this before proposing an architecture, adding a dependency, or diagnosing a caching or randomization bug.
---

# DriveWise / נהג חכם

Hebrew driving-theory study app (private licence, category B) for the Israeli MOT theory test.

## Architecture — read this before proposing anything

- **One file.** Everything lives in a single `index.html`: markup, CSS, and JavaScript.
- **Vanilla JS only.** No React, no Vue, no Firebase, no bundler, no build step, no npm install, no TypeScript.
- **PWA.** Manifest plus a service worker, installable on Android.
- **Hebrew, RTL.** `dir="rtl"` throughout. Some content also exists in Arabic, English, and Russian.
- **Data.** ~1,273 questions imported from the official MOT bank, plus ~415 images.
- **Hosting.** GitHub Pages at `lagstein1-png.github.io/drivewise`. Previously Netlify — that migration is done, don't reopen it.

**If an analysis mentions React components, Firebase collections, a build pipeline, or `npm run`, it is describing a different codebase.** Say so plainly rather than working from it. This has happened repeatedly with output from other AI tools; the correct response is to read the actual `index.html` and start over.

## Hard constraints

- **Zero spend.** No paid services, no paid APIs, no paid hosting. The only accepted expense is the one-time Google Play developer fee. Do not propose anything with a bill attached, not even a free tier that later charges.
- **No secrets in the repo.** API keys never go in `index.html` or anywhere in the repo — it is a public GitHub Pages site, so anything committed is world-readable. A key was exposed this way once and had to be revoked. If a feature seems to need a key client-side, redesign the feature.
- **No new dependencies** without asking first, and default to writing the code instead.

## Accessibility is the point, not a nice-to-have

The intended users are people the standard theory materials fail: dyslexic learners, people with ADHD, new immigrants studying in a second language, and older drivers renewing a licence. When choosing between a clever solution and a legible one, choose legible. Large tap targets, high contrast, short sentences, no timed pressure, no penalty for a wrong answer beyond the explanation.

## Debugging playbook — follow this order

### Symptom: "I changed the code but nothing changed on the phone/site"

### Symptom: "the same questions keep appearing, in the same order"

Both of these have the same two usual causes, and the service worker is far more often the culprit than the code. Check in this order:

1. **Stale service worker cache.** Bump `BUILD` in `index.html`. It is the single source of truth: the worker is registered as `sw.js?v=<BUILD>`, so changing it installs a new worker and drops the old cache. Verify with DevTools → Application → Service Workers → Update on reload, or unregister and hard-reload. Do this *before* reading any application logic.

   Note the worker only started existing in v53. Before that, registration was attempted from a `blob:` URL, which browsers reject, and the fallback pointed at an `sw.js` that was not in the repo. Both failures were swallowed, so the app ran with no cache at all while claiming to work offline. If you are reading a report from before that, "stale cache" was not the cause.
2. **GitHub Pages build lag.** A push can take a minute or two to go live. Confirm the deployment finished before concluding the fix failed.
3. **A hardcoded array.** Historically the question list was pinned to a short hardcoded array instead of drawing from the full bank. Confirm the selection function reads the whole 1,273-question set and shuffles.
4. **Shuffle scope.** Check that the shuffle runs per session rather than once at load, and that the "continue learning" (המשך למידה) screen randomizes too — it has been missed there before.

Only after all four come back clean should you look elsewhere.

### Symptom: Hebrew TTS sounds wrong, or does not speak

TTS is three-tier, in this order: pre-recorded MP3s → an external TTS API → the device's built-in `SpeechSynthesis`. Always establish *which tier actually spoke* before changing anything; the fix is completely different in each. With `?dev=1` the console names the tier on every utterance.

**Tier 1 is the intended path.** Recordings live in `audio/<lang>/<voice>/<id>.mp3`, generated once by `tools/tts-build.js` and served as plain files. The id is a content hash of the text, so identical strings share one file and an edited string simply has no recording and falls through. `probeStatic()` decides at startup whether the tier is available at all — an empty `audio/` folder disables it rather than paying a 404 per sentence.

**Never conclude anything from an empty `getVoices()`.** Some Android devices return an empty list permanently and still speak perfectly on the system default. A version that treated the empty list as proof of no engine told users speech was unsupported while it was working. Only a missing `speechSynthesis` object means unsupported; everything else is decided by attempting to speak.

**The device voice cannot be chosen on Android.** Chrome there usually exposes one voice per language, whichever the system is set to, so the ranking in `voiceScore` has nothing to choose between. Voice selection happens in the OS, not in the app. This is the reason recordings exist.

Device voice quality varies enormously by phone and often cannot be fixed in code. The home-screen tip carries the upgrade instructions and a test button that reports which voice actually spoke.

### Symptom: a specific Hebrew word is pronounced as a different word

Measured on 2026-08-24 against the live API, with `tools/engine-probe.js` and `tools/ipa-ab.js`. Do not re-derive any of this from documentation; the documentation disagrees with the API on the second line.

| | |
|---|---|
| Niqqud reaches the engine and changes the audio | **yes** |
| Chirp 3 HD accepts SSML | **yes** — contrary to what the docs imply |
| `<phoneme alphabet="ipa">` is enforced | **no**, on either model |

The phoneme result is not a judgement call. On `he-IL-Wavenet-A`, `ph="muˈtaʁ"` and `ph="maˈtiʁ"` returned **byte-identical files** — same sha256, same 8,256 bytes. The attribute is discarded before synthesis and the enclosed text is what gets read. On Chirp 3 HD the bytes differ, but only in timing; by ear both still say the written word. **There is no IPA route into Hebrew pronunciation on this API.** Switching to Wavenet buys nothing and costs naturalness.

So pronunciation is controlled by exactly two things, in this order:

1. **The letters.** They decide which word is spoken. This is why `מותר` vowelled as `מֻתָּר` came out wrong — that spelling sends מ־ת־ר, and a missing letter is a different word. `tests/ltest.js` now fails any rule that spends a letter on a vowel.
2. **The niqqud.** It tunes the reading of the letters that are there. Real, measured, and second in line.

When a word is reported wrong, ask which of the two it is before writing a rule. Nine times out of ten it is the first.

### Which words the engine is guessing at

`data/.dicta-raw.json` holds all 6,823 bank strings vowelled in context. Ask it which words Dicta itself vowelled more than one way — those are exactly the words the engine has to guess at, and they are the frequent ones, not the obscure ones: `בדרך` 283 split 144/139, `לרכב` 254, `ברכב` 348, `נהג` 139 across three readings.

Grade every proposed rule against those decisions before adding it, and state the number in the rule's `why`. The bar is 95% agreement. Below it a rule moves the error instead of removing it — which is why `נהג` and `בנסיעה` still have none, at 33% and 45% for the best predictor found.

This is also why the full-vocalization experiment failed: it vowelled `את`, `על` and `של` too, thousands of words with nothing ambiguous about them, for no gain and a heavy accent.

## Known gotchas

- **The category "B" letter.** In the source spreadsheet the licence category is sometimes a Cyrillic "В" (U+0412) rather than a Latin "B" (U+0042). They render identically and compare as unequal. When a filter silently returns zero questions, check this first.
- **Hebrew string comparison.** Watch for trailing whitespace and final-form letters (ם ן ץ ף ך) when matching answer text.
- **RTL and numbers.** Mixed Hebrew text with Latin digits or English terms reorders unexpectedly; test visually rather than trusting the string.

## Working style

- One change at a time, verified before moving on.
- Give exact steps: which file, which line, what to replace. Not "you could refactor the selection logic."
- When something is broken, read the actual code before theorizing about the cause.
- Prefer the smallest change that fixes the problem over a rewrite.

## Generating the recordings

`tools/` holds development-only scripts. They are not loaded by the app; `index.html` stays dependency-free.

Double-click launchers, each prompting for the API key without echoing it:

- `run-samples.cmd` — one sentence in every Hebrew voice the provider offers, plus a comparison page.
- `run-compare-3.cmd` — real bank sentences across shortlisted voices, side by side.
- `run-generate-all.cmd` — the full set, all four voices. Resumable: finished files are skipped.
- `run-verify.cmd` — checks what exists. Needs no key.

Volume is about 6,800 strings and 280,000 characters per voice, roughly 100MB. Google's free tier is 1M characters per month, so three voices are free and the fourth costs a few dollars.

**Never put the API key in a command line or a file.** It has been exposed twice in screenshots that way. The launchers read it with `Read-Host -AsSecureString`.

### The key is rejected before any recording starts

`checkKey` in `tools/tts-build.js` runs first and refuses a key with any non-ASCII character, naming the position and the code point without ever printing the key. Two real cases, both of which look like an authentication failure and are not:

- **A Hebrew letter (code 1488–1514).** The key was pasted with the keyboard layout in Hebrew, so every Latin character came out as a Hebrew one.
- **Code 22 at position 1, one asterisk on screen.** `Ctrl+V` does not paste into `Read-Host`; the console typed `^V` and the key never arrived. **Right-click pastes** in that window.

`TTS_KEY` in the environment silently wins over the prompt — the launcher prints `Using TTS_KEY from the environment` and never asks. A bad value there fails identically on every run. Clear it for one session with `set TTS_KEY=` and launch from that same window; `reg delete` alone does not help, because a double-clicked launcher inherits Explorer's stale copy.

The smoke test records one real file before anything is deleted. That ordering is not cosmetic: an earlier round deleted 26,692 recordings with an invalid key and had nothing to put back.

### Hebrew in the console prints as boxes or question marks

Two independent halves, and fixing one leaves the other:

1. **Decoding.** Every `run-*.cmd` sets `chcp 65001`. Without it the console reads UTF-8 in the legacy codepage and Hebrew arrives as boxes.
2. **Glyphs.** The console font must contain Hebrew, and on this machine **only Courier New does** — verified glyph by glyph. Lucida Console (the system default for the console) does not, and neither does Consolas. A missing glyph renders as `?`, not as a box, which is why this looks like an encoding fault and is not one. Set it in the window's title-bar menu → **Defaults** → Font → Courier New.

The giveaway: `√` and `·` render while Hebrew does not. Those two are exactly what a Latin-only console font covers.

Diagnose in this order — run the tool through `node` directly first. If Hebrew is still wrong with no PowerShell in the chain, the launcher is not the problem.

## Open items

- Rename the app to "למידה חכמה". Touches `index.html`, `manifest.json` and the Play listing.
- The ElevenLabs provider now sends `eleven_v3`, the only model with Hebrew, but has never been run against the live API.
- About 1,250 strings are recorded with superseded pronunciation — several rounds of rules landed after they were generated. `node tools/diff-build.js` names them, and `tools\run-generate-all.cmd` fixes them. They still play, they just say the old thing.

## Done, do not reopen

- An IPA layer over the recordings, through `<phoneme alphabet="ipa">`. Measured, not assumed: on Wavenet two opposite IPA strings returned byte-identical audio, and on Chirp 3 HD the bytes differ but the ear still hears the written word. The attribute is discarded. A pronunciation dictionary in IPA, a PLS export, or a Python phonemizer all end at this same wall, so do not price them again.

- Recordings are generated. `audio/he/<voice>/` holds 6,823 files in each of four voices, about 105MB and 7.6 hours per voice, and `node tools/tts-build.js verify` reports the set complete. The static tier is on.
- Full vocalization of the bank. It was generated, measured and reverted — with niqqud on every word the voice reads with a heavy foreign accent, and moving the vowel onto the mater lectionis did not rescue it. Targeted rules for genuinely ambiguous words are the approach; blanket niqqud is not.
- Lazy-loading for the images — `loading="lazy"` is in place, though the gain is small since one question renders at a time.
- Randomization on "continue learning" — verified empirically, five independent loads gave five different opening questions, including the restore-from-saved path.
- The whole script is wrapped in an IIFE. Before that, a single global `const t` collided with anything a browser extension injected and killed the entire script, leaving a page that rendered but did nothing.
