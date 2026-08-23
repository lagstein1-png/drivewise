/* =====================================================================
   טבלת הניקוד המלא — האילוצים שמחזיקים אותה
   אפס תלויות.

   מאז שדיקטה מנקדת את המאגר, ההקראה כבר לא נשענת על טבלת חוקים
   קטנה אלא על קובץ שנבנה מראש. הקובץ הזה מחליף את הטקסט שנשלח
   למנוע — ולכן שלוש טעויות אפשריות בו יקרות:

     1. אם הניקוד שינה מילה, המשתמש ישמע משהו אחר ממה שכתוב.
     2. אם הוא שינה את חלוקת המילים, ההדגשה תצביע על המילה הלא
        נכונה לאורך כל המשפט.
     3. אם מחרוזת מספרים דלפה לטבלה, מספר תמרור יחזור להיקרא
        כמות ולא ספרה-ספרה.

   הבדיקה כאן חוסמת את שלושתן על כל המאגר, לא על מדגם.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const B = require('../tools/bank');
const { applyNumbers } = require('../tools/number-rules');
const { applyContext } = require('../tools/context-rules');
const { applyWords }   = require('../tools/word-rules');
const { applyKtiv }    = require('../tools/ktiv');

const NIQ   = /[֑-ׇ]/g;
const HAS    = /[֑-ׇ]/;
const SPLIT = /([^\p{L}\p{N}\p{M}]+)/u;
const bare   = s => String(s).replace(NIQ, '');

let pass = 0, fail = 0;
function ok(name, cond, detail){
  if(cond){ pass++; console.log('      ✓ ' + name); }
  else { fail++; console.log('      ✗ ' + name + (detail ? '\n            ' + detail : '')); }
}

/* הטבלה אינה חלק קבוע מהאפליקציה. כיוון הניקוד המלא נוסה, נשמע רע
   באוזן, והוחזר לאחור — הקובץ אינו קיים כרגע. הבדיקות כאן נשארות
   שלמות ליום שבו נחזור לזה, ועד אז מדלגות בשקט במקום להיכשל. */
const VOC_PATH = path.join(ROOT, 'data', 'speech-he.json');
if(!fs.existsSync(VOC_PATH)){
  console.log('      · אין טבלת ניקוד — מדלג');
  process.exit(0);
}
const VOC = JSON.parse(fs.readFileSync(VOC_PATH, 'utf8'));
const keys = Object.keys(VOC);

/* ------------------------------------------------------------------ */
/* 1. האילוץ:  raw === stripNikud(pointed)                            */
/*    בלי סייגים ובלי יוצאים מן הכלל. ניקוד מוסיף סימנים, לעולם לא
      מחליף אותיות. חוק שמאיית מחדש — גם חוק שלנו — נדחה בזמן הבנייה,
      כי המשתמש היה רואה "מותר" ושומע טקסט שכתוב בו "מתר".

      זו גם הבדיקה שתפסה שלושה חוקים שפשוט טעו: "מצב הרוח" שהפך
      ל"מצב הרווח", "לכוון את המושב" שהפך ל"לכיוון", ו"מבטים לעבר
      קו ההפרדה" שהפך ל"לעבור" אותו. */
{
  const bad = keys.filter(k => bare(VOC[k]) !== k);
  ok('raw === stripNikud(pointed) — בכל המאגר', bad.length === 0,
     bad.length ? bad.length + ' מפרות · ' + bad[0] +
                  '\n            → ' + bare(VOC[bad[0]]) : '');
}

/* ------------------------------------------------------------------ */
/* 2. חלוקת המילים זהה — זה מה שמחזיק את ההדגשה                       */
{
  const bad = [];
  for(const k of keys){
    const a = k.split(SPLIT), b = VOC[k].split(SPLIT);
    if(a.length !== b.length){ bad.push(k); continue; }
    /* המפרידים חייבים להיות זהים תו-בתו, אחרת ההיסטים יזוזו */
    for(let i = 1; i < a.length; i += 2){
      if(a[i] !== b[i]){ bad.push(k); break; }
    }
    if(bad.length > 2) break;
  }
  ok('אותה חלוקת מילים ואותם מפרידים', bad.length === 0,
     bad.length ? bad[0] : '');
}

/* ------------------------------------------------------------------ */
/* 3. מחרוזות מספרים לא דלפו לטבלה                                    */
{
  const leaked = keys.filter(k => applyNumbers(k) !== k);
  ok('מספרי תמרורים נשארו מחוץ לטבלה', leaked.length === 0,
     leaked.length ? leaked.length + ' דלפו · ' + leaked.slice(0, 3).join(' · ') : '');
}

/* ------------------------------------------------------------------ */
/* 4. כיסוי — כמעט כל המאגר העברי מנוקד                               */
{
  const list = B.collect('he').filter(x => applyNumbers(x.text) === x.text);
  const hit = list.filter(x => VOC[x.text.replace(/\n/g, ' ')]).length;
  const pct = 100 * hit / list.length;
  ok('לפחות 99% מהמאגר בטבלה   (' + pct.toFixed(1) + '%)', pct >= 99,
     (list.length - hit) + ' מחרוזות חסרות');
}

/* ------------------------------------------------------------------ */
/* 5. הניקוד באמת מלא, לא איים בודדים                                 */
{
  let words = 0, voweled = 0;
  for(const k of keys){
    for(const t of VOC[k].split(SPLIT)){
      if(!t || !/[֐-׿]/.test(t)) continue;
      words++;
      if(HAS.test(t)) voweled++;
    }
  }
  const pct = 100 * voweled / words;
  ok('לפחות 95% מהמילים מנוקדות   (' + pct.toFixed(1) + '%)', pct >= 95,
     (words - voweled).toLocaleString() + ' מילים ללא ניקוד');
}

/* ------------------------------------------------------------------ */
/* 6. חוקי התחום באמת דורסים                                          */
{
  const k = keys.find(x => /(^|[^\p{L}])שלט([^\p{L}]|$)/u.test(x));
  if(!k){ ok('חוק תחום דורס את דיקטה', true); }
  else {
    const v = VOC[k];
    ok('שֶׁלֶט ולא שָׁלַט — חוק התחום גובר', v.indexOf('שֶׁלֶט') !== -1,
       k + '\n            → ' + v);
  }
}

/* ------------------------------------------------------------------ */
/* 7. אימות קריאה נושאת את התנועה שלה                                 */
/*    הנקדן מחזיר צֹוֽמֶת — חולם על הצד"י, וי"ו ערומה, מתג. מנוע
      הקראה רואה וי"ו בלי תנועה והוגה אותה כעיצור, ואת המתג הוא
      מפרש כהטעמה. ביחד זה נשמע כמו עברית במבטא אשכנזי כבד — וזה
      מה שהפיל את סבב ההקלטה הראשון של הניקוד המלא.

      אחרי fixMaters הצורה היא צוֹמֶת, כתיב מלא מנוקד תקני. */
{
  let meteg = 0, bad = 0;
  const BAD = /[ֹֻ]ֽ?ו(?![ְ-ּֿ-ׇ])/;
  for(const k of keys){
    meteg += (VOC[k].match(/ֽ/g) || []).length;
    for(const t of VOC[k].split(SPLIT)){
      if(t && BAD.test(t)) bad++;
    }
  }
  ok('אין מֶתֶג בטקסט שנשלח למנוע', meteg === 0, meteg + ' מופעים');
  ok('אין אֵם קריאה בלי תנועה', bad === 0, bad + ' מילים');
}

console.log('      ');
console.log('      ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
