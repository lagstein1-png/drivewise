/* =====================================================================
   DriveWise · מבחן האזנה: לפני ואחרי תיקון אימות הקריאה
   כלי פיתוח. אפס תלויות.

   השאלה שהכלי מכריע, לפני סבב הקלטה שלישי:

     האם הזזת התנועה אל אֵם הקריאה מסלקת את המבטא האשכנזי?

   שתי גרסאות של כל משפט, באותו קול:

     A · כמו שהוקלט אמש   — צֹוֽמֶת, מֻוֽתָּר, עֲצֹוֽר
     B · אחרי התיקון      — צוֹמֶת, מוּתָּר, עֲצוֹר

   שני הצדדים הם אותן אותיות בדיוק. רק מיקום התנועה שונה, והמתג
   ירד. אם B נשמע נקי — התיקון נכון ואפשר להקליט. אם שניהם עדיין
   רעים, הבעיה אינה כאן ואסור להקליט.

   המשפטים נבחרים דווקא מאלה שיש בהם אימות קריאה, אחרת אין מה
   לשמוע: שתי הגרסאות יהיו זהות.

   הרצה: run-mater-ab.cmd  (מבקש את המפתח בבטחה)
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT  = path.resolve(__dirname, '..');
const OUT   = path.join(__dirname, 'samples', 'mater-ab');
const KEY   = process.env.TTS_KEY || '';
const VOICE = process.env.AB_VOICE || 'he-IL-Chirp3-HD-Aoede';
const N     = parseInt(process.env.AB_N, 10) || 8;

const B = require('./bank');
const { applyContext } = require('./context-rules');
const { applyWords }   = require('./word-rules');
const { applyKtiv }    = require('./ktiv');
const { fixMaters }    = require('./mater');

const RAW = path.join(ROOT, 'data', '.dicta-raw.json');
const SPLIT = /([^\p{L}\p{N}\p{M}]+)/u;
const NIQ = /[֑-ׇ]/g;
const bare = s => String(s).replace(NIQ, '');

/* אותה דריסה שבבנייה, בלי הנרמול — כדי לשחזר את מה שנשלח אמש */
function overrideOnly(src, voc){
  const ours = applyKtiv(applyWords(applyContext(src)));
  const a = src.split(SPLIT), b = ours.split(SPLIT), c = voc.split(SPLIT);
  if(a.length !== b.length || a.length !== c.length) return voc;
  return c.map((tok, i) => {
    if(i % 2 === 1) return a[i];
    if(a[i] === b[i]) return tok;
    if(bare(b[i]) !== a[i]) return tok;
    return b[i];
  }).join('');
}

async function speak(text){
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'x-goog-api-key':KEY },
    body: JSON.stringify({
      input:{ text }, voice:{ languageCode:'he-IL', name:VOICE },
      audioConfig:{ audioEncoding:'MP3', speakingRate:1.0, pitch:0 }
    })
  });
  if(!r.ok) throw new Error('gcloud ' + r.status + ' ' + (await r.text()).slice(0, 140));
  return Buffer.from((await r.json()).audioContent, 'base64');
}

(async () => {
  if(!KEY){ console.error('\n✗ אין מפתח. הרץ את run-mater-ab.cmd'); process.exit(1); }
  const i = [...KEY].findIndex(c => c.codePointAt(0) > 126 || c.codePointAt(0) < 32);
  if(i !== -1){
    console.error('\n✗ המפתח מכיל תו שאינו ASCII במקום ' + (i + 1) +
                  '. כנראה הודבק בפריסת מקלדת עברית.');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive:true });

  const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
  /* רק משפטים שהתיקון באמת נוגע בהם, ובאורך שנוח להאזין לו */
  const pick = [];
  for(const src of Object.keys(raw)){
    if(src.length < 40 || src.length > 100) continue;
    const before = overrideOnly(src, raw[src]);
    const after  = fixMaters(before);
    if(before === after) continue;
    pick.push({ src, before, after });
    if(pick.length >= N * 6) break;
  }
  const list = pick.filter((_, k) => k % 6 === 0).slice(0, N);

  console.log('\n' + list.length + ' משפטים · שתי גרסאות · קול ' + VOICE);
  console.log('עלות: פחות מסנט.\n');

  const rows = [];
  for(const x of list){
    process.stdout.write('  ' + x.src.slice(0, 36).padEnd(38));
    let a, b;
    try{
      a = await speak(x.before); await new Promise(r => setTimeout(r, 300));
      b = await speak(x.after);  await new Promise(r => setTimeout(r, 300));
    }catch(e){ console.log('✗ ' + e.message); continue; }

    const id = 'q' + rows.length;
    fs.writeFileSync(path.join(OUT, id + '-a-before.mp3'), a);
    fs.writeFileSync(path.join(OUT, id + '-b-after.mp3'), b);
    rows.push({ src:x.src, before:x.before, after:x.after,
                a:a.toString('base64'), b:b.toString('base64') });
    console.log('✓');
  }

  writePage(rows);
  console.log('\n  דף האזנה: ' + path.join(OUT, 'listen.html'));
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });

function writePage(rows){
  const esc = s => String(s).replace(/[&<>"]/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const body = rows.map((r, i) => `
  <section class="case">
    <h2>${i + 1}</h2>
    <div class="row"><span class="tag before">כמו שהוקלט אמש</span>
      <p dir="rtl">${esc(r.before)}</p>
      <audio controls preload="none" src="data:audio/mpeg;base64,${r.a}"></audio></div>
    <div class="row"><span class="tag after">אחרי התיקון</span>
      <p dir="rtl">${esc(r.after)}</p>
      <audio controls preload="none" src="data:audio/mpeg;base64,${r.b}"></audio></div>
  </section>`).join('');

  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>לפני ואחרי תיקון אימות הקריאה</title><style>
:root{--bg:#F5F7FA;--card:#fff;--ink:#16202b;--mut:#5d6b7a;--line:#e0e5ec;
      --before:#9B3B2E;--after:#1B6B47}
@media(prefers-color-scheme:dark){:root{--bg:#111820;--card:#1a222c;--ink:#e8eaed;
      --mut:#9aa5b1;--line:#2b323b;--before:#E08B7A;--after:#4FB587}}
*{box-sizing:border-box}body{margin:0;padding:26px 16px;background:var(--bg);color:var(--ink);
font:17px/1.7 Rubik,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto}
h1{font-size:25px;margin:0 0 6px}.sub{color:var(--mut);margin:0 0 26px}
.case{background:var(--card);border:1px solid var(--line);border-radius:14px;
      padding:18px;margin:0 0 16px}
.case h2{font-size:15px;color:var(--mut);margin:0 0 12px}
.row{border-top:1px solid var(--line);padding:12px 0}
.row:first-of-type{border-top:0}
.tag{display:inline-block;font-size:12.5px;font-weight:700;
     letter-spacing:.04em;margin-bottom:5px}
.tag.before{color:var(--before)}.tag.after{color:var(--after)}
.row p{margin:0 0 9px;font-size:16px}
audio{width:100%;height:34px}
</style></head><body><div class="wrap">
<h1>לפני ואחרי תיקון אימות הקריאה</h1>
<p class="sub">אותן אותיות בדיוק בשתי הגרסאות. ההבדל היחיד הוא היכן יושבת
התנועה — על האות שלפני הווי"ו, או על הווי"ו עצמה. אם השנייה נשמעת נקייה,
התיקון נכון. ${rows.length} משפטים אמיתיים מהמאגר.</p>
${body}</div></body></html>`;
  fs.writeFileSync(path.join(OUT, 'listen.html'), html, 'utf8');
}
