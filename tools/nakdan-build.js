/* =====================================================================
   DriveWise · ניקוד מלא של המאגר
   כלי פיתוח. אפס תלויות. לא דורש מפתח.

   מנקד את כל המאגר דרך הנקדן של דיקטה, מחיל מעליו את חוקי התחום
   שלנו, ושומר את התוצאה ב-data/speech-he.json.

   למה בזמן בנייה ולא בזמן ריצה: האפליקציה חייבת לעבוד בלי רשת,
   ושיחה לשרת לפני כל משפט הייתה הופכת את ההקראה לאיטית ושבירה.
   מנקדים פעם אחת, שולחים טבלה.

   *** האילוץ שמחזיק את הקריוקי ***

   ההדגשה מתאימה מילה מוצגת למילה נאמרת לפי מיקום. לכן טקסט מנוקד
   חייב להיות אותו טקסט בדיוק, רק עם סימני ניקוד. הבדיקה כאן היא
   מוחלטת: מסירים את הניקוד מהתוצאה, ואם היא אינה זהה למקור —
   פוסלים את השורה וחוזרים לחוקים. עדיף לוותר על ניקוד מילה אחת
   מאשר לשבור את ההדגשה של משפט שלם.

     node tools/nakdan-build.js            בונה
     node tools/nakdan-build.js --check    בודק בלי לכתוב
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'data', 'speech-he.json');
/* פלט דיקטה הגולמי. נשמר כדי ששינוי בחוקי התחום יוכל להחיל
   דריסה מחדש בלי לפנות שוב לשרת. */
const RAW  = path.join(ROOT, 'data', '.dicta-raw.json');
const API  = 'https://nakdan-5-1.loadbalancer.dicta.org.il/api';

const B = require('./bank');
const { applyNumbers } = require('./number-rules');
const { applyContext } = require('./context-rules');
const { applyWords }   = require('./word-rules');
const { applyKtiv }    = require('./ktiv');

const NIQ  = /[֑-ׇ]/g;
const bare = s => String(s).replace(NIQ, '');

/* דיקטה ממירה גרשיים עבריים לישרים. זו החלפה של תו אחד בתו אחד,
   כלומר האורך נשמר וההצמדה של הקריוקי לא נפגעת — ולכן זו אינה
   סיבה לפסול שורה. משווים בלי להבחין ביניהם. */
const quotes = s => String(s).replace(/[״]/g, '"').replace(/[׳]/g, "'");
const same = (a, b) => quotes(bare(a)) === quotes(b);

/* *** שכבת הדריסה ***

   חוקי התחום שלנו מחפשים מילים חשופות. על טקסט מנוקד הם לא
   מזהים דבר — applyWords רואה שָׁלַט ולא שלט, ולא מתקן. לכן
   מפעילים אותם על המקור החשוף, ומשתילים לתוך הטקסט המנוקד לפי
   מספר המילה. זה חוקי בדיוק בזכות האילוץ שנבדק למעלה: אותה
   חלוקת מילים בשני הצדדים.

   רק מילים שהחוקים באמת שינו נשתלות. בכל השאר דיקטה מנצחת. */
const SPLIT = /([^\p{L}\p{N}\p{M}]+)/u;

function override(src, voc){
  const ours = applyKtiv(applyWords(applyContext(src)));
  const a = src.split(SPLIT), b = ours.split(SPLIT), c = voc.split(SPLIT);
  if(a.length !== b.length || a.length !== c.length) return voc;   /* לא מנחשים */
  let n = 0;
  const out = c.map((tok, i) => {
    /* פיצול עם קבוצת לכידה מחזיר מפרידים באינדקסים האי-זוגיים.
       אותם לוקחים מהמקור ולא מדיקטה, שממירה גרשיים עבריים לישרים.
       כך הטבלה יוצאת זהה תו-בתו למה שהאפליקציה מרכיבה בעצמה. */
    if(i % 2 === 1) return a[i];
    if(a[i] === b[i]) return tok;      /* החוקים לא נגעו — דיקטה נשארת */
    n++;
    return b[i];                       /* מונח תחום — החוק דורס */
  });
  return { text: out.join(''), n };
}

const BATCH = 120;          /* מחרוזות לבקשה */
const GAP   = 400;          /* מרווח בין בקשות, לא מציפים שירות חינמי */

async function nakdanBatch(lines){
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task:'nakdan', data: lines.join('\n'), genre:'modern', addmorph:true,
      keepqq:false, nodageshdefmem:false, patachma:false, keepmetagim:true
    })
  });
  if(!r.ok) throw new Error('דיקטה ' + r.status);
  const toks = await r.json();
  const joined = toks.map(tk => {
    if(!tk.options || !tk.options.length) return tk.word;
    const f = tk.options[0];
    return String(Array.isArray(f) ? f[0] : (f.w || f)).split('|').join('');
  }).join('');
  return joined.split('\n');
}

/* בונה את הטבלה מחדש מהגלם השמור. משמש כששינינו חוק תחום ורוצים
   להחיל אותו בלי סבב רשת נוסף. */
function fromCache(){
  const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
  const out = {};
  let forced = 0;
  for(const src of Object.keys(raw)){
    if(applyNumbers(src) !== src) continue;      /* מספרי תמרורים */
    const o = override(src, raw[src]);
    out[src] = typeof o === 'string' ? o : o.text;
    if(o.n) forced += o.n;
  }
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  console.log('\n✓ ' + Object.keys(out).length.toLocaleString() +
              ' מחרוזות מהמטמון · ' + forced + ' מילים נדרסו · ' +
              (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB\n');
}

(async () => {
  const list = B.collect('he');
  const check = process.argv.includes('--check');
  if(process.argv.includes('--from-cache')) return fromCache();

  console.log('\nמנקד ' + list.length.toLocaleString() + ' מחרוזות דרך דיקטה.');
  console.log('כ-' + Math.ceil(list.length / BATCH) + ' בקשות · בערך ' +
              Math.ceil(list.length / BATCH * (GAP + 1500) / 1000 / 60) + ' דקות.\n');

  const out = {};
  const raw = {};
  let done = 0, rejected = 0, failed = 0, forced = 0;
  const badSamples = [];

  for(let i = 0; i < list.length; i += BATCH){
    const slice = list.slice(i, i + BATCH);
    /* הניקוד נעשה על הטקסט המוצג, בלי שכבת המספרים — היא לא
       ניקוד אלא החלפת ספרות במילים, ומופעלת אחר כך. */
    const lines = slice.map(x => x.text.replace(/\n/g, ' '))
      /* מספרי תמרורים נקראים ספרה-ספרה על ידי שכבת המספרים. אין בהם
         עברית ואין לדיקטה מה לנקד בהם, ואם ייכנסו לטבלה היא תעקוף
         את שכבת המספרים ו-136 יחזור להיקרא 'מאה שלושים ושש'.
         הם נשארים מחוץ לטבלה. */
      .filter(t => applyNumbers(t) === t);
    if(!lines.length) continue;

    let got;
    try{ got = await nakdanBatch(lines); }
    catch(e){
      failed += slice.length;
      console.log('  ✗ אצווה ' + (i / BATCH + 1) + ': ' + e.message);
      await new Promise(r => setTimeout(r, GAP * 3));
      continue;
    }

    if(got.length !== lines.length){
      /* מספר השורות לא תואם — לא מנחשים איזו שורה שייכת למה */
      rejected += lines.length;
      console.log('  ✗ אצווה ' + (i / BATCH + 1) + ': ' +
                  got.length + ' שורות במקום ' + lines.length);
      await new Promise(r => setTimeout(r, GAP));
      continue;
    }

    for(let k = 0; k < lines.length; k++){
      const src = lines[k];
      const voc = got[k];
      /* האילוץ: הסרת הניקוד חייבת להחזיר את המקור בדיוק */
      if(!same(voc, src)){
        rejected++;
        if(badSamples.length < 3) badSamples.push({ src, voc });
        continue;
      }
      raw[src] = voc;                       /* גלם, לפני דריסה */
      const o = override(src, voc);
      out[src] = typeof o === 'string' ? o : o.text;
      if(o.n) forced += o.n;
      done++;
    }

    process.stdout.write('\r  ' + Math.min(i + BATCH, list.length).toLocaleString() +
                         ' / ' + list.length.toLocaleString() +
                         '   נוקדו ' + done.toLocaleString() +
                         ' · נפסלו ' + rejected + ' · נכשלו ' + failed + '   ');
    await new Promise(r => setTimeout(r, GAP));
  }

  console.log('\n');
  console.log('  נוקדו : ' + done.toLocaleString() +
              '  (' + (100 * done / list.length).toFixed(1) + '%)');
  console.log('  נפסלו : ' + rejected.toLocaleString() + '   — חוזרות לחוקים');
  console.log('  נכשלו : ' + failed.toLocaleString());
  console.log('  מילים שהחוקים שלנו דרסו : ' + forced.toLocaleString());

  if(badSamples.length){
    console.log('\n  דוגמאות לשורות שנפסלו:');
    badSamples.forEach(b => {
      console.log('    מקור  : ' + b.src.slice(0, 60));
      console.log('    חזרה  : ' + bare(b.voc).slice(0, 60));
    });
  }

  if(check){ console.log('\n  בדיקה בלבד — לא נכתב.\n'); return; }

  fs.writeFileSync(RAW, JSON.stringify(raw), 'utf8');
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log('\n✓ נכתב data/speech-he.json · ' + kb + 'KB\n');
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
