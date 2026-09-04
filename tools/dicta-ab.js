/* =====================================================================
   תאוריה מדברת · מבחן האזנה: חשוף מול החוקים שלנו מול דיקטה
   כלי פיתוח. אפס תלויות.

   השאלה שהכלי הזה נועד להכריע, לפני סבב הקלטה של 27,300 קבצים:

     האם ניקוד מלא נשמע טוב יותר מטקסט חשוף, ומהניקוד החלקי
     שיש לנו היום?

   שלוש גרסאות של כל משפט, באותו קול:

     A · חשוף   — כפי שהוא במאגר
     B · שלנו   — 79 החוקים. 6% מהמילים מנוקדות בממוצע
     C · דיקטה  — ניקוד מלא, ואחריו החוקים שלנו דורסים
                  במונחי התחום

   שכבת הדריסה ב-C חשובה: דיקטה קוראת "שלט" כפועל שָׁלַט ולא
   כשֶׁלֶט של דרך, כי אין לה מושג שזה חומר לימוד לנהיגה.

   הרצה: run-dicta-ab.cmd  (מבקש את המפתח בבטחה)
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT  = path.resolve(__dirname, '..');
const OUT   = path.join(__dirname, 'samples', 'dicta-ab');
const KEY   = process.env.TTS_KEY || '';
const VOICE = process.env.AB_VOICE || 'he-IL-Chirp3-HD-Aoede';
const N     = parseInt(process.env.AB_N, 10) || 8;

const B = require('./bank');
const { forSpeech } = require('./speech');
const { applyContext } = require('./context-rules');
const { applyWords }   = require('./word-rules');

const NAKDAN = 'https://nakdan-5-1.loadbalancer.dicta.org.il/api';

async function nakdan(text){
  const r = await fetch(NAKDAN, {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ task:'nakdan', data:text, genre:'modern', addmorph:true,
      keepqq:false, nodageshdefmem:false, patachma:false, keepmetagim:true })
  });
  if(!r.ok) throw new Error('דיקטה ' + r.status);
  const toks = await r.json();
  return toks.map(tk => {
    if(!tk.options || !tk.options.length) return tk.word;
    const f = tk.options[0];
    return String(Array.isArray(f) ? f[0] : (f.w || f)).split('|').join('');
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
  if(!r.ok) throw new Error('gcloud ' + r.status + ' ' + (await r.text()).slice(0,140));
  return Buffer.from((await r.json()).audioContent, 'base64');
}

(async () => {
  if(!KEY){ console.error('\n✗ אין מפתח. הרץ את run-dicta-ab.cmd'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive:true });

  /* משפטים אמיתיים מהמאגר, פרוסים על פני כל הבנק */
  const list = B.collect('he')
    .filter(x => x.text.length > 45 && x.text.length < 105)
    .filter((_, i) => i % 53 === 0)
    .slice(0, N);

  console.log('\n' + list.length + ' משפטים · שלוש גרסאות · קול ' + VOICE);
  console.log('עלות: פחות משני סנט.\n');

  const rows = [];
  for(const x of list){
    const bare = x.text;
    const mine = forSpeech(bare);
    let full;
    try{
      /* דיקטה מנקדת הכול, ואז החוקים שלנו דורסים במונחי התחום */
      full = applyWords(applyContext(await nakdan(bare)));
    }catch(e){ console.log('  ✗ ' + e.message); continue; }
    await new Promise(r => setTimeout(r, 350));

    process.stdout.write('  ' + bare.slice(0, 34).padEnd(36));
    let a, b, c;
    try{
      a = await speak(bare); await new Promise(r=>setTimeout(r,300));
      b = await speak(mine); await new Promise(r=>setTimeout(r,300));
      c = await speak(full); await new Promise(r=>setTimeout(r,300));
    }catch(e){ console.log('✗ ' + e.message); continue; }

    const id = 'q' + rows.length;
    fs.writeFileSync(path.join(OUT, id + '-a-bare.mp3'), a);
    fs.writeFileSync(path.join(OUT, id + '-b-ours.mp3'), b);
    fs.writeFileSync(path.join(OUT, id + '-c-dicta.mp3'), c);
    rows.push({ bare, mine, full,
                a:a.toString('base64'), b:b.toString('base64'), c:c.toString('base64') });
    console.log('✓');
  }

  writePage(rows);
  console.log('\n  דף האזנה: ' + path.join(OUT, 'listen.html'));
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });

function writePage(rows){
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const body = rows.map((r, i) => `
  <section class="case">
    <h2>${i + 1}</h2>
    <div class="row"><span class="tag">חשוף</span>
      <p dir="rtl">${esc(r.bare)}</p>
      <audio controls preload="none" src="data:audio/mpeg;base64,${r.a}"></audio></div>
    <div class="row"><span class="tag ours">החוקים שלנו</span>
      <p dir="rtl">${esc(r.mine)}</p>
      <audio controls preload="none" src="data:audio/mpeg;base64,${r.b}"></audio></div>
    <div class="row"><span class="tag dicta">דיקטה + דריסה</span>
      <p dir="rtl">${esc(r.full)}</p>
      <audio controls preload="none" src="data:audio/mpeg;base64,${r.c}"></audio></div>
  </section>`).join('');

  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ניקוד מלא מול חלקי מול חשוף</title><style>
:root{--bg:#F5F7FA;--card:#fff;--ink:#16202b;--mut:#5d6b7a;--line:#e0e5ec;
      --ours:#8A5A1B;--dicta:#1B6B47}
@media(prefers-color-scheme:dark){:root{--bg:#111820;--card:#1a222c;--ink:#e8eaed;
      --mut:#9aa5b1;--line:#2b323b;--ours:#D9A441;--dicta:#4FB587}}
*{box-sizing:border-box}body{margin:0;padding:26px 16px;background:var(--bg);color:var(--ink);
font:17px/1.7 Rubik,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto}
h1{font-size:25px;margin:0 0 6px}.sub{color:var(--mut);margin:0 0 26px}
.case{background:var(--card);border:1px solid var(--line);border-radius:14px;
      padding:18px;margin:0 0 16px}
.case h2{font-size:15px;color:var(--mut);margin:0 0 12px}
.row{border-top:1px solid var(--line);padding:12px 0}
.row:first-of-type{border-top:0}
.tag{display:inline-block;font-size:12.5px;font-weight:700;color:var(--mut);
     letter-spacing:.04em;margin-bottom:5px}
.tag.ours{color:var(--ours)}.tag.dicta{color:var(--dicta)}
.row p{margin:0 0 9px;font-size:16px}
audio{width:100%;height:34px}
</style></head><body><div class="wrap">
<h1>ניקוד מלא מול חלקי מול חשוף</h1>
<p class="sub">אותו משפט, אותו קול, שלוש גרסאות. השווה את השלישית לראשונה —
היא הכיוון שנשקל. ${rows.length} משפטים אמיתיים מהמאגר.</p>
${body}</div></body></html>`;
  fs.writeFileSync(path.join(OUT, 'listen.html'), html, 'utf8');
}
