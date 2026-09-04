/* =====================================================================
   תאוריה מדברת · האם ניקוד משפר את ההגייה?
   כלי פיתוח. אפס תלויות.

   כל ארכיטקטורת חוקי ההגייה מניחה שהמנוע מקשיב לניקוד. אף אחד
   לא מדד את זה. הכלי הזה מודד.

   שתי שאלות, בסדר הזה:

   1. האם הניקוד משנה משהו בכלל?  ← אובייקטיבי, בלי אוזן
      מייצרים את אותו משפט פעמיים, עם ניקוד ובלי, באותו קול.
      אם הקבצים זהים בתוכן — המנוע מתעלם מהניקוד, וכל הטבלה
      חסרת ערך. אם הם שונים — הניקוד מגיע למנוע.

   2. האם השינוי לטובה?  ← דורש אוזן
      לשאלה הזאת אין קיצור דרך. נוצר דף האזנה שמעמיד את שתי
      הגרסאות זו לצד זו.

   הרצה: run-niqqud-ab.cmd  (מבקש את המפתח בבטחה)
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(__dirname, 'samples', 'niqqud-ab');
const KEY  = process.env.TTS_KEY || '';
const VOICE = process.env.AB_VOICE || 'he-IL-Chirp3-HD-Aoede';

/* המקרים שבהם באמת שמענו טעות. הצורה המנוקדת היא מה שהטבלה
   הידנית או דיקטה קבעו — כאן בודקים אם היא בכלל מגיעה למנוע. */
const CASES = [
  { id:'perat',    raw:'אין כניסה, פרט לרכב ביטחון.',
                   nik:'אין כניסה, פְּרָט לרכב ביטחון.',
                   note:'פְּרָט = חוץ מ. נשמע כמו פָּרַט' },
  { id:'shelet',   raw:'השלט מורה על כיוון הנסיעה.',
                   nik:'הַשֶּׁלֶט מורה על כיוון הנסיעה.',
                   note:'שֶׁלֶט. נשמע כמו הפועל שָׁלַט' },
  { id:'mifgash',  raw:'האט לפני מפגש מסילת הברזל.',
                   nik:'האט לפני מִפְגַּשׁ מסילת הברזל.',
                   note:'סמיכות — מִפְגַּשׁ ולא מִפְגָּשׁ' },
  { id:'polet',    raw:'הרכב פולט גזים.',
                   nik:'הרכב פּוֹלֵט גזים.',
                   note:'פּוֹלֵט' },
  { id:'sitri',    raw:'זוהי דרך חד סטרית.',
                   nik:'זוהי דרך חד סִטְרִית.',
                   note:'סִטְרִית' },
  { id:'marot',    raw:'כיוונון המושב, ההגה, המראות ומשענות הראש.',
                   nik:'כיוונון המושב, ההגה, הַמַּרְאוֹת ומשענות הראש.',
                   note:'הַמַּרְאוֹת ולא הַמְרָאוֹת' },
  { id:'mara',     raw:'הסתכל במראה לפני שאתה פונה.',
                   nik:'הסתכל בַּמַּרְאָה לפני שאתה פונה.',
                   note:'מַרְאָה של רכב, לא מַרְאֶה' },
  { id:'brerat',   raw:'זוהי ברירת המחדל.',
                   nik:'זוהי בְּרֵרַת המחדל.',
                   note:'בְּרֵרַת בסמיכות' },
  { id:'shtayim',  raw:'תשובה שתיים היא הנכונה.',
                   nik:'תשובה שְׁתַּיִם היא הנכונה.',
                   note:'שְׁתַּיִם. נשמע כמו שְׁתֵּים' },
  { id:'number',   raw:'תמרור שש מאות וחמש עשרה.',
                   nik:'תמרור שש מאות וחמש עֶשְׂרֵה.',
                   note:'מספר תמרור, לא כמות' }
];

async function speak(text){
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'he-IL', name: VOICE },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 }
    })
  });
  if(!r.ok) throw new Error('gcloud ' + r.status + ' ' + (await r.text()).slice(0, 160));
  const j = await r.json();
  return Buffer.from(j.audioContent, 'base64');
}

const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12);

(async () => {
  if(!KEY){ console.error('\n✗ אין מפתח. הרץ את run-niqqud-ab.cmd'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });

  const chars = CASES.reduce((s, c) => s + c.raw.length + c.nik.length, 0);
  console.log('\n' + CASES.length + ' זוגות · ' + chars + ' תווים · קול ' + VOICE);
  console.log('עלות: פחות מסנט.\n');

  const rows = [];
  for(const c of CASES){
    process.stdout.write('  ' + c.id.padEnd(9));
    let a, b;
    try{
      a = await speak(c.raw);
      await new Promise(r => setTimeout(r, 350));
      b = await speak(c.nik);
      await new Promise(r => setTimeout(r, 350));
    }catch(e){ console.log('✗ ' + e.message); continue; }

    fs.writeFileSync(path.join(OUT, c.id + '-1-raw.mp3'), a);
    fs.writeFileSync(path.join(OUT, c.id + '-2-niqqud.mp3'), b);

    const same = a.equals(b);
    const delta = b.length - a.length;
    rows.push({ ...c, same, aLen: a.length, bLen: b.length, delta,
                aB64: a.toString('base64'), bB64: b.toString('base64') });
    console.log(same ? '≡ זהים — המנוע התעלם מהניקוד'
                     : '≠ שונים  (' + a.length + ' → ' + b.length + ' בייט, ' +
                       (delta > 0 ? '+' : '') + delta + ')');
  }

  const ignored = rows.filter(r => r.same).length;
  console.log('\n──────────────────────────────');
  console.log('  הניקוד שינה את הפלט ב-' + (rows.length - ignored) + ' מתוך ' + rows.length);

  if(ignored === rows.length){
    console.log('\n  המנוע מתעלם מהניקוד לחלוטין.');
    console.log('  המסקנה: טבלת החוקים לא עושה כלום, וצריך גישה אחרת.');
  } else if(!ignored){
    console.log('\n  הניקוד מגיע למנוע בכל המקרים.');
    console.log('  נשארה שאלת האוזן: האם לטובה. פתח את דף ההאזנה.');
  }

  writePage(rows);
  console.log('\n  דף האזנה: ' + path.join(OUT, 'listen.html'));
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });

/* דף עצמאי — האודיו מוטמע, אפשר לפתוח מכל מקום ובלי שרת */
function writePage(rows){
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const body = rows.map(r => `
  <section class="case${r.same ? ' same' : ''}">
    <h2>${esc(r.note)}</h2>
    <div class="pair">
      <div class="side">
        <span class="tag">בלי ניקוד</span>
        <p dir="rtl">${esc(r.raw)}</p>
        <audio controls preload="none" src="data:audio/mpeg;base64,${r.aB64}"></audio>
      </div>
      <div class="side">
        <span class="tag on">עם ניקוד</span>
        <p dir="rtl">${esc(r.nik)}</p>
        <audio controls preload="none" src="data:audio/mpeg;base64,${r.bB64}"></audio>
      </div>
    </div>
    <p class="verdict">${r.same
      ? 'הקבצים זהים בבייטים — המנוע התעלם מהניקוד.'
      : 'הפלט שונה (' + r.aLen + ' → ' + r.bLen + ' בייט). האם לטובה — תשפוט באוזן.'}</p>
  </section>`).join('');

  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ניקוד מול ללא ניקוד</title><style>
:root{--bg:#faf9f7;--card:#fff;--ink:#16202b;--mut:#5d6b7a;--line:#e2e0dc;--on:#0d7a5f;--warn:#a8442a}
@media(prefers-color-scheme:dark){:root{--bg:#12161b;--card:#1a1f26;--ink:#e8eaed;--mut:#9aa5b1;--line:#2b323b}}
*{box-sizing:border-box}body{margin:0;padding:28px 18px;background:var(--bg);color:var(--ink);
font:16px/1.6 Rubik,"Segoe UI",system-ui,sans-serif}
h1{font-size:26px;margin:0 0 6px}.sub{color:var(--mut);margin:0 0 26px}
.case{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:0 0 16px}
.case.same{border-color:var(--warn)}
h2{font-size:17px;margin:0 0 14px;font-weight:600}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:640px){.pair{grid-template-columns:1fr}}
.side{border:1px solid var(--line);border-radius:10px;padding:12px}
.tag{display:inline-block;font-size:12px;font-weight:700;color:var(--mut);
letter-spacing:.04em;margin-bottom:6px}.tag.on{color:var(--on)}
.side p{margin:0 0 10px;font-size:15px}
audio{width:100%;height:34px}
.verdict{margin:12px 0 0;font-size:13px;color:var(--mut)}
.case.same .verdict{color:var(--warn);font-weight:600}
</style></head><body>
<h1>ניקוד מול ללא ניקוד</h1>
<p class="sub">אותו משפט, אותו קול (${esc(VOICE)}), פעמיים. מסגרת אדומה = המנוע התעלם מהניקוד.</p>
${body}</body></html>`;
  fs.writeFileSync(path.join(OUT, 'listen.html'), html, 'utf8');
}
