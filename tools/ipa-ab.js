/* =====================================================================
   תאוריה מדברת · האם ה-IPA באמת נאמר?
   כלי פיתוח. אפס תלויות.

   הפרוב כבר הוכיח ששלושה דברים נכונים: הניקוד מגיע למנוע, Chirp3
   מקבל SSML, ו-<phoneme> משנה את האודיו. מה שהוא לא יכול להוכיח
   הוא שהתג נאמר *כפי שביקשנו* — שינוי באודיו יכול לנבוע גם מכך
   שהמנוע נבוך מהתג ומבטא משהו שלישי.

   לכן שתי הקלטות של אותה מילה, עם שני IPA הפוכים במכוון:

     muˈtaʁ   מוּתָּר   — ההגייה הנכונה
     maˈtiʁ   מַתִּיר   — ההגייה שדווחה כנשמעת בפועל

   אם שתיהן נשמעות שונות, וכל אחת נשמעת כמו שכתוב לידה — ה-IPA
   בשליטתנו, ואפשר לבנות עליו. אם שתיהן נשמעות זהות, או ששתיהן
   נשמעות כמו משהו שלישי, התג מתקבל אך אינו נאכף כהגייה.

   לשאלה הזאת אין קיצור דרך אובייקטיבי. צריך אוזן, פעם אחת.

   הרצה: run-ipa-ab.cmd  (מבקש את המפתח בבטחה)
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const KEY = process.env.TTS_KEY || '';
const LANG = 'he-IL';
const OUT = path.join(__dirname, 'samples', 'ipa-ab');

/* שני מודלים, לא אחד.

   על Chirp3 כבר נמדד: התג מתקבל, האודיו משתנה, וה-IPA אינו נאכף —
   בקשה מפורשת ל-maˈtiʁ יצאה "מותר". Wavenet הוא הדור הקודם,
   ושם <phoneme> היה חלק מהתקן ולא תוספת.

   שתי המילים בכל קול, זו לצד זו, כי ההחלטה שתעמוד כאן אינה רק
   "האם ה-IPA נאכף" אלא גם "האם הקול הזה נעים לשמיעה מספיק כדי
   להחליף בו את הנוכחי". את השנייה אי אפשר לענות בלי לשמוע. */
const VOICES = [
  { id:'chirp3',  name:'he-IL-Chirp3-HD-Aoede', label:'Chirp3-HD (הקול הנוכחי)' },
  { id:'wavenet', name:'he-IL-Wavenet-A',       label:'Wavenet-A (הדור הקודם)' }
];

const WORD = 'מותר';
const CASES = [
  { id:'a', ipa:'muˈtaʁ', says:'מוּתָּר', note:'ההגייה הנכונה' },
  { id:'b', ipa:'maˈtiʁ', says:'מַתִּיר', note:'ההגייה השגויה שדווחה' }
];

/* אותה בדיקה שמונעת מפתח שהוקלד במקלדת עברית מלהפיל את הריצה
   בשגיאת ByteString גולמית. */
function checkKey(){
  if(!KEY) throw new Error('חסר TTS_KEY בסביבה. הרץ דרך run-ipa-ab.cmd');
  const i = [...KEY].findIndex(c => c.codePointAt(0) > 126 || c.codePointAt(0) < 32);
  if(i === -1) return;
  const cp = KEY.codePointAt(i);
  throw new Error(
    'API key has a non-ASCII character at position ' + (i + 1) + ' (code ' + cp + ').' +
    (cp < 32 ? '  Right-click pastes in this window; Ctrl+V types ^V.'
             : '  Switch the keyboard to English and paste again.') +
    '  The key itself was never read or stored.');
}

async function speak(ssml, voice){
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      input: { ssml },
      voice: { languageCode: LANG, name: voice },
      audioConfig: { audioEncoding: 'MP3' }
    })
  });
  const body = await r.text();
  if(!r.ok){
    let msg = body;
    try { msg = JSON.parse(body).error.message; } catch(e){}
    throw new Error(r.status + ': ' + String(msg).slice(0, 200));
  }
  return Buffer.from(JSON.parse(body).audioContent, 'base64');
}

(async function main(){
  checkKey();
  fs.mkdirSync(OUT, { recursive: true });

  console.log('');
  const made = [];
  for(const v of VOICES){
    console.log('  ' + v.label);
    for(const c of CASES){
      const ssml = '<speak><phoneme alphabet="ipa" ph="' + c.ipa + '">' +
                   WORD + '</phoneme></speak>';
      const stem = v.id + '-' + c.id;
      try {
        const audio = await speak(ssml, v.name);
        fs.writeFileSync(path.join(OUT, stem + '.mp3'), audio);
        made.push({ v, c, stem, bytes: audio.length });
        console.log('    ' + stem + '.mp3   ph="' + c.ipa + '"   ' +
                    audio.length.toLocaleString() + ' bytes   ' + c.note);
      } catch(e){
        /* קול שנדחה הוא תוצאה, לא תקלה — ממשיכים לשאר */
        made.push({ v, c, stem, err: e.message });
        console.log('    ' + stem + '   ✗ ' + e.message);
      }
    }
  }

  /* דף האזנה. קבוצה לכל קול, בלי קישוט. */
  const rows = VOICES.map(v => {
    const inner = made.filter(m => m.v === v).map(m => m.err ? `
      <div class="row"><span class="err">✗ ${m.err}</span></div>` : `
      <div class="row">
        <audio controls src="${m.stem}.mp3"></audio>
        <div>
          <code>ph="${m.c.ipa}"</code>
          <b>${m.c.says}</b>
          <span>${m.c.note}</span>
        </div>
      </div>`).join('');
    return `<h2>${v.label}</h2><p class="v">${v.name}</p>${inner}`;
  }).join('');

  fs.writeFileSync(path.join(OUT, 'listen.html'),
`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<title>IPA — האם התג נאכף?</title>
<style>
 body{font:16px system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem;
      background:#faf9f7;color:#1a1a1a}
 h1{font-size:1.3rem}
 h2{font-size:1.05rem;margin:2.5rem 0 .2rem}
 .v{font:13px ui-monospace,monospace;color:#888;margin:0 0 .5rem}
 .row{display:flex;gap:1rem;align-items:center;margin:.75rem 0;
      padding:1rem;background:#fff;border:1px solid #e5e2dc;border-radius:.5rem}
 code{background:#f0eeea;padding:.15rem .4rem;border-radius:.25rem}
 b{font-size:1.4rem;margin:0 .6rem}
 span{color:#666;font-size:.9rem}
 .err{color:#a11}
 p{color:#444;line-height:1.6}
 .box{background:#fff;border:1px solid #e5e2dc;border-radius:.5rem;padding:1rem}
</style>
<h1>המילה "מותר", בשני מודלים, עם IPA הפוך</h1>
<p>אותה מילה ואותו טקסט בכל ארבעת הקטעים. ההבדל היחיד הוא מה שנכתב
   בתוך <code>&lt;phoneme alphabet="ipa"&gt;</code> — ואיזה מודל מקריא.</p>
${rows}
<h2>מה לשמוע</h2>
<div class="box">
<p><b>1. האם ה-IPA נאכף?</b> בכל קול בנפרד: אם הראשון נשמע
   <b>מוּתָּר</b> והשני <b>מַתִּיר</b> — התג נאכף שם. אם שניהם נשמעים
   אותו דבר, הוא מתקבל ונבלע. ב-Chirp3 כבר נמדד שהוא נבלע.</p>
<p><b>2. ואם Wavenet כן אוכף — האם הקול נעים מספיק?</b> זו השאלה
   שתכריע, כי המחיר על שליטה מלאה בהגייה הוא קול פחות טבעי. תשווה
   את שני המודלים על אותה מילה.</p>
</div>
</html>`, 'utf8');

  console.log('\n  ' + path.join(OUT, 'listen.html'));
  console.log('');
})().catch(e => { console.error('\n' + e.message + '\n'); process.exit(1); });
