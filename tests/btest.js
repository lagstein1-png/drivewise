/* =====================================================================
   DriveWise · שלמות מאגרי השפות

   עד v89 היה מאגר אחד בעברית, והאפליקציה ניסתה לטעון
   questions.<שפה>.json לפי שפת הממשק. הקבצים לא היו קיימים, כל שפה
   שאינה עברית קיבלה 404, ונפלה לשש שאלות דגמה — בשקט, במשך חודשים.

   מרגע שיש ארבעה מאגרים, הסכנה מתהפכת: לא היעדר קובץ אלא קובץ
   שנראה תקין ואינו. שאלה שאיבדה תשובה, תשובות שהתמזגו לאותו משפט
   אחרי תרגום, או פסקה שנשארה בעברית — כל אחת מהן שוברת שאלה בלי
   להפיל שום דבר.

   מה שנבדק כאן לכל שפה מול העברית:
     · אותו מספר שאלות, אותם מזהים, באותו סדר
     · c ו-cat ו-img זהים — התרגום נוגע ב-q ו-o בלבד
     · אותו מספר תשובות בכל שאלה
     · אין תשובות זהות באותה שאלה
     · אין שדה ריק
     · אין עברית שנשארה בקובץ שאינו עברי

   שפה שאין לה קובץ מדולגת ואינה נכשלת — האפליקציה נופלת אז למאגר
   העברי, וזו התנהגות מכוונת.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const HE = /[֐-׿]/;

/* מספרי תמרורים ישראליים נושאים אות עברית כחלק מהסימון הרשמי —
   127פ, ס-31. הם מזהים ולא טקסט, ונשארים כמות שהם בכל שפה.
   בלי החרגה כזו הבדיקה מסמנת תרגום תקין כשריד. */
const SIGN_CODE = /[0-9]+[א-ת]|[א-ת]-?[0-9]+/g;
const hasHebrew = (t) => HE.test(String(t).replace(SIGN_CODE, ''));

let fails = 0;
const bad = (msg) => { fails++; console.log('  ✗ ' + msg); };

function load(name) {
  const p = path.join(DATA, name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { bad(name + ': JSON פגום — ' + e.message.slice(0, 80)); return undefined; }
}

const src = load('questions.he.json');
if (!Array.isArray(src)) {
  console.log('✗ questions.he.json חסר או פגום — אין מול מה להשוות');
  process.exit(1);
}
const srcHints = load('hints.he.json') || {};

console.log('\nמאגר המקור: ' + src.length + ' שאלות, ' +
            Object.keys(srcHints).length + ' רמזים\n');

for (const lang of ['ar', 'en', 'ru']) {
  const q = load('questions.' + lang + '.json');
  if (q === null) { console.log('  · ' + lang + ': אין קובץ — נופל לעברית, תקין'); continue; }
  if (q === undefined) continue;

  const before = fails;

  if (!Array.isArray(q)) { bad(lang + ': הקובץ אינו מערך'); continue; }
  if (q.length !== src.length) bad(lang + ': ' + q.length + ' שאלות מול ' + src.length);

  const n = Math.min(q.length, src.length);
  let hebrewLeft = 0;

  for (let i = 0; i < n; i++) {
    const a = src[i], b = q[i];
    const where = lang + ' ' + (b && b.id ? b.id : '#' + i);

    if (!b || b.id !== a.id) { bad(where + ': מזהה לא תואם (' + a.id + ')'); continue; }

    /* התרגום נוגע ב-q ו-o. כל השאר חייב לעבור כמות שהוא — c הוא
       אינדקס התשובה הנכונה, ושינוי שלו הופך את השאלה לשקר. */
    if (b.c !== a.c)     bad(where + ': c=' + b.c + ' מול ' + a.c);
    if (b.cat !== a.cat) bad(where + ': קטגוריה שונה');
    if ((b.img || '') !== (a.img || '')) bad(where + ': תמונה שונה');

    if (typeof b.q !== 'string' || !b.q.trim()) bad(where + ': שאלה ריקה');
    if (!Array.isArray(b.o)) { bad(where + ': אין תשובות'); continue; }
    if (b.o.length !== a.o.length) bad(where + ': ' + b.o.length + ' תשובות מול ' + a.o.length);

    if (b.o.some(o => typeof o !== 'string' || !o.trim())) bad(where + ': תשובה ריקה');

    /* שתי תשובות שהתמזגו לאותו משפט הופכות שאלה לבלתי פתירה */
    const seen = new Set(b.o.map(o => String(o).trim()));
    if (seen.size !== b.o.length) bad(where + ': שתי תשובות זהות');

    /* עברית שנשארה = פריט שלא תורגם. מספרים ותמרורים עשויים להכיל
       תווים לטיניים, אבל אות עברית בקובץ רוסי היא תמיד שריד. */
    if (hasHebrew(b.q) || b.o.some(o => hasHebrew(o))) hebrewLeft++;
  }

  if (hebrewLeft) bad(lang + ': ' + hebrewLeft + ' שאלות עם עברית שנשארה');

  /* רמזים — חלקיים בכוונה. נבדק רק שאין המצאה: מזהה שאין לו רמז
     בעברית ויש לו בשפה אחרת הוא סימן שהמודל ייצר תוכן משלו. */
  const h = load('hints.' + lang + '.json');
  if (h && typeof h === 'object') {
    const extra = Object.keys(h).filter(k => !srcHints[k]);
    if (extra.length) bad(lang + ': ' + extra.length + ' רמזים למזהים שאין להם רמז בעברית');
    const emptyH = Object.entries(h).filter(([, v]) =>
      !v || Object.values(v).some(x => typeof x !== 'string' || !x.trim()));
    if (emptyH.length) bad(lang + ': ' + emptyH.length + ' רמזים ריקים');
  }

  if (fails === before) {
    console.log('  ✓ ' + lang + ': ' + q.length + ' שאלות תואמות' +
                (h ? ', ' + Object.keys(h).length + ' רמזים' : ''));
  }
}

console.log('');
if (fails) { console.log(fails + ' בעיות'); process.exit(1); }
console.log('כל מאגרי השפות תואמים למקור');
