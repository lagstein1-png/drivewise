#!/usr/bin/env node
/* =====================================================================
   DriveWise · ייצור קבצי הקראה
   כלי פיתוח — לא חלק מהאפליקציה ולא נטען אליה. האפליקציה נשארת
   index.html אחד בלי תלויות.

   הרעיון: משלמים פעם אחת, כאן, על המחשב שלך. התוצאה היא קבצי MP3
   רגילים שיושבים ב-audio/ ומוגשים כקבצים סטטיים. בזמן ריצה אין מפתח,
   אין קריאת רשת לספק, אין חשבון חודשי, וזה עובד גם בלי אינטרנט.

   המפתח נקרא ממשתנה סביבה בלבד. הוא לא נכתב לשום קובץ ולא נכנס ל-repo.

     תכנון ועלויות (בלי מפתח):
       node tools/tts-build.js plan
     דגימות להשוואה:
       TTS_KEY=xxx node tools/tts-build.js sample --provider gcloud
     ייצור מלא:
       TTS_KEY=xxx node tools/tts-build.js all --provider gcloud --voice he-IL-Chirp3-HD-Kore --yes
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KEY = process.env.TTS_KEY || '';
const AZURE_REGION = process.env.AZURE_REGION || 'westeurope';

/* משפט מבחן אמיתי מהמאגר: ספרות, מונחי תנועה וסוגריים — בדיוק
   המקומות שבהם מנועי הקראה נשברים */
const SAMPLE_TEXT =
  'ברחוב הרצל סומנו 4 מקומות חנייה רצופים לנכים. ' +
  'לרכב ללא תווית חנייה כבתמרור אסור לחנות בחניית נכים, ' +
  'גם אם המקומות שיועדו לנכים פנויים כולם.';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------------- ספקים ---------------- */
/* כל ספק מחזיר Buffer של MP3, ויודע למנות את הקולות שלו. */
const PROVIDERS = {
  gcloud: {
    price: 30,                    /* דולר למיליון תווים, Chirp 3 HD */
    async voices(lang){
      const r = await fetch('https://texttospeech.googleapis.com/v1/voices?languageCode=' + lang,
                            { headers: { 'x-goog-api-key': KEY } });
      if(!r.ok) throw new Error('gcloud voices ' + r.status + ' ' + await r.text());
      const j = await r.json();
      return (j.voices || []).map(v => ({ id: v.name, gender: v.ssmlGender }));
    },
    async speak(text, lang, voiceId){
      const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: lang, name: voiceId },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 }
        })
      });
      if(!r.ok) throw new Error('gcloud ' + r.status + ' ' + await r.text());
      const j = await r.json();
      return Buffer.from(j.audioContent, 'base64');
    }
  },

  azure: {
    price: 16,
    async voices(lang){
      const url = 'https://' + AZURE_REGION + '.tts.speech.microsoft.com/cognitiveservices/voices/list';
      const r = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': KEY } });
      if(!r.ok) throw new Error('azure voices ' + r.status + ' ' + await r.text());
      const j = await r.json();
      return j.filter(v => v.Locale === lang).map(v => ({ id: v.ShortName, gender: v.Gender }));
    },
    async speak(text, lang, voiceId){
      const ssml = '<speak version="1.0" xml:lang="' + lang + '">'
                 + '<voice xml:lang="' + lang + '" name="' + voiceId + '">'
                 + esc(text) + '</voice></speak>';
      const url = 'https://' + AZURE_REGION + '.tts.speech.microsoft.com/cognitiveservices/v1';
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
        },
        body: ssml
      });
      if(!r.ok) throw new Error('azure ' + r.status + ' ' + await r.text());
      return Buffer.from(await r.arrayBuffer());
    }
  },

  elevenlabs: {
    price: 150,
    /* eleven_multilingual_v2 אינו תומך בעברית — רק v3. זה הבאג שקיים
       גם ב-index.html, ולכן המסלול הזה מעולם לא עבד בעברית. */
    model: 'eleven_v3',
    async voices(){
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': KEY } });
      if(!r.ok) throw new Error('elevenlabs voices ' + r.status + ' ' + await r.text());
      const j = await r.json();
      return (j.voices || []).map(v => ({ id: v.voice_id, name: v.name, gender: (v.labels || {}).gender }));
    },
    async speak(text, lang, voiceId){
      const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
        method: 'POST',
        headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: PROVIDERS.elevenlabs.model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      });
      if(!r.ok) throw new Error('elevenlabs ' + r.status + ' ' + await r.text());
      return Buffer.from(await r.arrayBuffer());
    }
  }
};

/* ---------------- רשימת המחרוזות להקראה ---------------- */
/* חייב להיות זהה בתו ל-audioId שב-index.html, אחרת הקבצים שייוצרו
   כאן לא יימצאו שם. cyrb53 — 53 ביט, הסתברות התנגשות זניחה על
   ~6,700 מחרוזות. */
function audioId(text){
  const s = String(text).trim().replace(/\s+/g, ' ');
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for(let i = 0; i < s.length; i++){
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* מזהה נגזר מהתוכן, ולכן טקסט שחוזר בכמה שאלות מיוצר פעם אחת בלבד. */
function collect(lang){
  const qf = path.join(ROOT, 'data', 'questions.' + lang + '.json');
  if(!fs.existsSync(qf)) throw new Error('אין קובץ שאלות: ' + qf);
  const raw = JSON.parse(fs.readFileSync(qf, 'utf8'));
  const items = Array.isArray(raw) ? raw : (raw.items || Object.values(raw)[0]);

  const out = [];
  const seen = new Set();
  let dupes = 0;
  const add = (text) => {
    if(!text || typeof text !== 'string') return;
    const t = text.trim().replace(/\s+/g, ' ');
    if(!t) return;
    const id = audioId(t);
    if(seen.has(id)){ dupes++; return; }
    seen.add(id);
    out.push({ id, text: t });
  };

  for(const it of items){
    add(it.q);
    (it.o || []).forEach(add);
  }

  const hf = path.join(ROOT, 'data', 'hints.' + lang + '.json');
  if(fs.existsSync(hf)){
    const hints = JSON.parse(fs.readFileSync(hf, 'utf8'));
    for(const h of Object.values(hints)){
      if(typeof h === 'string') add(h);
      else if(h && typeof h === 'object'){
        add(h.h1 || h.hint1);
        add(h.h2 || h.hint2);
        add(h.p || h.explain);
      }
    }
  }
  out.dupes = dupes;
  return out;
}

/* ---------------- עזרים ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, label, tries = 4){
  let last;
  for(let i = 0; i < tries; i++){
    try{ return await fn(); }
    catch(e){
      last = e;
      const transient = /429|500|502|503|504|ETIMEDOUT|ECONNRESET/.test(e.message);
      if(!transient) throw e;            /* שגיאת הגדרה — אין טעם לנסות שוב */
      const wait = 800 * Math.pow(2, i);
      console.warn('\n  ↻ ' + label + ' נכשל (' + e.message.slice(0, 80) + ') — עוד ' + wait + 'ms');
      await sleep(wait);
    }
  }
  throw last;
}

/* מריץ במקביל אבל בקצב מוגבל — חריגה מקצב עולה בשגיאות 429 */
async function pool(items, limit, worker){
  let i = 0, done = 0;
  const run = async () => {
    while(i < items.length){
      const k = i++;
      await worker(items[k], k);
      done++;
      if(done % 50 === 0 || done === items.length){
        process.stdout.write('\r  ' + done + '/' + items.length);
      }
    }
  };
  await Promise.all(Array.from({ length: limit }, run));
  process.stdout.write('\n');
}

/* ---------------- פקודות ---------------- */
async function cmdSample(prov, lang, outDir){
  const P = PROVIDERS[prov];
  console.log('\nמושך את רשימת הקולות של ' + prov + ' עבור ' + lang + '…');
  const voices = await P.voices(lang);
  if(prov === 'elevenlabs'){
    console.log('  (ב-ElevenLabs הקולות אינם לפי שפה — כולם מנוגנים בעברית דרך v3)');
  }
  if(!voices.length){ console.log('לא נמצאו קולות.'); return; }

  console.log('נמצאו ' + voices.length + ' קולות. מייצר דגימה לכל אחד.');
  fs.mkdirSync(outDir, { recursive: true });

  const made = [];
  await pool(voices, 3, async (v) => {
    const safe = String(v.id).replace(/[^\w.-]/g, '_');
    try{
      const buf = await withRetry(() => P.speak(SAMPLE_TEXT, lang, v.id), v.id);
      fs.writeFileSync(path.join(outDir, safe + '.mp3'), buf);
      made.push({ name: v.name, id: v.id, gender: v.gender, file: safe + '.mp3' });
    }catch(e){
      console.warn('\n  ✗ ' + v.id + ': ' + e.message.slice(0, 120));
    }
  });

  writeCompare(outDir, prov, made);
  const chars = SAMPLE_TEXT.length * made.length;
  console.log('\n✓ ' + made.length + ' דגימות ב-' + outDir);
  console.log('  ' + chars.toLocaleString() + ' תווים · כ-$' + (chars / 1e6 * P.price).toFixed(4));
  console.log('  פתח: ' + path.join(outDir, 'compare.html'));
}

function writeCompare(dir, prov, voices){
  const rows = voices.map(v =>
    '    <tr><td class="n">' + esc(v.name || v.id) + '</td>' +
    '<td class="g">' + esc(v.gender || '') + '</td>' +
    '<td><audio controls preload="none" src="' + esc(v.file) + '"></audio></td></tr>'
  ).join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="he" dir="rtl"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>השוואת קולות · ' + esc(prov) + '</title>',
    '<style>',
    '  body{font-family:system-ui,"Segoe UI",Arial,sans-serif;margin:0;padding:24px;',
    '       background:#E7EDF4;color:#0E1F33;line-height:1.6}',
    '  h1{font-size:22px;margin:0 0 12px}',
    '  p.t{background:#fff;border:3px solid #D9A400;border-radius:14px;padding:14px 16px;',
    '      font-size:18px;font-weight:600;margin:0 0 20px}',
    '  table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}',
    '  td{padding:10px 12px;border-bottom:1px solid #C4D1DE;vertical-align:middle}',
    '  td.n{font-weight:700;direction:ltr;text-align:right;white-space:nowrap}',
    '  td.g{color:#5A6B7E;font-size:14px}',
    '  audio{width:100%;min-width:240px}',
    '</style></head><body>',
    '<h1>השוואת קולות — ' + esc(prov) + '</h1>',
    '<p class="t">' + esc(SAMPLE_TEXT) + '</p>',
    '<table>',
    rows,
    '</table>',
    '</body></html>'
  ].join('\n');

  fs.writeFileSync(path.join(dir, 'compare.html'), html, 'utf8');
}

async function cmdAll(prov, lang, voiceId, confirmed){
  if(!voiceId) throw new Error('חסר --voice');
  const P = PROVIDERS[prov];
  const langCode = lang === 'he' ? 'he-IL' : lang;
  const list = collect(lang);
  const outDir = path.join(ROOT, 'audio', lang);
  fs.mkdirSync(outDir, { recursive: true });

  const todo = list.filter(x => !fs.existsSync(path.join(outDir, x.id + '.mp3')));
  const chars = todo.reduce((s, x) => s + x.text.length, 0);

  console.log('\nשפה: ' + lang + ' · ספק: ' + prov + ' · קול: ' + voiceId);
  console.log('סה"כ מחרוזות: ' + list.length.toLocaleString() + ' · חסרות: ' + todo.length.toLocaleString());
  console.log('תווים לייצור: ' + chars.toLocaleString() +
              ' · הערכת עלות: $' + (chars / 1e6 * P.price).toFixed(2));
  if(!todo.length){ console.log('הכול כבר קיים.'); return; }
  if(!confirmed){ console.log('\nלביצוע בפועל הוסף --yes'); return; }

  let bytes = 0, failed = 0;
  await pool(todo, 4, async (item) => {
    try{
      const buf = await withRetry(() => P.speak(item.text, langCode, voiceId), item.id);
      fs.writeFileSync(path.join(outDir, item.id + '.mp3'), buf);
      bytes += buf.length;
    }catch(e){
      failed++;
      console.warn('\n  ✗ ' + item.id + ': ' + e.message.slice(0, 120));
    }
  });

  console.log('\n✓ נוצרו ' + (todo.length - failed).toLocaleString() + ' קבצים · ' +
              (bytes / 1048576).toFixed(1) + 'MB' + (failed ? ' · ' + failed + ' כשלונות' : ''));
  console.log('  הרצה חוזרת תשלים רק את מה שחסר.');
}

function cmdPlan(lang){
  const list = collect(lang);
  const chars = list.reduce((s, x) => s + x.text.length, 0);
  console.log('\nשפה: ' + lang);
  console.log('מחרוזות ייחודיות: ' + list.length.toLocaleString() +
              (list.dupes ? '  (' + list.dupes.toLocaleString() + ' כפילויות אוחדו)' : ''));
  console.log('תווים:            ' + chars.toLocaleString());
  console.log('\nעלות ייצור חד-פעמית (לפני המכסה החינמית):');
  for(const [n, p] of Object.entries(PROVIDERS)){
    console.log('  ' + n.padEnd(12) + '$' + (chars / 1e6 * p.price).toFixed(2));
  }
  console.log('\nהערכת גודל על הדיסק: ~' + Math.round(list.length * 12 / 1024) + 'MB (48kbps mono)');
}

/* ---------------- כניסה ---------------- */
(async () => {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const arg = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : d; };
  const prov = arg('provider', 'gcloud');
  const lang = arg('lang', 'he');

  if(cmd === 'plan') return cmdPlan(lang);

  if(!PROVIDERS[prov]) throw new Error('ספק לא מוכר: ' + prov);
  if(!KEY) throw new Error('חסר TTS_KEY בסביבה.  TTS_KEY=xxx node tools/tts-build.js …');

  const langCode = lang === 'he' ? 'he-IL' : lang;
  if(cmd === 'sample'){
    return cmdSample(prov, langCode, arg('out', path.join(ROOT, 'tools', 'samples', prov)));
  }
  if(cmd === 'all'){
    return cmdAll(prov, lang, arg('voice'), argv.includes('--yes'));
  }

  console.log([
    'שימוש:',
    '  node tools/tts-build.js plan [--lang he]',
    '  TTS_KEY=xxx node tools/tts-build.js sample --provider gcloud|azure|elevenlabs',
    '  TTS_KEY=xxx node tools/tts-build.js all --provider gcloud --voice <id> --yes'
  ].join('\n'));
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
