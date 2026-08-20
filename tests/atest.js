/* =====================================================================
   DriveWise · שכבת ההקראה שבאפליקציה
   כלי פיתוח. אפס תלויות.

   הבאג שהבדיקה הזאת שומרת מפניו: היו בפרויקט שתי מערכות הגייה
   נפרדות. הכלים ניקדו את מה שנצרב להקלטות; האפליקציה השתמשה
   בטבלת KTIV משלה, שלא הכירה אף אחד מ-19 חוקי המילה. מי שהאזין
   דרך מנוע המכשיר לא שמע אף תיקון.

   כאן בודקים שלושה דברים:
     · קובץ החוקים המיוצא מעודכן
     · speechMap של האפליקציה מחיל את החוקים על טקסט לא מנוקד
     · הטקסט המוצג אינו משתנה, ומיפוי הקריוקי נשאר עקבי
   ===================================================================== */
'use strict';

const ROOT = require('path').resolve(__dirname, '..');
const fs = require('fs');
const vm = require('vm');
const B = require(ROOT + '/tools/bank');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if(!cond && extra) console.log('    ' + extra);
  cond ? pass++ : fail++;
};

/* ---- קובץ החוקים מעודכן ---- */
{
  const built = require(ROOT + '/tools/export-speech-rules').build();
  const onDisk = JSON.parse(fs.readFileSync(ROOT + '/data/speech-rules.json', 'utf8'));
  ok('data/speech-rules.json תואם לחוקים ב-tools',
     JSON.stringify(built) === JSON.stringify(onDisk),
     'הרץ: node tools/export-speech-rules.js');
}

/* ---- מרימים את speechMap מתוך index.html ---- */
const src = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');
const rules = JSON.parse(fs.readFileSync(ROOT + '/data/speech-rules.json', 'utf8'));

const ctx = {
  DEV: false,
  S: { lang: 'he' },
  console,
  SPEECH_RULES: {
    words: rules.words,
    numbers: rules.numbers,
    context: rules.context.map(x => ({
      word: x.word,
      before: x.before ? new RegExp('^' + x.before + '$') : null,
      after:  x.after  ? new RegExp('^' + x.after  + '$') : null,
      voweled: x.voweled
    })),
    ready: true
  }
};
vm.runInNewContext([
  B.appBlock(src, 'const KTIV = {', '{', '}') + ';',
  'const SEP_SPLIT = /(\\s+|[.,:?!()])/;',
  'const SEP_ONLY  = /^(\\s+|[.,:?!()])$/;',
  'const SPEECH_CACHE = new Map();',
  B.appBlock(src, 'function spokenToken(', '{', '}'),
  B.appBlock(src, 'function speechMap(', '{', '}'),
  'this.speechMap = speechMap;'
].join('\n'), ctx);
const speechMap = ctx.speechMap;

/* ---- עשרה משפטים אמיתיים, כולם ללא ניקוד ---- */
const CASES = [
  ['הסתכל על הצורה והצבע של השלט, ועל המספר שבתוכו.', 'הַשֶּׁלֶט'],
  ['אין כניסה, פרט לרכב ביטחון.',                      'פְּרָט'],
  ['האט לפני מפגש מסילת הברזל.',                       'מִפְגַּשׁ'],
  ['התקרבות למפגש מסילת ברזל.',                        'לְמִפְגַּשׁ'],
  ['האט לקראת מפגש אפשרי עם רוכבי אופניים.',           'מִפְגָּשׁ'],
  ['התמרור פולט אור בגלל גודש בתנועה.',                'פּוֹלֵט'],
  ['זוהי דרך חד סטרית.',                               'סִטְרִית'],
  ['כיוונון המושב, ההגה, המראות ומשענות הראש.',        'הַמַּרְאוֹת'],
  ['כיוון נכון של המראה השמאלית.',                     'הַמַּרְאָה'],
  ['חשוב על שני מספרי ברירת מחדל.',                    'בְּרֵרַת']
];

console.log('\nעשרה משפטים ללא ניקוד כלל:');
for(const [text, expect] of CASES){
  const got = speechMap(text).spoken;
  ok('  ' + text.slice(0, 44), got.includes(expect),
     'ציפיתי ל-' + expect + ', קיבלתי: ' + got.slice(0, 72));
}

/* ---- הטקסט המוצג לא נגוע ---- */
console.log('\nהגנות:');
{
  const t = 'הסתכל על השלט לפני מפגש מסילת הברזל.';
  const before = t;
  speechMap(t);
  ok('הטקסט המקורי לא השתנה', t === before);
}

/* ---- מיפוי הקריוקי עקבי ---- */
{
  const t = 'האט לפני מפגש מסילת הברזל, ובדוק במראות.';
  const m = speechMap(t);
  const contiguous = m.words.every((w, i) =>
    w.dStart >= 0 && w.dEnd <= t.length && w.sEnd <= m.spoken.length &&
    (i === 0 || w.dStart >= m.words[i - 1].dEnd));
  ok('מיפוי הקריוקי בתוך הגבולות ולפי הסדר', contiguous);

  const rebuilt = m.words.map(w => t.slice(w.dStart, w.dEnd)).join(' ');
  ok('כל מילה מוצגת ממופה', rebuilt.includes('מפגש') && rebuilt.includes('במראות'), rebuilt);
}

/* ---- מספרי תמרור ---- */
{
  const a = speechMap('תמרור 615 מציין דרך.').spoken;
  ok('מספר בן שלוש ספרות נקרא ספרה-ספרה', /שש\s+אחת\s+חמש/.test(a), a);
  const b = speechMap('המהירות היא 90 קמ"ש.').spoken;
  ok('כמות עם יחידה נשארת כמות', !/תשע\s+אפס/.test(b), b);
}

/* ---- KTIV לא נשבר ---- */
{
  const t = speechMap('מצין כוון נסיעה, מאד חשוב.').spoken;
  ok('KTIV עדיין פועל ככתיב מלא',
     t.includes('מצוין') && t.includes('כיוון') && t.includes('מאוד'), t);
}

/* ---- המטמון מחזיר את אותו אובייקט ---- */
{
  const t = 'האט לפני מפגש מסילת הברזל.';
  ok('מטמון — קריאה שנייה מחזירה אותה תוצאה', speechMap(t) === speechMap(t));
}

/* ---- כיסוי המאגר ---- */
{
  const list = B.collect('he');
  let threw = null, touched = 0;
  for(const x of list){
    try{
      const m = speechMap(x.text);
      if(m.spoken !== x.text) touched++;
    }catch(e){ threw = x.text.slice(0, 46) + ' — ' + e.message; break; }
  }
  ok('speechMap עובר על כל ' + list.length.toLocaleString() + ' המחרוזות בלי לזרוק', !threw, threw);
  ok('משנה בפועל ' + touched.toLocaleString() + ' מחרוזות', touched > 3000);
}

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
