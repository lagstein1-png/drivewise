#!/usr/bin/env node
/* =====================================================================
   DriveWise · ייצור קבצי הקראה
   כלי פיתוח — לא חלק מהאפליקציה ולא נטען אליה. האפליקציה נשארת
   index.html אחד בלי תלויות.

   הרעיון: משלמים פעם אחת, כאן, על המחשב שלך. התוצאה היא קבצי MP3
   רגילים שיושבים ב-audio/ ומוגשים כקבצים סטטיים. בזמן ריצה אין מפתח,
   אין קריאת רשת לספק, אין חשבון חודשי, וזה עובד גם בלי אינטרנט.

   המפתח נקרא ממשתנה סביבה בלבד. הוא לא נכתב לשום קובץ ולא נכנס ל-repo.

     תכנון ועלויות (בלי מפתח):
       node tools/tts-build.js plan
     דגימות להשוואה:
       TTS_KEY=xxx node tools/tts-build.js sample --provider gcloud
     ייצור מלא:
       TTS_KEY=xxx node tools/tts-build.js all --provider gcloud --voice he-IL-Chirp3-HD-Kore --yes
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const KEY = process.env.TTS_KEY || '';
const AZURE_REGION = process.env.AZURE_REGION || 'westeurope';

/* משפט מבחן אמיתי מהמאגר: ספרות, מונחי תנועה וסוגריים — בדיוק
   המקומות שבהם מנועי הקראה נשברים */
const SAMPLE_TEXT =
  'ברחוב הרצל סומנו 4 מקומות חנייה רצופים לנכים. ' +
  'לרכב ללא תווית חנייה כבתמרור אסור לחנות בחניית נכים, ' +
  'גם אם המקומות שיועדו לנכים פנויים כולם.';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------------- ספקים ---------------- */
/* כל ספק מחזיר Buffer של MP3, ויודע למנות את הקולות שלו. */
const PROVIDERS = {
  gcloud: {
    price: 30,                    /* דולר למיליון תווים, Chirp 3 HD */
    async voices(lang){
      const r = await fetch('https://texttospeech.googleapis.com/v1/voices?languageCode=' + lang,
                            { headers: { 'x-goog-api-key': KEY } });
      if(!r.ok) throw new Error('gcloud voices ' + r.status + ' ' + await r.text());
      const j = await r.json();
      return (j.voices || []).map(v => ({ id: v.name, gender: v.ssmlGender }));
    },
    async speak(text, lang, voiceId){
      const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: lang, name: voiceId },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 }
        })
      });
      if(!r.ok) throw new Error('gcloud ' + r.status + ' ' + await r.text());
      const j = await r.json();
      return Buffer.from(j.audioContent, 'base64');
    }
  },

  azure: {
    price: 16,
    async voices(lang){
      const url = 'https://' + AZURE_REGION + '.tts.speech.microsoft.com/cognitiveservices/voices/list';
      const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': KEY } });
      if(!r.ok) throw new Error('azure voices ' + r.status + ' ' + await r.text());
      const j = await r.json();
      return j.filter(v => v.Locale === lang).map(v => ({ id: v.ShortName, gender: v.Gender }));
    },
    async speak(text, lang, voiceId){
      const ssml = '<speak version="1.0" xml:lang="' + lang + '">'
                 + '<voice xml:lang="' + lang + '" name="' + voiceId + '">'
                 + esc(text) + '</voice></speak>';
      const url = 'https://' + AZURE_REGION + '.tts.speech.microsoft.com/cognitiveservices/v1';
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
        },
        body: ssml
      });
      if(!r.ok) throw new Error('azure ' + r.status + ' ' + await r.text());
      return Buffer.from(await r.arrayBuffer());
    }
  },

  elevenlabs: {
    price: 150,
    /* eleven_multilingual_v2 אינו תומך בעברית — רק v3. זה הבאג שקיים
       גם ב-index.html, ולכן המסלול הזה מעולם לא עבד בעברית. */
    model: 'eleven_v3',
    async voices(){
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': KEY } });
      if(!r.ok) throw new Error('elevenlabs voices ' + r.status + ' ' + await r.text());
      const j = await r.json();
      return (j.voices || []).map(v => ({ id: v.voice_id, name: v.name, gender: (v.labels || {}).gender }));
    },
    async speak(text, lang, voiceId){
      const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
        method: 'POST',
        headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: PROVIDERS.elevenlabs.model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      });
      if(!r.ok) throw new Error('elevenlabs ' + r.status + ' ' + await r.text());
      return Buffer.from(await r.arrayBuffer());
    }
  }
};

/* ---------------- רשימת המחרוזות להקראה ---------------- */
/* לא מממשים כאן מחדש את מיפוי המזהים. במקום זה שולפים את הפונקציות
   האמיתיות מתוך index.html ומריצים אותן על אותם נתונים שהאפליקציה
   טוענת. כך הרשימה כאן היא בהגדרה בדיוק מה שהאפליקציה מחפשת —
   כולל מחרוזות ממשק שנאמרות בקול, כמו "תשובה 1" — ואי אפשר ששני
   הצדדים ייפרדו בלי שהדבר יישבר מיד וברעש. */
function appBlock(src, decl, open, close){
  const i = src.indexOf(decl);
  if(i < 0) throw new Error('לא נמצא ב-index.html: ' + decl);
  let d = 0;
  for(let k = src.indexOf(open, i); k < src.length; k++){
    if(src[k] === open) d++;
    else if(src[k] === close){ d--; if(!d) return src.slice(i, k + 1); }
  }
  throw new Error('בלוק לא נסגר: ' + decl);
}

function collect(lang){
  const qf = path.join(ROOT, 'data', 'questions.' + lang + '.json');
  if(!fs.existsSync(qf)) throw new Error('אין קובץ שאלות: ' + qf);
  const raw = JSON.parse(fs.readFileSync(qf, 'utf8'));
  const items = Array.isArray(raw) ? raw : (raw.items || Object.values(raw)[0]);

  /* מיזוג הרמזים, בדיוק כפי ש-loadBank עושה */
  const hf = path.join(ROOT, 'data', 'hints.' + lang + '.json');
  if(fs.existsSync(hf)){
    const hints = JSON.parse(fs.readFileSync(hf, 'utf8'));
    for(const q of items){
      const x = hints[q.id];
      if(!x) continue;
      if(x.h1) q.h1 = x.h1;
      if(x.h2) q.h2 = x.h2;
      if(x.p)  q.p  = x.p;
    }
  }

  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\r\n').join('\n');
  const code = [
    appBlock(src, 'const LANGS = {', '{', '}') + ';',
    appBlock(src, 'const UI = {', '{', '}') + ';',
    appBlock(src, 'const PRACTICE = [', '[', ']') + ';',
    appBlock(src, 'function audioId(', '{', '}'),
    appBlock(src, 'function buildAudioMap(', '{', '}')
  ].join('\n\n');

  const ctx = { STATIC: { map: new Map() }, BANK: { items }, S: { lang }, console };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  vm.runInContext('buildAudioMap()', ctx);

  const out = [];
  const seen = new Set();
  let dupes = 0;
  for(const [key, id] of ctx.STATIC.map){
    if(key.slice(0, key.indexOf('|')) !== lang) continue;   /* רק השפה המבוקשת */
    if(seen.has(id)){ dupes++; continue; }
    seen.add(id);
    out.push({ id, text: key.slice(key.indexOf('|') + 1).trim().replace(/\s+/g, ' ') });
  }
  out.dupes = dupes;
  return out;
}

/* ---------------- עזרים ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- ויסות קצב ----------------
   לקולות Chirp3-HD מכסת בקשות נמוכה בהרבה מהרגילים, ובקצב חופשי
   רוב הבקשות חוזרות עם 429. ניסיון חוזר לבדו לא פותר: הוא מגיב אחרי
   הכישלון במקום למנוע אותו, וכל הבקשות ממשיכות להתנגש.
   כאן שומרים מרווח מינימלי בין בקשות: כל 429 מאריך אותו, וכל רצף
   הצלחות מקצר אותו בזהירות. הקצב מתכנס לבד למה שהחשבון באמת מרשה,
   בלי שנצטרך לדעת את המספר מראש. */
const RATE = { gap: 120, min: 60, max: 4000, next: 0, ok: 0 };

async function paced(fn){
  /* תור: כל קורא תופס חלון זמן ומחכה לו */
  const now = Date.now();
  const slot = Math.max(now, RATE.next);
  RATE.next = slot + RATE.gap;
  const wait = slot - now;
  if(wait > 0) await sleep(wait);
  return fn();
}

function rateSlower(){
  RATE.ok = 0;
  RATE.gap = Math.min(RATE.max, Math.round(RATE.gap * 1.5) + 40);
}
function rateFaster(){
  /* מאיצים רק אחרי רצף הצלחות, וביד קלה */
  if(++RATE.ok < 8) return;
  RATE.ok = 0;
  RATE.gap = Math.max(RATE.min, Math.round(RATE.gap * 0.8));
}

async function withRetry(fn, label, tries = 8){
  let last;
  for(let i = 0; i < tries; i++){
    try{
      const r = await paced(fn);
      rateFaster();
      return r;
    }
    catch(e){
      last = e;
      const limited = /429|RESOURCE_EXHAUSTED|exhaust/i.test(e.message);
      const transient = limited || /500|502|503|504|ETIMEDOUT|ECONNRESET|fetch failed/i.test(e.message);
      if(!transient) throw e;            /* שגיאת הגדרה — אין טעם לנסות שוב */
      if(limited) rateSlower();
      await sleep(600 * Math.pow(2, Math.min(i, 4)));
    }
  }
  throw last;
}

/* מריץ במקביל, אבל הקצב בפועל נקבע על ידי RATE ולא על ידי limit */
async function pool(items, limit, worker){
  let i = 0, done = 0;
  const t0 = Date.now();
  const run = async () => {
    while(i < items.length){
      const k = i++;
      await worker(items[k], k);
      done++;
      if(done % 25 === 0 || done === items.length){
        const el = (Date.now() - t0) / 1000;
        const rate = done / Math.max(el, 1);
        const left = rate > 0 ? Math.round((items.length - done) / rate / 60) : 0;
        process.stdout.write('\r  ' + done + '/' + items.length +
          '  ·  ' + rate.toFixed(1) + '/שנייה  ·  מרווח ' + RATE.gap + 'ms' +
          '  ·  נותרו ~' + left + ' דק׳    ');
      }
    }
  };
  await Promise.all(Array.from({ length: limit }, run));
  process.stdout.write('\n');
}

/* ---------------- פקודות ---------------- */
async function cmdSample(prov, lang, outDir){
  const P = PROVIDERS[prov];
  console.log('\nמושך את רשימת הקולות של ' + prov + ' עבור ' + lang + '…');
  const voices = await P.voices(lang);
  if(prov === 'elevenlabs'){
    console.log('  (ב-ElevenLabs הקולות אינם לפי שפה — כולם מנוגנים בעברית דרך v3)');
  }
  if(!voices.length){ console.log('לא נמצאו קולות.'); return; }

  console.log('נמצאו ' + voices.length + ' קולות. מייצר דגימה לכל אחד.');
  fs.mkdirSync(outDir, { recursive: true });

  const made = [];
  await pool(voices, 3, async (v) => {
    const safe = String(v.id).replace(/[^\w.-]/g, '_');
    try{
      const buf = await withRetry(() => P.speak(SAMPLE_TEXT, lang, v.id), v.id);
      fs.writeFileSync(path.join(outDir, safe + '.mp3'), buf);
      made.push({ name: v.name, id: v.id, gender: v.gender, file: safe + '.mp3' });
    }catch(e){
      console.warn('\n  ✗ ' + v.id + ': ' + e.message.slice(0, 120));
    }
  });

  writeCompare(outDir, prov, made);
  const chars = SAMPLE_TEXT.length * made.length;
  console.log('\n✓ ' + made.length + ' דגימות ב-' + outDir);
  console.log('  ' + chars.toLocaleString() + ' תווים · כ-$' + (chars / 1e6 * P.price).toFixed(4));
  console.log('  פתח: ' + path.join(outDir, 'compare.html'));
}

function writeCompare(dir, prov, voices){
  const rows = voices.map(v =>
    '    <tr><td class="n">' + esc(v.name || v.id) + '</td>' +
    '<td class="g">' + esc(v.gender || '') + '</td>' +
    '<td><audio controls preload="none" src="' + esc(v.file) + '"></audio></td></tr>'
  ).join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="he" dir="rtl"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>השוואת קולות · ' + esc(prov) + '</title>',
    '<style>',
    '  body{font-family:system-ui,"Segoe UI",Arial,sans-serif;margin:0;padding:24px;',
    '       background:#E7EDF4;color:#0E1F33;line-height:1.6}',
    '  h1{font-size:22px;margin:0 0 12px}',
    '  p.t{background:#fff;border:3px solid #D9A400;border-radius:14px;padding:14px 16px;',
    '      font-size:18px;font-weight:600;margin:0 0 20px}',
    '  table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}',
    '  td{padding:10px 12px;border-bottom:1px solid #C4D1DE;vertical-align:middle}',
    '  td.n{font-weight:700;direction:ltr;text-align:right;white-space:nowrap}',
    '  td.g{color:#5A6B7E;font-size:14px}',
    '  audio{width:100%;min-width:240px}',
    '</style></head><body>',
    '<h1>השוואת קולות — ' + esc(prov) + '</h1>',
    '<p class="t">' + esc(SAMPLE_TEXT) + '</p>',
    '<table>',
    rows,
    '</table>',
    '</body></html>'
  ].join('\n');

  fs.writeFileSync(path.join(dir, 'compare.html'), html, 'utf8');
}

/* השוואה זו-מול-זו על תוכן אמיתי. משפט בודד לא מספיק כדי לבחור קול
   שישמיעו אלפי פעמים — כאן שומעים את אותן שאלות מהמאגר בכל הקולות
   המועמדים, שורה מול שורה. */
async function cmdTry(prov, lang, voicesArg, count, confirmed){
  if(!voicesArg) throw new Error('חסר --voices (רשימה מופרדת בפסיקים)');
  const P = PROVIDERS[prov];
  const langCode = lang === 'he' ? 'he-IL' : lang;
  const voices = voicesArg.split(',').map(v => v.trim()).filter(Boolean);

  /* בוחרים משפטים באורך סביר, בפיזור אחיד על פני המאגר */
  const all = collect(lang).filter(x => x.text.length >= 45 && x.text.length <= 170);
  const step = Math.max(1, Math.floor(all.length / count));
  const picks = [];
  for(let i = 0; i < all.length && picks.length < count; i += step) picks.push(all[i]);

  const outDir = path.join(ROOT, 'tools', 'samples', 'try');
  const chars = picks.reduce((s, x) => s + x.text.length, 0) * voices.length;

  console.log('\nקולות: ' + voices.length + ' · משפטים: ' + picks.length +
              ' · קבצים: ' + (voices.length * picks.length));
  console.log('תווים: ' + chars.toLocaleString() +
              ' · עלות: $' + (chars / 1e6 * P.price).toFixed(3));
  if(!confirmed){ console.log('\nלביצוע הוסף --yes'); return; }

  const jobs = [];
  for(const v of voices){
    const safe = v.replace(/[^\w.-]/g, '_');
    fs.mkdirSync(path.join(outDir, safe), { recursive: true });
    for(const p of picks) jobs.push({ voice: v, safe, item: p });
  }

  let failed = 0;
  await pool(jobs, 4, async (j) => {
    const file = path.join(outDir, j.safe, j.item.id + '.mp3');
    if(fs.existsSync(file)) return;
    try{
      const buf = await withRetry(() => P.speak(j.item.text, langCode, j.voice), j.voice);
      fs.writeFileSync(file, buf);
    }catch(e){
      failed++;
      console.warn('\n  ✗ ' + j.voice + ': ' + e.message.slice(0, 100));
    }
  });

  writeTryPage(outDir, voices, picks);
  console.log('\n✓ מוכן' + (failed ? ' · ' + failed + ' כשלונות' : ''));
  console.log('  פתח: ' + path.join(outDir, 'compare.html'));
}

function writeTryPage(dir, voices, picks){
  const shortName = v => v.replace('he-IL-', '').replace('Chirp3-HD-', '');
  const head = voices.map(v => '<th dir="ltr">' + esc(shortName(v)) + '</th>').join('');
  const rows = picks.map(p => {
    const cells = voices.map(v =>
      '<td><audio controls preload="none" src="' +
      esc(v.replace(/[^\w.-]/g, '_') + '/' + p.id + '.mp3') + '"></audio></td>'
    ).join('');
    return '  <tr><td class="s">' + esc(p.text) + '</td>' + cells + '</tr>';
  }).join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="he" dir="rtl"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>השוואה על תוכן אמיתי · DriveWise</title>',
    '<style>',
    '  body{font-family:system-ui,"Segoe UI",Arial,sans-serif;margin:0;padding:24px 16px 60px;',
    '       background:#E7EDF4;color:#0E1F33;line-height:1.6}',
    '  h1{font-size:25px;margin:0 0 6px}',
    '  p.lead{margin:0 0 20px;color:#5A6B7E}',
    '  .wrap{overflow-x:auto;background:#fff;border-radius:14px;border:2px solid #C4D1DE}',
    '  table{border-collapse:collapse;width:100%;min-width:720px}',
    '  th{position:sticky;top:0;background:#0E1F33;color:#fff;font-size:15px;',
    '     padding:10px 12px;white-space:nowrap}',
    '  th:first-child{text-align:right}',
    '  td{padding:10px 12px;border-bottom:1px solid #E7EDF4;vertical-align:middle}',
    '  td.s{font-size:17px;font-weight:600;min-width:300px;max-width:460px}',
    '  tr:nth-child(even){background:#F7FAFD}',
    '  audio{width:190px;height:36px}',
    '</style></head><body>',
    '<h1>אותן שאלות, בכל קול</h1>',
    '<p class="lead">כל שורה היא משפט אמיתי מהמאגר. השווה לרוחב השורה.</p>',
    '<div class="wrap"><table>',
    '  <tr><th>המשפט</th>' + head + '</tr>',
    rows,
    '</table></div>',
    '</body></html>'
  ].join('\n');

  fs.writeFileSync(path.join(dir, 'compare.html'), html, 'utf8');
}

async function cmdAll(prov, lang, voiceId, folder, confirmed){
  if(!voiceId) throw new Error('חסר --voice');
  if(!folder) throw new Error('חסר --as (שם התיקייה שהאפליקציה תחפש)');
  if(!/^[a-z0-9_-]+$/.test(folder)) throw new Error('--as: אותיות קטנות, ספרות ומקף בלבד');
  const P = PROVIDERS[prov];
  const langCode = lang === 'he' ? 'he-IL' : lang;
  const list = collect(lang);
  /* כל קול בתיקייה משלו, כדי שהאפליקציה תוכל להחליף ביניהם */
  const outDir = path.join(ROOT, 'audio', lang, folder);
  fs.mkdirSync(outDir, { recursive: true });

  const todo = list.filter(x => !fs.existsSync(path.join(outDir, x.id + '.mp3')));
  const chars = todo.reduce((s, x) => s + x.text.length, 0);

  console.log('\nשפה: ' + lang + ' · ספק: ' + prov + ' · קול: ' + voiceId +
              ' · תיקייה: audio/' + lang + '/' + folder);
  console.log('סה"כ מחרוזות: ' + list.length.toLocaleString() + ' · חסרות: ' + todo.length.toLocaleString());
  console.log('תווים לייצור: ' + chars.toLocaleString() +
              ' · הערכת עלות: $' + (chars / 1e6 * P.price).toFixed(2));
  if(!todo.length){ console.log('הכול כבר קיים.'); return; }
  if(!confirmed){ console.log('\nלביצוע בפועל הוסף --yes'); return; }

  let bytes = 0, failed = 0;
  await pool(todo, 4, async (item) => {
    try{
      const buf = await withRetry(() => P.speak(item.text, langCode, voiceId), item.id);
      fs.writeFileSync(path.join(outDir, item.id + '.mp3'), buf);
      bytes += buf.length;
    }catch(e){
      failed++;
      console.warn('\n  ✗ ' + item.id + ': ' + e.message.slice(0, 120));
    }
  });

  console.log('\n✓ נוצרו ' + (todo.length - failed).toLocaleString() + ' קבצים · ' +
              (bytes / 1048576).toFixed(1) + 'MB' + (failed ? ' · ' + failed + ' כשלונות' : ''));
  console.log('  הרצה חוזרת תשלים רק את מה שחסר.');
}

/* בודק מה באמת יצא: כמה קבצים חסרים, וכמה מהם קטנים מדי מכדי להכיל
   דיבור. קובץ באורך אפס נוצר כשהספק החזיר תשובה ריקה, והוא מסוכן
   יותר מקובץ חסר — האפליקציה תמצא אותו, תנגן שקט, ולא תיפול לקול
   המכשיר. */
function cmdVerify(lang){
  const list = collect(lang);
  const base = path.join(ROOT, 'audio', lang);
  if(!fs.existsSync(base)){ console.log('\nאין תיקיית audio/' + lang + ' — עוד לא יוצר כלום.'); return; }

  const folders = fs.readdirSync(base, { withFileTypes: true })
                    .filter(d => d.isDirectory()).map(d => d.name);
  if(!folders.length){ console.log('\nאין תיקיות קול תחת audio/' + lang); return; }

  console.log('\nשפה: ' + lang + ' · מצופה בכל קול: ' + list.length.toLocaleString() + ' קבצים\n');
  let problems = 0;

  for(const f of folders){
    const dir = path.join(base, f);
    let have = 0, bytes = 0;
    const tiny = [], missing = [];
    for(const item of list){
      const p = path.join(dir, item.id + '.mp3');
      if(!fs.existsSync(p)){ missing.push(item); continue; }
      const sz = fs.statSync(p).size;
      bytes += sz; have++;
      if(sz < 800) tiny.push({ id: item.id, size: sz });
    }
    const extra = fs.readdirSync(dir).filter(x => x.endsWith('.mp3')).length - have;
    const ok = !missing.length && !tiny.length;
    if(!ok) problems++;

    console.log((ok ? '✓ ' : '✗ ') + f);
    console.log('    קיימים: ' + have.toLocaleString() + '/' + list.length.toLocaleString() +
                '  ·  ' + (bytes / 1048576).toFixed(0) + 'MB' +
                (extra > 0 ? '  ·  ' + extra + ' עודפים' : ''));
    if(missing.length){
      console.log('    חסרים: ' + missing.length.toLocaleString() +
                  '  →  ' + missing.slice(0, 3).map(x => x.text.slice(0, 26)).join(' | '));
    }
    if(tiny.length){
      console.log('    ריקים או זעירים: ' + tiny.length +
                  '  →  ' + tiny.slice(0, 3).map(x => x.id + ' (' + x.size + 'B)').join(' | '));
    }
  }

  console.log('');
  console.log(problems ? 'הרצה חוזרת של הייצור תשלים את החסר. קבצים זעירים צריך למחוק ידנית.'
                       : 'הכול שלם.');
}

function cmdPlan(lang){
  const list = collect(lang);
  const chars = list.reduce((s, x) => s + x.text.length, 0);
  console.log('\nשפה: ' + lang);
  console.log('מחרוזות ייחודיות: ' + list.length.toLocaleString() +
              (list.dupes ? '  (' + list.dupes.toLocaleString() + ' כפילויות אוחדו)' : ''));
  console.log('תווים:            ' + chars.toLocaleString());
  console.log('\nעלות ייצור חד-פעמית (לפני המכסה החינמית):');
  for(const [n, p] of Object.entries(PROVIDERS)){
    console.log('  ' + n.padEnd(12) + '$' + (chars / 1e6 * p.price).toFixed(2));
  }
  console.log('\nהערכת גודל על הדיסק: ~' + Math.round(list.length * 12 / 1024) + 'MB (48kbps mono)');
}

/* ---------------- כניסה ---------------- */
(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const arg = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : d; };
  const prov = arg('provider', 'gcloud');
  const lang = arg('lang', 'he');

  if(cmd === 'plan') return cmdPlan(lang);
  if(cmd === 'verify') return cmdVerify(lang);

  if(!PROVIDERS[prov]) throw new Error('ספק לא מוכר: ' + prov);
  /* הצגת עלות בלבד אינה נוגעת ברשת, ולכן אינה דורשת מפתח. */
  const dryRun = (cmd === 'try' || cmd === 'all') && !argv.includes('--yes');
  if(!KEY && !dryRun) throw new Error('חסר TTS_KEY בסביבה.  TTS_KEY=xxx node tools/tts-build.js …');

  const langCode = lang === 'he' ? 'he-IL' : lang;
  if(cmd === 'sample'){
    return cmdSample(prov, langCode, arg('out', path.join(ROOT, 'tools', 'samples', prov)));
  }
  if(cmd === 'try'){
    return cmdTry(prov, lang, arg('voices'), +(arg('count', 12)), argv.includes('--yes'));
  }
  if(cmd === 'all'){
    return cmdAll(prov, lang, arg('voice'), arg('as'), argv.includes('--yes'));
  }

  console.log([
    'שימוש:',
    '  node tools/tts-build.js plan   [--lang he]',
    '  node tools/tts-build.js verify [--lang he]',
    '  TTS_KEY=xxx node tools/tts-build.js sample --provider gcloud|azure|elevenlabs',
    '  TTS_KEY=xxx node tools/tts-build.js all --provider gcloud --voice <id> --as <folder> --yes'
  ].join('\n'));
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
