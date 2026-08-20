/* =====================================================================
   DriveWise · רשימת המחרוזות להקראה
   כלי פיתוח. אפס תלויות.

   לא מממשים כאן מחדש את מיפוי המזהים. במקום זה שולפים את הפונקציות
   האמיתיות מתוך index.html ומריצים אותן על אותם נתונים שהאפליקציה
   טוענת. כך הרשימה היא בהגדרה בדיוק מה שהאפליקציה מחפשת — כולל
   מחרוזות ממשק שנאמרות בקול, כמו "תשובה שתיים" — ואי אפשר ששני
   הצדדים ייפרדו בשקט.

   המזהה הוא גיבוב של הטקסט המוצג. הוא לא מושפע מחוקי ההגייה, וזה
   בכוונה: תיקון הגייה משנה את תוכן הקובץ, לא את שמו.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* שולף בלוק שמתחיל בהצהרה ונסגר בסוגר המאזן שלה */
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
    appBlock(src, 'const HE_NUM = [', '[', ']') + ';',
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
    if(key.slice(0, key.indexOf('|')) !== lang) continue;
    if(seen.has(id)){ dupes++; continue; }
    seen.add(id);
    out.push({ id, text: key.slice(key.indexOf('|') + 1).trim().replace(/\s+/g, ' ') });
  }
  out.dupes = dupes;
  return out;
}

module.exports = { collect, appBlock, ROOT };
