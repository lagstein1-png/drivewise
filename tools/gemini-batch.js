/* =====================================================================
   DriveWise · אצווה מדודה מול ג'מיני
   כלי פיתוח. תלות אחת חיצונית: ffmpeg, מקומי בלבד.

   הפרוב ענה על "האם הוא קורא עברית נכון". כאן נמדד מה שנשאר, וזה
   מה שיכריע אם אפשר להחליף מנוע בכלל:

     קצב      — כמה מחרוזות בדקה, וכמה 429 בדרך
     זמן      — מכאן נגזרת ההערכה ל-6,823 המחרוזות של קול אחד
     נפח      — אחרי קידוד ל-MP3, מול 105 המגה של היום
     תווים    — הבסיס לחישוב עלות מול המכסה

   ההמרה: המודל מחזיר PCM 16 ביט מונו. ffmpeg מקודד ל-MP3 בקצב
   סיביות שתואם את ההקלטות הקיימות, כדי שההשוואה תהיה הוגנת.

   ffmpeg אינו נכנס ל-repo ואינו נדרש לאפליקציה. הוא נדרש רק כאן,
   על המחשב שמייצר את ההקלטות, בדיוק כמו node.

   הרצה: run-gemini-batch.cmd [כמה]     ברירת מחדל 50
   ===================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const B = require('./bank');
const { forSpeech } = require('./speech');

const KEY = process.env.GEMINI_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICE = process.env.GEMINI_VOICE || 'Kore';
const COUNT = Math.max(1, Math.min(500, parseInt(process.argv[2], 10) || 50));
const OUT = path.join(__dirname, 'samples', 'gemini-batch');
const API = 'https://generativelanguage.googleapis.com/v1beta';
const KBPS = 32;                     /* תואם בקירוב ל-105MB per voice היום */

function checkKey(){
  if(!KEY) throw new Error('חסר GEMINI_KEY. הרץ דרך run-gemini-batch.cmd');
  const i = [...KEY].findIndex(c => c.codePointAt(0) > 126 || c.codePointAt(0) < 32);
  if(i === -1) return;
  throw new Error('API key has a non-ASCII character at position ' + (i + 1) +
    ' (code ' + KEY.codePointAt(i) + ').  The key itself was never read or stored.');
}

function checkFfmpeg(){
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if(r.error || r.status !== 0){
    throw new Error('ffmpeg לא נמצא ב-PATH.\n' +
      '  התקנה: winget install Gyan.FFmpeg    ואז לפתוח חלון cmd חדש.\n' +
      '  הוא נדרש רק כאן, ואינו חלק מהאפליקציה.');
  }
  return (r.stdout.split('\n')[0] || '').trim();
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
  if(!r.ok){
    const body = await r.text();
    let msg = body;
    try { msg = JSON.parse(body).error.message; } catch(e){}
    const err = new Error(String(msg).slice(0, 160));
    err.status = r.status;
    throw err;
  }
  const j = await r.json();
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const inline = parts.map(p => p.inlineData).filter(Boolean)[0];
  if(!inline) throw new Error('לא הוחזר אודיו');
  const rate = Number((/rate=(\d+)/.exec(inline.mimeType || '') || [])[1]) || 24000;
  return { pcm: Buffer.from(inline.data, 'base64'), rate };
}

/* PCM → MP3. דרך קובץ זמני, כי ffmpeg בצינור על חלונות שביר. */
function toMp3(pcm, rate, dest){
  const tmp = path.join(os.tmpdir(), 'dw-' + process.pid + '-' + Date.now() + '.pcm');
  fs.writeFileSync(tmp, pcm);
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', tmp,
      '-b:a', KBPS + 'k', dest]);
  } finally { try { fs.unlinkSync(tmp); } catch(e){} }
}

const fmt = n => n.toLocaleString('he-IL');

(async function main(){
  checkKey();
  const ver = checkFfmpeg();
  fs.mkdirSync(OUT, { recursive: true });

  const bank = B.collect('he');
  /* דגימה פרוסה על כל המאגר, לא 50 הראשונות — כדי שהאורך הממוצע
     ישקף את המאגר ולא את תחילתו. */
  const step = Math.max(1, Math.floor(bank.length / COUNT));
  const pick = [];
  for(let i = 0; pick.length < COUNT && i < bank.length; i += step) pick.push(bank[i]);

  console.log('\n  מודל  : ' + MODEL + '   קול: ' + VOICE);
  console.log('  ' + ver);
  console.log('  אצווה : ' + COUNT + ' מחרוזות, פרוסות על ' + fmt(bank.length) + '\n');

  let ok = 0, fail = 0, tooMany = 0, chars = 0, bytes = 0, audioSec = 0;
  const errs = new Map();
  const t0 = Date.now();

  for(const [i, item] of pick.entries()){
    const text = forSpeech(item.text);
    try {
      const { pcm, rate } = await speak(text);
      const dest = path.join(OUT, item.id + '.mp3');
      toMp3(pcm, rate, dest);
      ok++;
      chars += text.length;
      bytes += fs.statSync(dest).size;
      audioSec += pcm.length / 2 / rate;
    } catch(e){
      fail++;
      if(e.status === 429) tooMany++;
      const k = (e.status || '?') + ': ' + e.message.slice(0, 70);
      errs.set(k, (errs.get(k) || 0) + 1);
    }
    if((i + 1) % 10 === 0 || i + 1 === pick.length){
      const el = (Date.now() - t0) / 1000;
      process.stdout.write('\r  ' + (i + 1) + '/' + COUNT +
        '   ' + ((i + 1) / el).toFixed(2) + '/שנייה' +
        (fail ? '   נכשלו: ' + fail : '') + '        ');
    }
  }

  const el = (Date.now() - t0) / 1000;
  const rate = ok / el;
  console.log('\n');
  console.log('  ' + '─'.repeat(58));
  console.log('  הצליחו : ' + ok + ' מתוך ' + COUNT +
              (fail ? '   נכשלו: ' + fail + (tooMany ? '  (מתוכם ' + tooMany + ' חריגת קצב)' : '') : ''));
  for(const [k, n] of errs) console.log('     ×' + n + '  ' + k);
  if(!ok){ console.log('\n  אין על מה למדוד.\n'); return; }

  console.log('  זמן    : ' + el.toFixed(1) + ' שניות   ·   ' + rate.toFixed(2) + ' מחרוזות לשנייה');
  console.log('  אודיו  : ' + audioSec.toFixed(1) + ' שניות דיבור');
  console.log('  נפח    : ' + (bytes / 1024).toFixed(0) + 'KB אחרי MP3 ב-' + KBPS + 'kbps');
  console.log('  תווים  : ' + fmt(chars));
  console.log('  ' + '─'.repeat(58));

  /* הרחבה ל-6,823 — קול אחד */
  const N = bank.length;
  const f = N / ok;
  const secs = el * f;
  console.log('\n  הרחבה לקול אחד (' + fmt(N) + ' מחרוזות):');
  console.log('    זמן  : ' + (secs / 60).toFixed(0) + ' דקות' +
              (secs > 5400 ? '  ← ' + (secs / 3600).toFixed(1) + ' שעות' : ''));
  console.log('    נפח  : ' + (bytes * f / 1048576).toFixed(0) + 'MB   (היום 105MB)');
  console.log('    תווים: ' + fmt(Math.round(chars * f)));
  console.log('    אודיו: ' + (audioSec * f / 3600).toFixed(1) + ' שעות   (היום 7.6)');
  console.log('\n  ולארבעה קולות: ' + (secs * 4 / 3600).toFixed(1) + ' שעות · ' +
              fmt(Math.round(chars * f * 4)) + ' תווים\n');

  if(tooMany) console.log('  ⚠ נרשמו חריגות קצב. במכסה החינמית זה יגדיל את הזמן משמעותית.\n');
})().catch(e => { console.error('\n' + e.message + '\n'); process.exit(1); });
