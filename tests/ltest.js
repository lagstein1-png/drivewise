/* =====================================================================
   DriveWise · ניקוד מוסיף סימנים, לעולם לא מוחק אותיות
   כלי פיתוח. אפס תלויות.

   נכתבה אחרי שבוע שלם של תיקוני הגייה שלא נשמעו.

   שמונה חוקים כתבו כתיב חסר עם ניקוד: 'מותר' נשלח למנוע כ-מֻתָּר,
   שאותיותיו מ-ת-ר, ו'חצייה' כ-חֲצִיָּה שאותיותיו ח-צ-י-ה. הניקוד היה
   נכון לחלוטין. הבעיה היא שמנוע ההקראה אינו נשען עליו במידה
   שהנחנו, ולכן מה שהוא קיבל בפועל היה שלד עיצורים חסר — והמאזין
   שמע "מתר" במקום "מותר". אלה בדיוק שתי המילים הראשונות שדווחו
   מהאזנה אמיתית.

   הכיוון ההפוך מותר ורצוי: 'מאד' ← 'מאוד' מוסיף אות, וזה כתיב מלא.
   לכן התנאי אינו שוויון אלא הכלה — שלד המילה המקורית חייב להופיע
   בתוך המנוקדת, לפי הסדר.

   כל חוק שיוסיף ניקוד על חשבון אות ייפול כאן, ולא יגיע להקלטות.
   ===================================================================== */
'use strict';

const ROOT = require('path').resolve(__dirname, '..');
const { KTIV } = require(ROOT + '/tools/ktiv');
const { WORD_RULES } = require(ROOT + '/tools/word-rules');
const { CONTEXT_RULES } = require(ROOT + '/tools/context-rules');

const LETTER = c => c >= 'א' && c <= 'ת';
const letters = w => [...String(w)].filter(LETTER).join('');

/* האם a מופיעה בתוך b לפי הסדר, בלי לדלג על אות של a? */
function isSubsequence(a, b){
  let i = 0;
  for(const c of b) if(c === a[i]) i++;
  return i === a.length;
}

let bad = 0, checked = 0;
function check(kind, key, voweled){
  checked++;
  const from = letters(key), to = letters(voweled);
  if(isSubsequence(from, to)) return;
  bad++;
  console.log('✗ ' + kind + '  ' + key + ' → ' + voweled +
              '    אותיות: ' + from + ' → ' + to);
}

for(const [k, v] of Object.entries(KTIV))   check('KTIV   ', k, v);
for(const [k, v] of WORD_RULES)             check('WORD   ', k, v);
for(const r of CONTEXT_RULES)               check('CONTEXT', r.word, r.voweled);

console.log('');
console.log(bad
  ? bad + ' מתוך ' + checked + ' חוקים מוחקים אותיות'
  : '✓ כל ' + checked + ' החוקים מוסיפים סימנים בלבד');
process.exit(bad ? 1 : 0);
