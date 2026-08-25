/* =====================================================================
   DriveWise · האם Vertex מגיש את מודלי ההקראה?
   כלי פיתוח. אפס תלויות npm. דורש gcloud מותקן ומאומת.

   מסלול AI Studio הוכיח שג'מיני קורא עברית נכון, והוכיח גם שהמכסה
   שלו לא מיועדת לנפח: 200 קבצים ביום, מול 6,823 שצריך. Vertex הוא
   אותם מודלים דרך שירות Cloud רגיל, עם מכסות שמנוהלות ומוגדלות
   כמו כל שירות אחר.

   מה שלא ידוע, ולכן נבדק כאן ולא מונח: האם מודלי ה-TTS מוגשים שם
   בכלל, ועם פלט אודיו. מודלי preview מגיעים ל-Vertex באיחור
   ולפעמים לא מגיעים.

   שלושה מודלים על שני אזורים, שש בקשות של שתי מילים. מי שעונה עם
   אודיו נשמר כקובץ כדי שאפשר יהיה גם לשמוע אותו.

   אין כאן מפתח API. האימות הוא הטוקן של gcloud, שנשמר במחשב ולא
   עובר בשום מקום — וזו גם הסיבה שהבעיה של מפתח בצילום מסך נעלמת.

   הרצה: run-vertex-probe.cmd
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const OUT = path.join(__dirname, 'samples', 'vertex');
const VOICE = process.env.GEMINI_VOICE || 'Kore';
const TEXT = 'זכות קדימה.';

const MODELS = [
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
  'gemini-3.1-flash-tts-preview'
];
const LOCATIONS = ['us-central1', 'global'];

/* gcloud הוא תלות חיצונית ומקומית, כמו ffmpeg. נבדק פעם אחת
   ובהודעה שאומרת מה להתקין, לא בשגיאה גולמית. */
function gcloud(args){
  /* על חלונות gcloud הוא סקריפט ולא קובץ הרצה, ולכן צריך מעטפת.
     הפקודה נבנית כמחרוזת אחת ולא כמערך עם shell — הצירוף הזה
     מוציא אזהרת הוצאה משימוש, והארגומנטים כאן שלנו ממילא. */
  const r = spawnSync('gcloud ' + args.join(' '), { encoding: 'utf8', shell: true });
  if(r.error || r.status !== 0){
    const msg = ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 300);
    throw new Error('gcloud ' + args.join(' ') + ' נכשל.\n  ' + (msg || 'לא נמצא ב-PATH'));
  }
  return (r.stdout || '').trim();
}

function token(){
  try { return gcloud(['auth', 'print-access-token']); }
  catch(e){
    throw new Error(e.message + '\n\n' +
      '  אם gcloud מותקן אך לא מאומת:\n' +
      '    gcloud auth login\n' +
      '    gcloud auth application-default login\n' +
      '  אם אינו מותקן:\n' +
      '    winget install Google.CloudSDK   ואז לפתוח חלון חדש.');
  }
}

function project(){
  const p = process.env.VERTEX_PROJECT || gcloud(['config', 'get-value', 'project']);
  if(!p || p === '(unset)') throw new Error(
    'לא הוגדר פרויקט. הרץ:  gcloud config set project <PROJECT_ID>\n' +
    '  או העבר אותו כארגומנט ראשון.');
  return p;
}

function host(loc){
  return loc === 'global'
    ? 'https://aiplatform.googleapis.com'
    : 'https://' + loc + '-aiplatform.googleapis.com';
}

async function tryOne(tok, proj, loc, model){
  const url = host(loc) + '/v1/projects/' + proj + '/locations/' + loc +
              '/publishers/google/models/' + model + ':generateContent';
  const t0 = Date.now();
  try{
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: TEXT }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
        }
      })
    });
    const ms = Date.now() - t0;
    const body = await r.text();
    if(!r.ok){
      let msg = body;
      try { msg = JSON.parse(body).error.message; } catch(e){}
      return { ok:false, status:r.status, ms, msg:String(msg).replace(/\s+/g, ' ').slice(0, 100) };
    }
    const j = JSON.parse(body);
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const inline = parts.map(p => p.inlineData).filter(Boolean)[0];
    if(!inline || !inline.data) return { ok:false, status:200, ms, msg:'תשובה בלי אודיו' };
    const pcm = Buffer.from(inline.data, 'base64');
    return { ok:true, ms, pcm, mime: inline.mimeType };
  }catch(e){
    return { ok:false, status:0, ms:Date.now() - t0, msg:e.message.slice(0, 100) };
  }
}

/* PCM → WAV, 44 בייט של כותרת. מספיק כדי לשמוע; הייצור יקודד ל-MP3. */
function wav(pcm, rate){
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);            h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);            h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);       h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);        h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);       h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const P = (s, n) => String(s).padEnd(n);

(async function main(){
  const tok = token();
  const proj = process.argv[2] || project();
  fs.mkdirSync(OUT, { recursive: true });

  console.log('\n  פרויקט: ' + proj + '   קול: ' + VOICE + '   "' + TEXT + '"\n');
  console.log('  ' + P('אזור', 14) + P('מודל', 34) + P('מצב', 12) + 'פרטים');
  console.log('  ' + '─'.repeat(88));

  const open = [];
  for(const loc of LOCATIONS){
    for(const model of MODELS){
      const r = await tryOne(tok, proj, loc, model);
      if(r.ok){
        const rate = Number((/rate=(\d+)/.exec(r.mime || '') || [])[1]) || 24000;
        const file = path.join(OUT, loc + '-' + model + '.wav');
        fs.writeFileSync(file, wav(r.pcm, rate));
        open.push({ loc, model, ms: r.ms });
        console.log('  ' + P(loc, 14) + P(model, 34) + P('✓ אודיו', 12) +
                    (r.pcm.length / 1024).toFixed(0) + 'KB · ' + r.ms + 'ms');
      } else {
        const label = r.status === 403 ? '✗ אין גישה'
                    : r.status === 404 ? '✗ לא קיים'
                    : r.status === 429 ? '✗ מכסה'
                    : r.status === 400 ? '✗ לא מקבל'
                    : '✗ ' + (r.status || 'רשת');
        console.log('  ' + P(loc, 14) + P(model, 34) + P(label, 12) + r.msg);
      }
    }
  }

  console.log('');
  if(!open.length){
    console.log('  Vertex אינו מגיש את מודלי ההקראה האלה לפרויקט הזה.');
    console.log('  אם הסטטוס היה 403 — ייתכן שצריך להפעיל את השירות:');
    console.log('    gcloud services enable aiplatform.googleapis.com\n');
    return;
  }
  open.sort((a, b) => a.ms - b.ms);
  console.log('  עונים עם אודיו: ' + open.length + '. הקבצים ב-tools/samples/vertex');
  console.log('  המהיר: ' + open[0].model + ' באזור ' + open[0].loc + '\n');
})().catch(e => { console.error('\n' + e.message + '\n'); process.exit(1); });
