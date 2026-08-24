/* =====================================================================
   DriveWise · האם ג'מיני מקריא עברית טוב יותר?
   כלי פיתוח. אפס תלויות.

   השאלה אחת ומדויקת: מנוע ההקראה הנוכחי אינו מבין את המשפט, ולכן
   הוא מנחש ב"נהג", ב"קדימה" וב"בנסיעה". מודל שמייצר אודיו מתוך
   הבנת הטקסט אמור לפתור את זה בלי שום טבלת חוקים.

   לכן ארבעה משפטים אמיתיים מהמאגר, כאלה שנבחרו בדיוק על המילים
   שאין להן פתרון היום, ולצד כל אחד ההקלטה הקיימת מהדיסק — אותו
   משפט, שני מנועים, זה מול זה.

   מה שלא נבדק כאן, במתכוון: פורמט, עלות ומכסה. אם העברית לא טובה
   יותר, אין טעם לדבר עליהם. אם היא כן — נדבר.

   הערה על הפורמט: המודל מחזיר PCM גולמי, ולכן נוספת כאן כותרת WAV
   בת 44 בייט. זה מספיק לדפדפן ולבדיקה, ואינו פתרון לייצור: WAV
   שוקל פי עשרה מ-MP3, ובנפח המאגר זה ההבדל בין 105 מגה ל-1.3 ג'יגה.

   מפתח: GEMINI_KEY, ואם אין — TTS_KEY. זהו Generative Language API,
   לא Cloud TTS, וייתכן שהמפתח הקיים לא יעבוד עליו. שגיאה כזאת היא
   תוצאה ברורה ולא תקלה.

   הרצה: run-gemini-probe.cmd
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const B = require('./bank');

const KEY = process.env.GEMINI_KEY || process.env.TTS_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICE = 'Kore';                       /* קול נשי, ברירת מחדל של המודל */
const OUT = path.join(__dirname, 'samples', 'gemini');
const API = 'https://generativelanguage.googleapis.com/v1beta';

/* המילים שאין להן פתרון היום, ולכן הן המבחן */
const WANTED = ['נהג', 'בנסיעה', 'זכות קדימה', 'מותר'];

function checkKey(){
  if(!KEY) throw new Error('חסר GEMINI_KEY בסביבה. הרץ דרך run-gemini-probe.cmd');
  const i = [...KEY].findIndex(c => c.codePointAt(0) > 126 || c.codePointAt(0) < 32);
  if(i === -1) return;
  const cp = KEY.codePointAt(i);
  throw new Error(
    'API key has a non-ASCII character at position ' + (i + 1) + ' (code ' + cp + ').' +
    (cp < 32 ? '  Right-click pastes in this window; Ctrl+V types ^V.'
             : '  Switch the keyboard to English and paste again.') +
    '  The key itself was never read or stored.');
}

/* PCM 16 ביט חתום, מונו → WAV. 44 בייט של כותרת, בלי ספרייה. */
function wav(pcm, rate){
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);         h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);         h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);    h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);     h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);    h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function listModels(){
  const r = await fetch(API + '/models?key=' + encodeURIComponent(KEY));
  if(!r.ok) return { err: r.status + ': ' + (await r.text()).slice(0, 200) };
  const j = await r.json();
  return { models: (j.models || []).map(m => m.name.replace('models/', '')) };
}

async function speak(text){
  const r = await fetch(API + '/models/' + MODEL + ':generateContent?key=' +
                        encodeURIComponent(KEY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
      }
    })
  });
  const body = await r.text();
  if(!r.ok){
    let msg = body;
    try { msg = JSON.parse(body).error.message; } catch(e){}
    throw new Error(r.status + ': ' + String(msg).slice(0, 220));
  }
  const j = JSON.parse(body);
  const part = (((j.candidates || [])[0] || {}).content || {}).parts;
  const inline = (part || []).map(p => p.inlineData).filter(Boolean)[0];
  if(!inline) throw new Error('לא הוחזר אודיו. ' + JSON.stringify(j).slice(0, 220));
  const rate = Number((/rate=(\d+)/.exec(inline.mimeType || '') || [])[1]) || 24000;
  return { pcm: Buffer.from(inline.data, 'base64'), rate, mime: inline.mimeType };
}

(async function main(){
  checkKey();
  fs.mkdirSync(OUT, { recursive: true });

  /* אילו מודלים בכלל זמינים למפתח הזה — כדי ששם מודל שהתיישן
     יתגלה כאן ולא כשגיאה סתומה באמצע */
  const m = await listModels();
  if(m.err) console.log('\n  רשימת המודלים נכשלה — ' + m.err);
  else {
    const tts = m.models.filter(x => /tts|audio|live/i.test(x));
    console.log('\n  מודלים עם אודיו: ' + (tts.join(', ') || '(לא נמצאו)'));
    console.log('  בשימוש כאן      : ' + MODEL +
                (m.models.includes(MODEL) ? '  ✓' : '  ✗ אינו ברשימה'));
  }

  /* מוצאים משפט אמיתי לכל מילה, ומעתיקים לצידו את ההקלטה הקיימת */
  const bank = B.collect('he');
  const picks = [];
  for(const w of WANTED){
    const hit = bank.find(x => x.text.includes(w) && x.text.length > 25 &&
                               x.text.length < 90 && !picks.some(p => p.item === x));
    if(hit) picks.push({ word: w, item: hit });
  }

  console.log('');
  const rows = [];
  for(const p of picks){
    const stem = p.word.replace(/\s+/g, '-');
    let note = '';
    try {
      const { pcm, rate, mime } = await speak(p.item.text);
      fs.writeFileSync(path.join(OUT, stem + '.wav'), wav(pcm, rate));
      note = (pcm.length / 2 / rate).toFixed(2) + 's   ' + mime;
    } catch(e){ note = '✗ ' + e.message; }

    /* ההקלטה הקיימת, מהדיסק, בלי קריאה ל-API */
    const cur = path.join(__dirname, '..', 'audio', 'he', 'aoede', p.item.id + '.mp3');
    let has = false;
    try { fs.copyFileSync(cur, path.join(OUT, stem + '-now.mp3')); has = true; } catch(e){}

    console.log('  ' + p.word.padEnd(12) + note);
    rows.push({ ...p, stem, note, has });
  }

  const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<title>ג'מיני מול המנוע הנוכחי</title>
<style>
 body{font:16px system-ui;max-width:46rem;margin:3rem auto;padding:0 1rem;background:#faf9f7}
 .p{background:#fff;border:1px solid #e5e2dc;border-radius:.5rem;padding:1rem;margin:1.5rem 0}
 h2{font-size:1rem;margin:0 0 .25rem;font-weight:600}
 .w{color:#888;font-size:.85rem;margin:0 0 .75rem}
 .r{display:flex;gap:1rem;align-items:center;margin:.5rem 0}
 b{width:6rem;display:inline-block;font-weight:500}
 .err{color:#a11;font-size:.9rem}
</style>
<h1>אותו משפט, שני מנועים</h1>
<p>המשפטים נבחרו על המילים שאין להן פתרון היום. השאלה אחת: האם
   ג'מיני קורא אותן נכון בלי שאף אחד אמר לו איך.</p>
${rows.map(r => `<div class="p">
  <h2>${r.item.text}</h2>
  <p class="w">המילה שנבדקת: <b style="width:auto">${r.word}</b></p>
  ${r.note.startsWith('✗')
    ? `<p class="err">${r.note}</p>`
    : `<div class="r"><b>ג'מיני</b><audio controls src="${r.stem}.wav"></audio></div>`}
  ${r.has ? `<div class="r"><b>היום</b><audio controls src="${r.stem}-now.mp3"></audio></div>` : ''}
</div>`).join('')}
<p><b>מה לשמוע:</b> לא איכות הקול ולא הנעימות — אלא האם המילה המסומנת
   נאמרת נכון. אם כן, כל 107 חוקי ההגייה מיותרים.</p>
</html>`;
  fs.writeFileSync(path.join(OUT, 'listen.html'), html, 'utf8');
  console.log('\n  ' + path.join(OUT, 'listen.html') + '\n');
})().catch(e => { console.error('\n' + e.message + '\n'); process.exit(1); });
