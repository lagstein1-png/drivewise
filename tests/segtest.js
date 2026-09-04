/* =====================================================================
   תאוריה מדברת · פיצול משפטים לפני ההקראה
   כלי פיתוח. אפס תלויות.

   מנוע המכשיר נוטה להאיץ במשפט ארוך ולבלוע סופי מילים. הפיצול
   נותן לו נשימה, אבל הוא חייב לקיים ארבעה תנאים:

     · הרכבה חוזרת של המקטעים מחזירה בדיוק את הטקסט המקורי
     · ההיסט של כל מקטע נכון, אחרת הדגשת המילה קופצת
     · לא חותכים באמצע מילה
     · מספרים וסימני פיסוק נשארים שלמים
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

const src = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');
function grab(decl){
  const i = src.indexOf(decl);
  if(i < 0) throw new Error('לא נמצא: ' + decl);
  return src.slice(i, src.indexOf(String.fromCharCode(10), i));
}

const ctx = { console };
vm.runInNewContext([
  grab('const SEG_MAX ='),
  grab('const SEG_GAP ='),
  B.appBlock(src, 'function insideNumber(', '{', '}'),
  B.appBlock(src, 'function segments(', '{', '}'),
  'this.segments = segments; this.SEG_MAX = SEG_MAX;'
].join('\n'), ctx);
const { segments, SEG_MAX } = ctx;

/* ---- הרכבה חוזרת על כל המאגר ---- */
{
  const list = B.collect('he');
  let broken = null, offsetBad = null, maxSegs = 0, split = 0;

  for(const x of list){
    const spoken = forSpeech(x.text);
    const segs = segments(spoken);
    maxSegs = Math.max(maxSegs, segs.length);
    if(segs.length > 1) split++;

    /* ההיסט של כל מקטע חייב להצביע על הטקסט שלו */
    for(const s of segs){
      if(spoken.slice(s.start, s.start + s.text.length) !== s.text){
        offsetBad = offsetBad || { text: x.text, seg: s.text, start: s.start };
      }
    }
    /* הרכבה חוזרת */
    const rebuilt = segs.map(s => s.text).join('');
    if(rebuilt.replace(/\s+/g,' ').trim() !== spoken.replace(/\s+/g,' ').trim()){
      broken = broken || { text: x.text, rebuilt };
    }
  }

  ok('הרכבה חוזרת מחזירה את הטקסט המלא, בכל ' + list.length.toLocaleString() + ' המחרוזות',
     !broken, broken ? broken.text.slice(0,50) + '\n      → ' + broken.rebuilt.slice(0,60) : '');
  ok('ההיסט של כל מקטע מצביע על הטקסט שלו',
     !offsetBad, offsetBad ? JSON.stringify(offsetBad).slice(0,110) : '');
  console.log('    ' + split.toLocaleString() + ' מחרוזות מפוצלות · עד ' + maxSegs + ' מקטעים');
}

/* ---- לא חותכים באמצע מילה ---- */
{
  const list = B.collect('he');
  let midWord = null;
  for(const x of list){
    const spoken = forSpeech(x.text);
    const segs = segments(spoken);
    for(let i = 1; i < segs.length; i++){
      const before = spoken[segs[i].start - 1];
      const at = spoken[segs[i].start];
      /* אם משני צדי החיתוך יש אות — נחתכה מילה */
      if(before && at && /[\p{L}\p{M}]/u.test(before) && /[\p{L}\p{M}]/u.test(at)){
        midWord = midWord || { text: x.text.slice(0,44), at: segs[i].start, before, char: at };
      }
    }
  }
  ok('אף מקטע לא מתחיל באמצע מילה', !midWord, midWord ? JSON.stringify(midWord) : '');
}

/* ---- מספרים ופיסוק נשארים שלמים ---- */
{
  const CASES = [
    'משקל כולל מותר עד 3,500 ק"ג.',
    'מהירות מרבית 90 קמ"ש בדרך עירונית, ו-50 בעיר.',
    'תמרור 615 — מה משמעותו?',
    'התקרבות למפגש מסילת ברזל – כ-250 מטרים לפני המפגש.'
  ];
  let bad = null;
  for(const t of CASES){
    const spoken = forSpeech(t);
    const segs = segments(spoken);
    for(const s of segs){
      /* מספר לא נחתך: אם המקטע מסתיים בספרה, התו הבא חייב לא להיות ספרה */
      const next = spoken[s.start + s.text.length];
      /* חיתוך שגוי הוא כל חצייה של ספרה-פיסוק-ספרה. הבדיקה
         הקודמת בדקה ספרה מול ספרה בלבד, ולכן "3,500" עבר. */
      const around = s.text.slice(-2) + (next || '');
      if(/[0-9][.,][0-9]/.test(around) || /[0-9][0-9]/.test(s.text.slice(-1) + (next || '')))
        bad = bad || { t, סוף: s.text.slice(-12), אחרי: next };
    }
  }
  ok('מספרים לא נחתכים באמצע', !bad, bad ? JSON.stringify(bad) : '');
}

/* ---- עשר שאלות ארוכות, ללא ניקוד ---- */
{
  const list = B.collect('he')
    .filter(x => x.text.length > 70 && !/[֑-ׇ]/.test(x.text))
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 10);

  console.log('\nעשר השאלות הארוכות במאגר, כולן ללא ניקוד:');
  let allOk = true;
  list.forEach((x, i) => {
    const spoken = forSpeech(x.text);
    const segs = segments(spoken);
    const lens = segs.map(s => s.text.trim().length);
    const over = lens.filter(n => n > SEG_MAX + 20).length;
    if(over) allOk = false;
    console.log('\n  ' + (i+1) + '. (' + x.text.length + ' תווים · ' + segs.length + ' מקטעים)');
    console.log('     ' + x.text.slice(0, 66));
    segs.forEach(s => console.log('     · ' + s.text.trim().slice(0, 66)));
  });
  ok('\nאף מקטע לא חורג משמעותית מ-' + SEG_MAX + ' תווים', allOk);
}

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
