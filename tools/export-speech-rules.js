/* =====================================================================
   DriveWise · ייצוא חוקי ההגייה לאפליקציה
   כלי פיתוח. אפס תלויות.

   הבעיה שהכלי הזה פותר: היו בפרויקט שתי מערכות הגייה נפרדות.
   בכלים — word-rules, context-rules ו-number-rules, שנצרבים לתוך
   ההקלטות. באפליקציה — טבלת KTIV, שהיא מה שנשמע כשההשמעה נופלת
   חזרה למנוע המכשיר. הן הסכימו על מחצית מהמאגר בלבד, ואף אחד
   מ-19 חוקי המילה לא היה מוכר לאפליקציה.

   התוצאה: מי שהאזין דרך מנוע המכשיר לא קיבל אף אחד מהתיקונים.

   כאן מייצאים את החוקים לקובץ שהאפליקציה טוענת, כך שמקור האמת
   נשאר אחד. הבדיקה tests/atest.js נכשלת אם הקובץ אינו מעודכן.

     node tools/export-speech-rules.js          כותב
     node tools/export-speech-rules.js --check  רק בודק, לא כותב
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'data', 'speech-rules.json');

const { WORD_RULES }    = require('./word-rules');
const { CONTEXT_RULES } = require('./context-rules');
const { HE_DIGIT, UNITS, MIN_DIGITS } = require('./number-rules');
const { KTIV } = require('./ktiv');

function build(){
  /* חוקי המילה הופכים למפה, כי האפליקציה מחפשת לפי אסימון בודד
     וחיפוש במפה זול מלולאה על מערך. */
  const words = {};
  for(const [w, v] of WORD_RULES) words[w] = v;

  /* חוקי ההקשר נשמרים כמו שהם. before ו-after הם ביטויים רגולריים
     של מילה אחת סמוכה, ולכן האפליקציה יכולה להעריך אותם ברמת
     האסימון — וזה מה שמאפשר לשמור על מיפוי הקריוקי. */
  const context = CONTEXT_RULES.map(r => ({
    word: r.word,
    before: r.before || null,
    after: r.after || null,
    voweled: r.voweled
  }));

  return {
    note: 'נוצר על ידי tools/export-speech-rules.js — אין לערוך ביד',
    words,
    context,
    numbers: { digits: HE_DIGIT, units: UNITS, minDigits: MIN_DIGITS },
    /* הטבלה הזאת חיה קודם רק ב-index.html ולכן לא נצרבה
       להקלטות. עכשיו יש לה מקור אחד, והוא כאן. */
    ktiv: KTIV
  };
}

const data = build();
const text = JSON.stringify(data, null, 1);

if(process.argv.includes('--check')){
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if(cur.trim() === text.trim()){
    console.log('✓ data/speech-rules.json מעודכן');
    process.exit(0);
  }
  console.error('✗ data/speech-rules.json אינו תואם לחוקים.');
  console.error('  הרץ: node tools/export-speech-rules.js');
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text, 'utf8');
console.log('✓ נכתב data/speech-rules.json');
console.log('  ' + Object.keys(data.words).length + ' חוקי מילה · ' +
            Object.keys(data.ktiv).length + ' כתיב · ' +
            data.context.length + ' חוקי הקשר · ' +
            'מספרים מ-' + data.numbers.minDigits + ' ספרות');

module.exports = { build };
