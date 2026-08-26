/* =====================================================================
   DriveWise · שלושת מסלולי ההקראה חייבים לומר אותו דבר
   כלי פיתוח. אפס תלויות.

   באפליקציה יש שני מסלולים להשמעת אותו משפט:

     tier 1  קובץ מוקלט — הטקסט נצרב בזמן בנייה, דרך forSpeech
     tier 2  קול המכשיר — הטקסט נשלח בזמן ריצה, דרך speechMap

   שניהם צריכים לשלוח למנוע בדיוק את אותה מחרוזת. כשהם נפרדים,
   אותה שאלה נשמעת נכון במסלול אחד ושגוי באחר, והמשתמש לא יכול
   לדעת למה — הוא רק שומע שזה לא עקבי.

   זה כבר קרה פעמיים:

     · KTIV חי רק ב-index.html ולכן מעולם לא נצרב להקלטות.
       46.9% מהמאגר הושפע, ודווקא במילים הנפוצות ביותר —
       רכב, תמרור, כביש, נהג.

     · toSpeech החיל KTIV בלבד, בלי אף אחד מחוקי ההגייה, ולכן
       הספק החיצוני שמע טקסט שונה משני האחרים בכל משפט.

   הבדיקה הזאת היא מה שיתפוס את זה בפעם הבאה, על כל המאגר.
   ===================================================================== */
'use strict';

const ROOT = require('path').resolve(__dirname, '..');
const fs = require('fs');
const vm = require('vm');
const B = require(ROOT + '/tools/bank');
const { forSpeech } = require(ROOT + '/tools/speech');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? '✓ ' : '✗ ') + name);
  if(!cond && extra) console.log('    ' + extra);
  cond ? pass++ : fail++;
};

/* ---- מרימים את שלושת המסלולים מהקוד האמיתי ---- */
const src = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');
const rules = JSON.parse(fs.readFileSync(ROOT + '/data/speech-rules.json', 'utf8'));

/* שולף שורת הגדרה שלמה מ-index.html, כדי שהבדיקה תשקף את הקוד
   ולא תשכפל אותו. בדיקה שמשכפלת קוד בודקת את עצמה. */
function grab(decl){
  const i = src.indexOf(decl);
  if(i < 0) throw new Error('לא נמצא ב-index.html: ' + decl);
  return src.slice(i, src.indexOf(String.fromCharCode(10), i));
}

const ctx = {
  DEV: false, console,
  S: { lang: 'he' },
  NIQQUD: /[֑-ׇ]/g,
  SPEECH_RULES: {
    words: rules.words,
    numbers: rules.numbers,
    ktiv: rules.ktiv,
    context: (rules.context || []).map(x => ({
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
  grab('const SEP_SPLIT ='),
  grab('const SEP_ONLY  ='),
  grab('const STOP      ='),
  'const SPEECH_CACHE = new Map();',
  B.appBlock(src, 'function spokenToken(', '{', '}'),
  B.appBlock(src, 'function speechMap(', '{', '}'),
  'this.speechMap = speechMap;'
].join('\n'), ctx);

const { speechMap } = ctx;

/* ---- קובץ החוקים מעודכן ---- */
{
  const built = require(ROOT + '/tools/export-speech-rules').build();
  ok('data/speech-rules.json תואם לחוקים ב-tools',
     JSON.stringify(built) === JSON.stringify(rules),
     'הרץ: node tools/export-speech-rules.js');
  ok('הייצוא כולל את טבלת הכתיב', !!rules.ktiv && Object.keys(rules.ktiv).length > 0);
}

/* ---- שני המסלולים על כל המאגר ---- */
{
  const list = B.collect('he');
  const bad = [];

  for(const x of list){
    const t1 = forSpeech(x.text);
    const t2 = speechMap(x.text).spoken;
    if(t1 !== t2 && bad.length < 3) bad.push({ text:x.text, t1, t2 });
  }

  ok('tier 1 (הקלטה) שווה ל-tier 2 (מכשיר) בכל ' + list.length.toLocaleString() + ' המחרוזות',
     bad.length === 0,
     bad.length ? bad.map(b => '\n      ' + b.text.slice(0,40) +
       '\n      tier1: ' + b.t1.slice(0,50) + '\n      tier2: ' + b.t2.slice(0,50)).join('') : '');
}

/* ---- שכבת הכתיב באמת פועלת בשני הצדדים ---- */
{
  const t = 'הרכב עצר לפני תמרור על הכביש.';
  const a = forSpeech(t), b = speechMap(t).spoken;
  ok('כתיב חל בצד הבנייה', /הָרֶכֶב/.test(a) && /תַּמְרוּר/.test(a), a);
  ok('כתיב חל בצד האפליקציה', /הָרֶכֶב/.test(b) && /תַּמְרוּר/.test(b), b);
}

/* ---- סדר השכבות: חוק ספציפי גובר על הכתיב הכללי ---- */
{
  const t = 'האט לפני מפגש מסילת הברזל ברכב.';
  const a = forSpeech(t);
  ok('חוק ההקשר גובר, והכתיב עדיין חל על השאר',
     /מִפְגַּשׁ/.test(a) && /בָּרֶכֶב/.test(a), a);
}

/* ---- מספרים: אותה הכרעה בשני הצדדים ---- */
{
  const inSentence = 'תמרור 615 מציין את מספר הדרך.';
  const alone = '615';
  ok('מספר בתוך משפט נשאר כמות, בשני הצדדים',
     forSpeech(inSentence).includes('615') && speechMap(inSentence).spoken.includes('615'));
  ok('מספר שהוא כל המחרוזת נקרא ספרה-ספרה, בשני הצדדים',
     /שש אחת חמש/.test(forSpeech(alone)) && /שש אחת חמש/.test(speechMap(alone).spoken),
     forSpeech(alone) + '  |  ' + speechMap(alone).spoken);
}

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
