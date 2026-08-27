/* =====================================================================
   DriveWise · תרגום מאגר השאלות
   כלי פיתוח. אפס תלויות npm. דורש gcloud מותקן ומאומת.

   עד היום היה מאגר אחד, questions.he.json, והאפליקציה ניסתה לטעון
   questions.<שפה>.json לפי שפת הממשק. כל שפה שאינה עברית קיבלה 404
   ונפלה לשש שאלות הדגמה מובנות. v89 תיקן את הנפילה — היא מגישה
   עכשיו את המאגר העברי — וזה הכלי שמייתר אותה.

   למה ג'מיני ולא תרגום מכונה: שאלת תאוריה אינה משפט. "תן זכות
   קדימה" אינו "give right of way" בהקשר של תמרור, ותשובה שגויה
   שתורגמה נכון-לשונית ושגוי-משפטית מלמדת חוק שאינו קיים. המודל
   מקבל את ההקשר במפורש, ואת ארבע התשובות יחד — כדי שההבחנה ביניהן
   תישמר גם בשפה השנייה.

   שלוש הגנות שחשובות יותר מהתרגום עצמו:

   1. סדר התשובות נשמר. c הוא אינדקס, ותשובה שהתחלפה במקומה הופכת
      את השאלה לשגויה בלי שאיש ישים לב.
   2. כל מזהה חייב לחזור. אצווה שחזרה חסרה נזרקת ומורצת מחדש.
   3. הפלט נבדק מול המקור לפני הכתיבה — אותו מספר פריטים, אותם
      מזהים, אותו מספר אפשרויות בכל שאלה.

     node tools/translate-bank.js en
     node tools/translate-bank.js en ar ru
     node tools/translate-bank.js --model gemini-2.5-flash en

   הרצה חוזרת מדלגת על מה שכבר תורגם, אלא אם הועבר --force.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DATA = path.join(__dirname, '..', 'data');

const LANG_NAME = {
  ar: 'Arabic',
  en: 'English',
  ru: 'Russian'
};

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const mi = argv.indexOf('--model');
const MODEL = mi >= 0 ? argv[mi + 1] : 'gemini-2.5-pro';
const LOC = 'global';
const BATCH = 25;
const WORKERS = 3;

const langs = argv.filter(a => LANG_NAME[a]);
if (!langs.length) {
  console.error('צריך לפחות שפה אחת: ' + Object.keys(LANG_NAME).join(' / '));
  process.exit(1);
}

/* ---------------- gcloud ---------------- */

function gcloud(args) {
  const r = spawnSync('gcloud ' + args.join(' '), { encoding: 'utf8', shell: true });
  if (r.error || r.status !== 0) {
    const msg = ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 300);
    throw new Error('gcloud ' + args.join(' ') + ' נכשל.\n  ' + (msg || 'לא נמצא ב-PATH'));
  }
  return (r.stdout || '').trim();
}

/* הטוקן חי כשעה. ריצה מלאה ארוכה מזה, ולכן הוא מרוענן לפי שעון
   ולא לפי כישלון — 401 באמצע אצווה עולה יותר מרענון מיותר. */
let tok = null, tokAt = 0;
function token() {
  if (!tok || Date.now() - tokAt > 30 * 60 * 1000) {
    tok = gcloud(['auth', 'print-access-token']);
    tokAt = Date.now();
  }
  return tok;
}

const PROJECT = process.env.VERTEX_PROJECT || gcloud(['config', 'get-value', 'project']);
if (!PROJECT || PROJECT === '(unset)') {
  console.error('לא הוגדר פרויקט. הרץ:  gcloud config set project <PROJECT_ID>');
  process.exit(1);
}

const URL = 'https://aiplatform.googleapis.com/v1/projects/' + PROJECT +
            '/locations/' + LOC + '/publishers/google/models/' + MODEL + ':generateContent';

/* ---------------- הבקשה ---------------- */

const SYSTEM = (lang) => `You are translating a driving-theory question bank used by learner drivers in Israel who are studying for the official Ministry of Transport theory exam.

Translate from Hebrew into ${lang}.

Rules that matter more than fluency:
- Preserve the LEGAL meaning exactly. These describe real traffic law. Never soften, generalise, or "improve" a rule.
- Keep every answer option DISTINCT. The options are deliberately similar; if two of them collapse into the same sentence in ${lang}, the question becomes unanswerable. Preserve the distinction even at the cost of a clumsier sentence.
- Keep the ORDER of the options exactly as given. Never reorder, add, or drop an option.
- Road sign names, road markings and vehicle parts use the standard ${lang} terms a driving instructor would use.
- Keep the register plain and short. The readers struggle with dense text; that is why this app exists.
- Numbers, distances and speeds stay exactly as they are.
- Do not add explanations, notes, or anything not present in the source.
- NEVER leave a Hebrew word in the output, and never write the Hebrew term in brackets alongside your translation. Use the ${lang} term only. The one exception is an Israeli road-sign designation such as 127פ or ס-31, which is an identifier and stays exactly as written.
- Never mix scripts inside a single word.
- A question stays a question. Do not turn it into a statement or answer it.

Reply with JSON only.`;

function userPrompt(items) {
  return 'Translate each item. Return a JSON array with the same length and the same ids, ' +
         'each item as {"id": string, "q": string, "o": string[]}. ' +
         'The "o" array must have exactly the same number of entries, in the same order.\n\n' +
         JSON.stringify(items, null, 1);
}

function hintPrompt(items) {
  return 'These are hints and praise lines shown to a learner. Translate each. ' +
         'Return a JSON array with the same length and the same ids, each item as ' +
         '{"id": string, "h1": string, "h2": string, "p": string}. ' +
         'Keep any field that is absent in the source absent in the output.\n\n' +
         JSON.stringify(items, null, 1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ask(system, user, tries = 5) {
  let wait = 2000;
  for (let attempt = 1; attempt <= tries; attempt++) {
    let r, body;
    try {
      r = await fetch(URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        })
      });
      body = await r.json();
    } catch (e) {
      if (attempt === tries) throw e;
      await sleep(wait); wait *= 2; continue;
    }

    /* 401 = הטוקן פג באמצע ריצה ארוכה. 429/5xx = עומס. שניהם חולפים. */
    if (r.status === 401) { tok = null; await sleep(1000); continue; }
    if (r.status === 429 || r.status >= 500) {
      if (attempt === tries) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(body).slice(0, 200));
      await sleep(wait); wait *= 2; continue;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(body).slice(0, 300));

    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      if (attempt === tries) throw new Error('תשובה ריקה: ' + JSON.stringify(body).slice(0, 200));
      await sleep(wait); continue;
    }
    try { return JSON.parse(text); }
    catch (e) {
      if (attempt === tries) throw new Error('JSON לא תקין: ' + text.slice(0, 200));
      await sleep(wait);
    }
  }
}

/* ---------------- אצוות ---------------- */

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/* מריץ אצוות במקביל מוגבל. כישלון של אצווה אחת אינו מפיל את השאר —
   הוא נרשם, והריצה ממשיכה, כדי שלא יאבד מה שכבר תורגם. */
async function runBatches(batches, fn, label) {
  const results = new Array(batches.length);
  const failed = [];
  let next = 0, done = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= batches.length) return;
      try {
        results[i] = await fn(batches[i]);
      } catch (e) {
        failed.push({ i, msg: e.message.slice(0, 120) });
        results[i] = [];
      }
      done++;
      process.stdout.write('\r  ' + label + ': ' + done + '/' + batches.length +
                           (failed.length ? '  (' + failed.length + ' נכשלו)' : '') + '   ');
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, batches.length) }, worker));
  process.stdout.write('\n');
  return { results, failed };
}

/* ---------------- אימות ---------------- */

function checkQuestions(src, out) {
  const problems = [];
  if (src.length !== out.length) problems.push('מספר שאלות: ' + out.length + ' מול ' + src.length);
  const byId = new Map(out.map(x => [x.id, x]));
  for (const q of src) {
    const t = byId.get(q.id);
    if (!t) { problems.push(q.id + ': חסר'); continue; }
    if (!t.q || typeof t.q !== 'string') problems.push(q.id + ': אין טקסט שאלה');
    if (!Array.isArray(t.o) || t.o.length !== q.o.length)
      problems.push(q.id + ': ' + (t.o ? t.o.length : 0) + ' תשובות מול ' + q.o.length);
    else if (new Set(t.o.map(x => String(x).trim())).size !== t.o.length)
      problems.push(q.id + ': שתי תשובות זהות אחרי התרגום');
  }
  return problems;
}

/* ---------------- ריצה ---------------- */

async function translateLang(lang) {
  const name = LANG_NAME[lang];
  const qFile = path.join(DATA, 'questions.' + lang + '.json');
  const hFile = path.join(DATA, 'hints.' + lang + '.json');

  if (!FORCE && fs.existsSync(qFile)) {
    console.log('\n' + name + ': כבר קיים. --force כדי לתרגם מחדש.');
    return;
  }

  const src = JSON.parse(fs.readFileSync(path.join(DATA, 'questions.he.json'), 'utf8'));
  const hints = JSON.parse(fs.readFileSync(path.join(DATA, 'hints.he.json'), 'utf8'));

  console.log('\n' + name + '  ·  ' + src.length + ' שאלות, ' +
              Object.keys(hints).length + ' רמזים  ·  ' + MODEL);

  /* --- שאלות --- */
  const qBatches = chunk(src.map(q => ({ id: q.id, q: q.q, o: q.o })), BATCH);
  const qRun = await runBatches(qBatches,
    b => ask(SYSTEM(name), userPrompt(b)), 'שאלות');

  let translated = qRun.results.flat().filter(Boolean);

  /* אצווה שנכשלה או חזרה חסרה — ניסיון שני, פריט-פריט אינו נחוץ,
     די באצווה קטנה יותר. */
  const have = new Set(translated.map(x => x.id));
  const missing = src.filter(q => !have.has(q.id));
  if (missing.length) {
    console.log('  ' + missing.length + ' שאלות חסרות — סבב שני');
    const retry = await runBatches(
      chunk(missing.map(q => ({ id: q.id, q: q.q, o: q.o })), 8),
      b => ask(SYSTEM(name), userPrompt(b)), 'סבב שני');
    translated = translated.concat(retry.results.flat().filter(Boolean));
  }

  const problems = checkQuestions(src, translated);
  if (problems.length) {
    console.log('\n  ✗ ' + problems.length + ' בעיות. לא נכתב קובץ.');
    problems.slice(0, 12).forEach(p => console.log('      ' + p));
    if (problems.length > 12) console.log('      ... ועוד ' + (problems.length - 12));
    return;
  }

  /* נכתב בסדר המקורי ועם כל שאר השדות — התרגום נוגע ב-q ו-o בלבד */
  const byId = new Map(translated.map(x => [x.id, x]));
  const outQ = src.map(q => Object.assign({}, q, {
    q: byId.get(q.id).q,
    o: byId.get(q.id).o
  }));
  fs.writeFileSync(qFile, JSON.stringify(outQ), 'utf8');
  console.log('  ✓ ' + path.basename(qFile) + '  (' + outQ.length + ')');

  /* --- רמזים --- */
  const hArr = Object.entries(hints).map(([id, v]) => Object.assign({ id }, v));
  const hRun = await runBatches(chunk(hArr, BATCH),
    b => ask(SYSTEM(name), hintPrompt(b)), 'רמזים');

  const hOut = {};
  for (const item of hRun.results.flat().filter(Boolean)) {
    if (!item || !item.id || !hints[item.id]) continue;
    const o = {};
    for (const k of ['h1', 'h2', 'p']) if (hints[item.id][k] && item[k]) o[k] = item[k];
    if (Object.keys(o).length) hOut[item.id] = o;
  }

  const missH = Object.keys(hints).length - Object.keys(hOut).length;
  fs.writeFileSync(hFile, JSON.stringify(hOut), 'utf8');
  console.log('  ✓ ' + path.basename(hFile) + '  (' + Object.keys(hOut).length + ')' +
              (missH ? '  — ' + missH + ' חסרים, האפליקציה פשוט לא תציג רמז להם' : ''));
}

(async () => {
  console.log('פרויקט: ' + PROJECT + '  ·  מודל: ' + MODEL);
  const t0 = Date.now();
  for (const l of langs) {
    try { await translateLang(l); }
    catch (e) { console.log('\n' + LANG_NAME[l] + ' נכשל: ' + e.message); }
  }
  console.log('\nסה"כ ' + ((Date.now() - t0) / 60000).toFixed(1) + ' דקות');
})();
