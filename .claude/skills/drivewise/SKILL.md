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

1. **Stale service worker cache.** The old `index.html` is being served from cache and the new one never loads. Bump the cache version constant, and verify with DevTools → Application → Service Workers → Update on reload, or unregister the worker entirely and hard-reload. Do this *before* reading any application logic.
2. **GitHub Pages build lag.** A push can take a minute or two to go live. Confirm the deployment finished before concluding the fix failed.
3. **A hardcoded array.** Historically the question list was pinned to a short hardcoded array instead of drawing from the full bank. Confirm the selection function reads the whole 1,273-question set and shuffles.
4. **Shuffle scope.** Check that the shuffle runs per session rather than once at load, and that the "continue learning" (המשך למידה) screen randomizes too — it has been missed there before.

Only after all four come back clean should you look elsewhere.

### Symptom: Hebrew TTS mispronounces words

TTS is three-tier, in this order: pre-recorded static MP3s → an external TTS API → the device's built-in `SpeechSynthesis`. When pronunciation is wrong, first establish *which tier actually spoke*, because the fix is completely different in each. Device `SpeechSynthesis` Hebrew voice quality varies by phone and often cannot be fixed in code — in that case the answer is usually a static MP3 override for that specific string, not more code.

## Known gotchas

- **The category "B" letter.** In the source spreadsheet the licence category is sometimes a Cyrillic "В" (U+0412) rather than a Latin "B" (U+0042). They render identically and compare as unequal. When a filter silently returns zero questions, check this first.
- **Hebrew string comparison.** Watch for trailing whitespace and final-form letters (ם ן ץ ף ך) when matching answer text.
- **RTL and numbers.** Mixed Hebrew text with Latin digits or English terms reorders unexpectedly; test visually rather than trusting the string.

## Working style

- One change at a time, verified before moving on.
- Give exact steps: which file, which line, what to replace. Not "you could refactor the selection logic."
- When something is broken, read the actual code before theorizing about the cause.
- Prefer the smallest change that fixes the problem over a rewrite.

## Open items

- Hebrew TTS pronunciation still imperfect.
- Rename the app to "למידה חכמה".
- Lazy-loading for the ~415 images.
- Verify randomization on the "continue learning" screen.
