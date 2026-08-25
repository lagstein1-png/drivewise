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
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const KEY = process.env.TTS_KEY || '';
const AZURE_REGION = process.env.AZURE_REGION || 'westeurope';

/* ג'מיני יושב על Generative Language API, שירות אחר עם מפתח אחר.
   נופלים ל-TTS_KEY רק כדי שהרצה עם מפתח יחיד לא תיפול על טעות
   הגדרה שקטה. */
const GEMINI_KEY   = process.env.GEMINI_KEY || KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-tts-preview';
const GEMINI_MP3_KBPS = 32;      /* מתיישר עם קצב הסיביות של ההקלטות הקיימות */

/* המפתח נוסע בכותרת HTTP, וכותרות מוגבלות ל-Latin-1. תו יחיד מחוץ
   לטווח מפיל כל בקשה עוד לפני שהיא יוצאת, עם הודעה על ByteString
   שאינה מזכירה מפתח במילה אחת — וכך שעה שלמה של הקלטות נשרפת על
   אותה שגיאה חוזרת.

   זה קרה: המפתח הודבק בזמן שפריסת המקלדת הייתה בעברית, וכל תו
   לטיני יצא כאות עברית. בודקים כאן, פעם אחת, לפני הכול.

   הבדיקה לא נוגעת בתוכן המפתח ולא מדפיסה אותו — רק אומרת היכן
   התו הראשון שאינו ASCII.

   השורה הראשונה בהודעה היא אנגלית, וזו לא קוסמטיקה. ההודעה הזאת
   מדווחת על תו שהקונסולה לא יודעת להציג, ולכן היא בדיוק ההודעה
   שתגיע כסימני שאלה — הסבר על בעיית קידוד שאי אפשר לקרוא בגלל
   בעיית קידוד. האנגלית עוברת בכל דף קוד, גם כשהעברית שאחריה לא. */
/* הבודק מקבל את המפתח שבאמת ייצא לדרך. ג'מיני יושב על GEMINI_KEY,
   ובלי הפרמטר הזה TTS_KEY פגום היה חוסם גם מסלול שאינו נוגע בו. */
function checkKey(key){
  if(key === undefined) key = KEY;
  if(!key) return;
  const i = [...key].findIndex(c => c.codePointAt(0) > 126 || c.codePointAt(0) < 32);
  if(i === -1) return;
  const cp = key.codePointAt(i);
  const heb  = cp >= 0x0590 && cp <= 0x05FF;
  /* תו בקרה, וכמעט תמיד קוד 22: זה מה ש-Ctrl+V מקליד בקונסולה
     שאינה מדביקה איתו. המפתח לא הגיע כלל, והכוכבית היחידה על
     המסך היא התו הזה בלבד. */
  const ctrl = cp < 32;
  throw new Error(
    'API key has a non-ASCII character at position ' + (i + 1) +
    ' (code ' + cp + ').' +
    (heb  ? '  That is a Hebrew letter - the key was typed or pasted with' +
            ' the keyboard in Hebrew.  Switch to English and paste again.'
   : ctrl ? '  That is a control character' +
            (cp === 22 ? ', which is what Ctrl+V types in a console that' +
                         ' does not paste with it' : '') +
            '.  Right-click in the window to paste instead.'
          : '  HTTP headers accept ASCII only.') +
    '  The key itself was never read or stored.\n' +
    '  המפתח מכיל תו שאינו ASCII במקום ' + (i + 1) + ' (קוד ' + cp + ').' +
    (heb  ? '  זו אות עברית — ככל הנראה הודבק או הוקלד בזמן שפריסת' +
            ' המקלדת הייתה בעברית.  החלף לאנגלית והדבק שוב.'
   : ctrl ? '  זהו תו בקרה' +
            (cp === 22 ? ', וזה מה ש-Ctrl+V מקליד בקונסולה שאינה מדביקה איתו'
                       : '') +
            '.  הדבק בקליק ימני במקום.'
          : '  כותרות HTTP מקבלות ASCII בלבד.') +
    '  (התוכן עצמו לא נקרא ולא נשמר.)');
}

/* מוודא מול השירות שהמפתח באמת עובד, לפני שנוגעים בקבצים. שיחה
   אחת, ללא עלות. בלי זה מחיקה מקדימה של אלפי הקלטות יכולה לרוץ
   במלואה ורק אז להתגלות שאין במה להחליף אותן. */
async function preflight(provider, lang){
  checkKey(provider === 'gemini' ? GEMINI_KEY : KEY);
  const P = PROVIDERS[provider];
  if(!P) throw new Error('ספק לא מוכר: ' + provider);
  const list = await P.voices(lang);
  if(!list || !list.length) throw new Error('השירות לא החזיר אף קול עבור ' + lang);
  return list.length;
}

/* משפט מבחן אמיתי מהמאגר: ספרות, מונחי תנועה וסוגריים — בדיוק
   המקומות שבהם מנועי הקראה נשברים */
const SAMPLE_TEXT =
  'ברחוב הרצל סומנו 4 מקומות חנייה רצופים לנכים. ' +
  'לרכב ללא תווית חנייה כבתמרור אסור לחנות בחניית נכים, ' +
  'גם אם המקומות שיועדו לנכים פנויים כולם.';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* חוקי ההגייה חיים במודולים נפרדים. speech.forSpeech הוא נקודת
   הכניסה היחידה לטקסט שנשלח למנוע. */
const { forSpeech, speechHash } = require('./speech');
const { collect } = require('./bank');
const diffBuild = require('./diff-build');

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
  },

  /* ---------------- ג'מיני ----------------

     לא מנוע הקראה אלא מודל שמייצר אודיו מתוך הבנת המשפט, ולכן הוא
     מכריע הומוגרפים לבד: "זכות קדימה" מול "סע קדימה", "נהג" כשם עצם
     מול פועל. אלה בדיוק המקרים שטבלת החוקים קיימת כדי לפצות עליהם.

     שני הבדלים מהספקים האחרים, ושניהם מטופלים כאן:

     הפורמט — מוחזר PCM 16 ביט מונו, לא MP3. ffmpeg מקודד, ונדרש רק
     כשהספק הזה בשימוש. הוא אינו נכנס ל-repo ואינו נדרש לאפליקציה.

     הקצב — מודל preview נושא תקרה נמוכה, שנמדדה בכ-5 בקשות לדקה.
     אין צורך לתכנת סביבה: withRetry מזהה 429 ומרחיב את המרווח, ו-RATE
     מתכנס לבד למה שהחשבון מרשה. */
  gemini: {
    price: null,                 /* התמחור לא נמדד. עדיף לומר "לא ידוע" מאשר להמציא */
    model: GEMINI_MODEL,
    api: 'https://generativelanguage.googleapis.com/v1beta',

    /* ויסות משלו, כי ברירת המחדל בנויה לספק אחר לגמרי.

       התקרה הכללית היא 4 שניות בין בקשות — נדיבה מול Chirp3, וחסרת
       שחר מול מודל preview שמוגבל לכ-5 בקשות לדקה, כלומר 12 שניות.
       עם ארבעה עובדים במקביל זה ירה 15 בקשות בדקה מול תקרה של 5,
       שני שלישים חזרו 429, וכל כישלון שרף ניסיונות עד שהמחרוזת
       נזרקה. הקצב בפועל היה קובץ אחד לשלוש דקות.

       12 שניות ועובד אחד הופכים כמעט כל בקשה להצלחה.

       ניסיון להאיץ ל-4 שניות ושני עובדים, אחרי שהחשבון עבר למדרגה
       בתשלום, ייצר אפס קבצים בשלוש וחצי דקות — מול 103 שייצרה
       ההגדרה השמרנית לפניו. המסקנה נמדדה ולא שוערה: התשלום פתח את
       החסימה, הוא לא הרים את התקרה לדקה. במודל preview היא נשארת
       נמוכה בכל מדרגה.

       הרצפה 5 שניות ולא 4, כי שם הוויסות התייצב בהרצה שכן עבדה. */
    pace: { start: 12000, min: 5000, max: 60000, workers: 1 },

    /* נבדק פעם אחת לפני הלולאה, כדי שחוסר ffmpeg לא ייראה כ-6,823
       כשלונות זהים */
    ready(){
      const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
      if(r.error || r.status !== 0){
        throw new Error('ffmpeg לא נמצא ב-PATH. הוא נדרש רק לספק gemini.\n' +
          '  התקנה: winget install Gyan.FFmpeg  ואז לפתוח חלון cmd חדש.');
      }
      if(!GEMINI_KEY) throw new Error('חסר GEMINI_KEY בסביבה.');
    },

    /* קולות ג'מיני אינם תלויי שפה — אותו קול מדבר בכל שפה */
    async voices(){
      return ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr']
        .map(id => ({ id, name: id, gender: undefined }));
    },

    async speak(text, lang, voiceId){
      const r = await fetch(PROVIDERS.gemini.api + '/models/' +
                            PROVIDERS.gemini.model + ':generateContent?key=' +
                            encodeURIComponent(GEMINI_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId || 'Kore' } }
            }
          }
        })
      });
      if(!r.ok){
        const body = await r.text();
        let msg = body;
        try { msg = JSON.parse(body).error.message; } catch(e){}
        /* הסטטוס נשאר בהודעה — withRetry מזהה לפיו 429 ומאט */
        throw new Error('gemini ' + r.status + ' ' + String(msg).slice(0, 140));
      }
      const j = await r.json();
      const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      const inline = parts.map(p => p.inlineData).filter(Boolean)[0];
      if(!inline || !inline.data) throw new Error('gemini החזיר תשובה בלי אודיו');
      const rate = Number((/rate=(\d+)/.exec(inline.mimeType || '') || [])[1]) || 24000;
      return pcmToMp3(Buffer.from(inline.data, 'base64'), rate);
    }
  }
};

/* ---------------- Vertex ----------------

   אותם מודלים של ג'מיני, דרך שירות Cloud רגיל במקום AI Studio.
   ההבדל היחיד שמעניין: המכסה. ב-AI Studio התקרה על מודל preview
   נתנה כמאתיים קבצים ליום מול 6,823 שצריך; כאן היא מנוהלת ומוגדלת
   כמו כל שירות Cloud אחר.

   אין מפתח API. האימות הוא טוקן של gcloud, שנשמר במחשב בלבד — וזה
   גם מסלק את הדרך שבה מפתח דלף כאן שלוש פעמים, בצילומי מסך.

   הטוקן תקף כשעה, וריצה מלאה ארוכה ממנה. לכן הוא נשלף מחדש כל
   חצי שעה: ריצה שנופלת באמצע הלילה על טוקן שפג היא בדיוק סוג
   הכישלון שמתגלה רק בבוקר. */
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const VERTEX_TOKEN = { value: '', at: 0, ttl: 30 * 60 * 1000 };

function gcloudOut(cmd){
  const r = spawnSync('gcloud ' + cmd, { encoding: 'utf8', shell: true });
  if(r.error || r.status !== 0){
    const msg = ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 200);
    throw new Error('gcloud ' + cmd + ' נכשל. ' + (msg || 'לא נמצא ב-PATH'));
  }
  return (r.stdout || '').trim();
}

function vertexToken(){
  if(VERTEX_TOKEN.value && Date.now() - VERTEX_TOKEN.at < VERTEX_TOKEN.ttl){
    return VERTEX_TOKEN.value;
  }
  VERTEX_TOKEN.value = gcloudOut('auth print-access-token');
  VERTEX_TOKEN.at = Date.now();
  return VERTEX_TOKEN.value;
}

function vertexProject(){
  const p = process.env.VERTEX_PROJECT || gcloudOut('config get-value project');
  if(!p || p === '(unset)') throw new Error(
    'לא הוגדר פרויקט ל-Vertex.  gcloud config set project <ID>  או VERTEX_PROJECT=<ID>');
  return p;
}

PROVIDERS.vertex = {
  price: null,                 /* התמחור לא נמדד. לא ממציאים מספר */
  model: GEMINI_MODEL,
  /* המכסה כאן גבוהה מזו של AI Studio אבל לא נמדדה. מתחילים במרווח
     שמרני ונותנים ל-RATE למצוא את הגבול — הפעם עם רצפה נמוכה, כי
     אין סיבה להניח תקרה של חמש בקשות לדקה. */
  pace: { start: 3000, min: 200, max: 60000, workers: 2 },

  ready(){
    const r = spawnSync('ffmpeg -version', { encoding: 'utf8', shell: true });
    if(r.error || r.status !== 0){
      throw new Error('ffmpeg לא נמצא ב-PATH. נדרש לקידוד ה-PCM שמוחזר מ-Vertex.\n' +
        '  התקנה: winget install Gyan.FFmpeg  ואז לפתוח חלון cmd חדש.');
    }
    vertexToken();               /* נכשל כאן, ולא 6,823 פעמים */
    vertexProject();
  },

  async voices(){
    return ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr']
      .map(id => ({ id, name: id, gender: undefined }));
  },

  async speak(text, lang, voiceId){
    const proj = vertexProject();
    const loc = VERTEX_LOCATION;
    const host = loc === 'global'
      ? 'https://aiplatform.googleapis.com'
      : 'https://' + loc + '-aiplatform.googleapis.com';
    const url = host + '/v1/projects/' + proj + '/locations/' + loc +
                '/publishers/google/models/' + PROVIDERS.vertex.model + ':generateContent';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + vertexToken(),
                 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId || 'Kore' } }
          }
        }
      })
    });
    if(!r.ok){
      const body = await r.text();
      let msg = body;
      try { msg = JSON.parse(body).error.message; } catch(e){}
      /* טוקן שפג מוחזר כ-401. מוחקים אותו כדי שהניסיון הבא ישלוף
         חדש, ומסמנים את השגיאה כחולפת כדי ש-withRetry ינסה שוב. */
      if(r.status === 401){ VERTEX_TOKEN.value = ''; }
      throw new Error('vertex ' + r.status + ' ' +
        (r.status === 401 ? '(טוקן פג — נשלף מחדש) ' : '') +
        String(msg).replace(/\s+/g, ' ').slice(0, 140));
    }
    const j = await r.json();
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const inline = parts.map(p => p.inlineData).filter(Boolean)[0];
    if(!inline || !inline.data) throw new Error('vertex החזיר תשובה בלי אודיו');
    const rate = Number((/rate=(\d+)/.exec(inline.mimeType || '') || [])[1]) || 24000;
    return pcmToMp3(Buffer.from(inline.data, 'base64'), rate);
  }
};

/* PCM → MP3 דרך קובץ זמני. צינור ל-ffmpeg על חלונות נוטה להיתקע על
   קלט גדול, וקובץ זמני עולה מילישניות ולא נכשל. */
function pcmToMp3(pcm, rate){
  const base = path.join(os.tmpdir(), 'dw-' + process.pid + '-' +
                         Math.random().toString(36).slice(2));
  const src = base + '.pcm', dst = base + '.mp3';
  fs.writeFileSync(src, pcm);
  try{
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', src,
      '-b:a', GEMINI_MP3_KBPS + 'k', dst]);
    return fs.readFileSync(dst);
  } finally {
    for(const f of [src, dst]) { try { fs.unlinkSync(f); } catch(e){} }
  }
}

/* ---------------- עזרים ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- ויסות קצב ----------------
   לקולות Chirp3-HD מכסת בקשות נמוכה בהרבה מהרגילים, ובקצב חופשי
   רוב הבקשות חוזרות עם 429. ניסיון חוזר לבדו לא פותר: הוא מגיב אחרי
   הכישלון במקום למנוע אותו, וכל הבקשות ממשיכות להתנגש.
   כאן שומרים מרווח מינימלי בין בקשות: כל 429 מאריך אותו, וכל רצף
   הצלחות מקצר אותו בזהירות. הקצב מתכנס לבד למה שהחשבון באמת מרשה,
   בלי שנצטרך לדעת את המספר מראש. */
const RATE = { gap: 120, min: 60, max: 4000, next: 0, ok: 0 };

async function paced(fn){
  /* תור: כל קורא תופס חלון זמן ומחכה לו */
  const now = Date.now();
  const slot = Math.max(now, RATE.next);
  RATE.next = slot + RATE.gap;
  const wait = slot - now;
  if(wait > 0) await sleep(wait);
  return fn();
}

function rateSlower(){
  RATE.ok = 0;
  RATE.gap = Math.min(RATE.max, Math.round(RATE.gap * 1.5) + 40);
}
function rateFaster(){
  /* מאיצים רק אחרי רצף הצלחות, וביד קלה */
  if(++RATE.ok < 8) return;
  RATE.ok = 0;
  RATE.gap = Math.max(RATE.min, Math.round(RATE.gap * 0.8));
}

async function withRetry(fn, label, tries = 8){
  let last;
  for(let i = 0; i < tries; i++){
    try{
      const r = await paced(fn);
      rateFaster();
      return r;
    }
    catch(e){
      last = e;
      const limited = /429|RESOURCE_EXHAUSTED|exhaust/i.test(e.message);
      /* 401 נכלל בגלל Vertex: הטוקן תקף כשעה וריצה מלאה ארוכה ממנה.
         הספק מוחק את הטוקן השמור כשהוא רואה 401, ולכן ניסיון חוזר
         כאן נושא טוקן חדש. בלי זה כל מחרוזת שנקלעה לרגע התפוגה
         הייתה נופלת כשגיאת הגדרה. */
      const transient = limited ||
        /401|500|502|503|504|ETIMEDOUT|ECONNRESET|fetch failed/i.test(e.message);
      if(!transient) throw e;            /* שגיאת הגדרה — אין טעם לנסות שוב */
      if(limited) rateSlower();
      await sleep(600 * Math.pow(2, Math.min(i, 4)));
    }
  }
  throw last;
}

/* מריץ במקביל, אבל הקצב בפועל נקבע על ידי RATE ולא על ידי limit */
async function pool(items, limit, worker){
  let i = 0, done = 0;
  const t0 = Date.now();
  const run = async () => {
    while(i < items.length){
      const k = i++;
      await worker(items[k], k);
      done++;
      if(done % 25 === 0 || done === items.length){
        const el = (Date.now() - t0) / 1000;
        const rate = done / Math.max(el, 1);
        const left = rate > 0 ? Math.round((items.length - done) / rate / 60) : 0;
        process.stdout.write('\r  ' + done + '/' + items.length +
          '  ·  ' + rate.toFixed(1) + '/שנייה  ·  מרווח ' + RATE.gap + 'ms' +
          '  ·  נותרו ~' + left + ' דק׳    ');
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
      const buf = await withRetry(() => P.speak(forSpeech(SAMPLE_TEXT), lang, v.id), v.id);
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

/* השוואה זו-מול-זו על תוכן אמיתי. משפט בודד לא מספיק כדי לבחור קול
   שישמיעו אלפי פעמים — כאן שומעים את אותן שאלות מהמאגר בכל הקולות
   המועמדים, שורה מול שורה. */
async function cmdTry(prov, lang, voicesArg, count, confirmed){
  if(!voicesArg) throw new Error('חסר --voices (רשימה מופרדת בפסיקים)');
  const P = PROVIDERS[prov];
  const langCode = lang === 'he' ? 'he-IL' : lang;
  const voices = voicesArg.split(',').map(v => v.trim()).filter(Boolean);

  /* בוחרים משפטים באורך סביר, בפיזור אחיד על פני המאגר */
  const all = collect(lang).filter(x => x.text.length >= 45 && x.text.length <= 170);
  const step = Math.max(1, Math.floor(all.length / count));
  const picks = [];
  for(let i = 0; i < all.length && picks.length < count; i += step) picks.push(all[i]);

  const outDir = path.join(ROOT, 'tools', 'samples', 'try');
  const chars = picks.reduce((s, x) => s + x.text.length, 0) * voices.length;

  console.log('\nקולות: ' + voices.length + ' · משפטים: ' + picks.length +
              ' · קבצים: ' + (voices.length * picks.length));
  console.log('תווים: ' + chars.toLocaleString() +
              ' · עלות: $' + (chars / 1e6 * P.price).toFixed(3));
  if(!confirmed){ console.log('\nלביצוע הוסף --yes'); return; }

  const jobs = [];
  for(const v of voices){
    const safe = v.replace(/[^\w.-]/g, '_');
    fs.mkdirSync(path.join(outDir, safe), { recursive: true });
    for(const p of picks) jobs.push({ voice: v, safe, item: p });
  }

  let failed = 0;
  await pool(jobs, 4, async (j) => {
    const file = path.join(outDir, j.safe, j.item.id + '.mp3');
    if(fs.existsSync(file)) return;
    try{
      const buf = await withRetry(() => P.speak(forSpeech(j.item.text), langCode, j.voice), j.voice);
      fs.writeFileSync(file, buf);
    }catch(e){
      failed++;
      console.warn('\n  ✗ ' + j.voice + ': ' + e.message.slice(0, 100));
    }
  });

  writeTryPage(outDir, voices, picks);
  console.log('\n✓ מוכן' + (failed ? ' · ' + failed + ' כשלונות' : ''));
  console.log('  פתח: ' + path.join(outDir, 'compare.html'));
}

function writeTryPage(dir, voices, picks){
  const shortName = v => v.replace('he-IL-', '').replace('Chirp3-HD-', '');
  const head = voices.map(v => '<th dir="ltr">' + esc(shortName(v)) + '</th>').join('');
  const rows = picks.map(p => {
    const cells = voices.map(v =>
      '<td><audio controls preload="none" src="' +
      esc(v.replace(/[^\w.-]/g, '_') + '/' + p.id + '.mp3') + '"></audio></td>'
    ).join('');
    return '  <tr><td class="s">' + esc(p.text) + '</td>' + cells + '</tr>';
  }).join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="he" dir="rtl"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>השוואה על תוכן אמיתי · DriveWise</title>',
    '<style>',
    '  body{font-family:system-ui,"Segoe UI",Arial,sans-serif;margin:0;padding:24px 16px 60px;',
    '       background:#E7EDF4;color:#0E1F33;line-height:1.6}',
    '  h1{font-size:25px;margin:0 0 6px}',
    '  p.lead{margin:0 0 20px;color:#5A6B7E}',
    '  .wrap{overflow-x:auto;background:#fff;border-radius:14px;border:2px solid #C4D1DE}',
    '  table{border-collapse:collapse;width:100%;min-width:720px}',
    '  th{position:sticky;top:0;background:#0E1F33;color:#fff;font-size:15px;',
    '     padding:10px 12px;white-space:nowrap}',
    '  th:first-child{text-align:right}',
    '  td{padding:10px 12px;border-bottom:1px solid #E7EDF4;vertical-align:middle}',
    '  td.s{font-size:17px;font-weight:600;min-width:300px;max-width:460px}',
    '  tr:nth-child(even){background:#F7FAFD}',
    '  audio{width:190px;height:36px}',
    '</style></head><body>',
    '<h1>אותן שאלות, בכל קול</h1>',
    '<p class="lead">כל שורה היא משפט אמיתי מהמאגר. השווה לרוחב השורה.</p>',
    '<div class="wrap"><table>',
    '  <tr><th>המשפט</th>' + head + '</tr>',
    rows,
    '</table></div>',
    '</body></html>'
  ].join('\n');

  fs.writeFileSync(path.join(dir, 'compare.html'), html, 'utf8');
}

async function cmdAll(prov, lang, voiceId, folder, confirmed){
  if(!voiceId) throw new Error('חסר --voice');
  if(!folder) throw new Error('חסר --as (שם התיקייה שהאפליקציה תחפש)');
  if(!/^[a-z0-9_-]+$/.test(folder)) throw new Error('--as: אותיות קטנות, ספרות ומקף בלבד');
  const P = PROVIDERS[prov];
  const langCode = lang === 'he' ? 'he-IL' : lang;
  const list = collect(lang);
  /* כל קול בתיקייה משלו, כדי שהאפליקציה תוכל להחליף ביניהם */
  const outDir = path.join(ROOT, 'audio', lang, folder);
  fs.mkdirSync(outDir, { recursive: true });

  const todo = list.filter(x => !fs.existsSync(path.join(outDir, x.id + '.mp3')));
  const chars = todo.reduce((s, x) => s + x.text.length, 0);

  console.log('\nשפה: ' + lang + ' · ספק: ' + prov + ' · קול: ' + voiceId +
              ' · תיקייה: audio/' + lang + '/' + folder);
  console.log('סה"כ מחרוזות: ' + list.length.toLocaleString() + ' · חסרות: ' + todo.length.toLocaleString());
  console.log('תווים לייצור: ' + chars.toLocaleString() +
              ' · הערכת עלות: ' + (P.price == null
                ? 'לא ידועה — התמחור לא נמדד'
                : '$' + (chars / 1e6 * P.price).toFixed(2)));
  if(!todo.length){ console.log('הכול כבר קיים.'); return; }
  if(!confirmed){ console.log('\nלביצוע בפועל הוסף --yes'); return; }

  /* בדיקת מוכנות של הספק לפני הלולאה. בלעדיה חוסר ffmpeg היה מופיע
     כאלפי כשלונות זהים במקום כשורה אחת שאומרת מה להתקין. */
  if(P.ready) P.ready();

  /* ספק שיודע מה המגבלה שלו קובע את הוויסות בעצמו. ברירת המחדל
     מגששת מלמטה, וזה נכון כשהתקרה לא ידועה — אבל כשהיא ידועה,
     גישוש פירושו שעות של 429 לפני שהמרווח מגיע למקום. */
  let workers = 4;
  if(P.pace){
    RATE.gap = P.pace.start;
    RATE.min = P.pace.min;
    RATE.max = P.pace.max;
    workers  = P.pace.workers || 1;
    console.log('ויסות: מרווח התחלתי ' + (RATE.gap / 1000).toFixed(0) + 'ש · ' +
                workers + ' במקביל · כ-' +
                Math.round(60000 / RATE.gap * workers) + ' בקשות לדקה');
  }

  let bytes = 0, failed = 0;
  const done = [];   /* לרישום במניפסט */
  await pool(todo, workers, async (item) => {
    try{
      const buf = await withRetry(() => P.speak(forSpeech(item.text), langCode, voiceId), item.id);
      fs.writeFileSync(path.join(outDir, item.id + '.mp3'), buf);
      done.push([item.id, item.text]);
      bytes += buf.length;
    }catch(e){
      failed++;
      console.warn('\n  ✗ ' + item.id + ': ' + e.message.slice(0, 120));
    }
  });

  /* רושמים מה נשלח למנוע בפועל, כדי שבנייה דיפרנציאלית תדע
     בהמשך מה באמת השתנה ומה לא. */
  if(done.length) diffBuild.recordMany(lang, done);

  console.log('\n✓ נוצרו ' + (todo.length - failed).toLocaleString() + ' קבצים · ' +
              (bytes / 1048576).toFixed(1) + 'MB' + (failed ? ' · ' + failed + ' כשלונות' : ''));
  console.log('  הרצה חוזרת תשלים רק את מה שחסר.');
}

/* בודק מה באמת יצא: כמה קבצים חסרים, וכמה מהם קטנים מדי מכדי להכיל
   דיבור. קובץ באורך אפס נוצר כשהספק החזיר תשובה ריקה, והוא מסוכן
   יותר מקובץ חסר — האפליקציה תמצא אותו, תנגן שקט, ולא תיפול לקול
   המכשיר. */
function cmdVerify(lang){
  const list = collect(lang);
  const base = path.join(ROOT, 'audio', lang);
  if(!fs.existsSync(base)){ console.log('\nאין תיקיית audio/' + lang + ' — עוד לא יוצר כלום.'); return; }

  const folders = fs.readdirSync(base, { withFileTypes: true })
                    .filter(d => d.isDirectory()).map(d => d.name);
  if(!folders.length){ console.log('\nאין תיקיות קול תחת audio/' + lang); return; }

  console.log('\nשפה: ' + lang + ' · מצופה בכל קול: ' + list.length.toLocaleString() + ' קבצים\n');
  let problems = 0;

  for(const f of folders){
    const dir = path.join(base, f);
    let have = 0, bytes = 0;
    const tiny = [], missing = [];
    for(const item of list){
      const p = path.join(dir, item.id + '.mp3');
      if(!fs.existsSync(p)){ missing.push(item); continue; }
      const sz = fs.statSync(p).size;
      bytes += sz; have++;
      if(sz < 800) tiny.push({ id: item.id, size: sz });
    }
    const extra = fs.readdirSync(dir).filter(x => x.endsWith('.mp3')).length - have;
    const ok = !missing.length && !tiny.length;
    if(!ok) problems++;

    console.log((ok ? '✓ ' : '✗ ') + f);
    console.log('    קיימים: ' + have.toLocaleString() + '/' + list.length.toLocaleString() +
                '  ·  ' + (bytes / 1048576).toFixed(0) + 'MB' +
                (extra > 0 ? '  ·  ' + extra + ' עודפים' : ''));
    if(missing.length){
      console.log('    חסרים: ' + missing.length.toLocaleString() +
                  '  →  ' + missing.slice(0, 3).map(x => x.text.slice(0, 26)).join(' | '));
    }
    if(tiny.length){
      console.log('    ריקים או זעירים: ' + tiny.length +
                  '  →  ' + tiny.slice(0, 3).map(x => x.id + ' (' + x.size + 'B)').join(' | '));
    }
  }

  console.log('');
  console.log(problems ? 'הרצה חוזרת של הייצור תשלים את החסר. קבצים זעירים צריך למחוק ידנית.'
                       : 'הכול שלם.');
  /* קוד יציאה, כדי שמשגר יוכל לתלות בזה החלטה — למשל לא לעדכן את
     המניפסט כשהייצור לא הושלם. */
  if(problems) process.exitCode = 1;
}

/* מוחק רק את הקבצים שההגייה שלהם השתנתה, כדי שההרצה הבאה תייצר
   אותם מחדש. בלי זה תיקון הגייה היה מחייב ייצור של כל 27 אלף
   הקבצים במקום כמה מאות. */
function cmdRefresh(lang, confirmed){
  const list = collect(lang);
  const affected = list.filter(x => forSpeech(x.text) !== x.text);
  const base = path.join(ROOT, 'audio', lang);

  console.log('\nמחרוזות שההגייה שלהן תוקנה: ' + affected.length.toLocaleString() +
              ' מתוך ' + list.length.toLocaleString());
  if(!affected.length){ console.log('אין מה לרענן.'); return; }

  console.log('\nלדוגמה:');
  affected.slice(0, 3).forEach(x => {
    console.log('  ' + x.text.slice(0, 46));
    console.log('  → ' + forSpeech(x.text).slice(0, 52));
  });

  const folders = fs.existsSync(base)
    ? fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
    : [];
  let found = 0;
  for(const f of folders){
    for(const x of affected){
      if(fs.existsSync(path.join(base, f, x.id + '.mp3'))) found++;
    }
  }
  const chars = affected.reduce((s, x) => s + x.text.length, 0) * Math.max(folders.length, 1);
  console.log('\nקבצים שיימחקו: ' + found.toLocaleString() + ' (' + folders.length + ' קולות)');
  console.log('ייצור מחדש: ' + chars.toLocaleString() + ' תווים · $' +
              (chars / 1e6 * PROVIDERS.gcloud.price).toFixed(2));

  if(!confirmed){ console.log('\nלמחיקה בפועל הוסף --yes, ואז הרץ שוב את הייצור.'); return; }

  let gone = 0;
  for(const f of folders){
    for(const x of affected){
      const p = path.join(base, f, x.id + '.mp3');
      if(fs.existsSync(p)){ fs.unlinkSync(p); gone++; }
    }
  }
  console.log('\n✓ נמחקו ' + gone.toLocaleString() + ' קבצים. הרץ עכשיו את run-generate-all.');
}

/* בדיקת עשן: מייצר מעט קבצים לתיקייה נפרדת ומוודא שהם שמע אמיתי.
   עוברת באותו מסלול בדיוק כמו הייצור המלא — אותו forSpeech, אותו
   ספק, אותה קריאה — כי בדיקה שמשכפלת את הקוד בודקת את עצמה.

   לא נוגעת ב-audio/ ולא במניפסט. */
/* מתאר את הכותרות שייצאו בבקשה — שם, סוג, אורך, והאם הערך ASCII.
   הערכים עצמם לעולם לא מודפסים: אחד מהם הוא המפתח. זה כל מה שצריך
   כדי לראות שכותרת קיבלה טקסט במקום מה שהיא אמורה לקבל. */
function describeHeaders(prov){
  const names = {
    gcloud:     ['Content-Type', 'x-goog-api-key'],
    azure:      ['Ocp-Apim-Subscription-Key', 'Content-Type', 'X-Microsoft-OutputFormat'],
    elevenlabs: ['xi-api-key', 'Content-Type', 'Accept']
  }[prov] || [];
  console.log('\nכותרות הבקשה:');
  for(const nm of names){
    /* רק המפתח מגיע מבחוץ. השאר קבועים בקוד. */
    const isKey = /key$/i.test(nm);
    if(!isKey){
      console.log('  ' + nm.padEnd(26) + 'string  קבוע בקוד');
      continue;
    }
    const ascii = [...KEY].every(c => c.codePointAt(0) >= 32 && c.codePointAt(0) <= 126);
    console.log('  ' + nm.padEnd(26) + 'string  ' +
      String(KEY.length).padStart(4) + ' תווים  ' +
      (ascii ? 'ASCII ✓' : 'ASCII ✗  ← זו התקלה'));
  }
  console.log('  הטקסט העברי נשלח ב-body בלבד, UTF-8.');
}

async function cmdSmoke(prov, lang, langCode, voiceId, n){
  const P = PROVIDERS[prov];
  const out = path.join(ROOT, 'tools', 'samples', 'smoke');
  fs.mkdirSync(out, { recursive: true });

  describeHeaders(prov);

  console.log('\nבודק את המפתח מול השירות...');
  const count = await preflight(prov, langCode);
  console.log('✓ המפתח תקף · ' + count + ' קולות זמינים ב-' + langCode);

  const list = collect(lang);
  /* מחרוזות אמיתיות מהמאגר, פרוסות על פניו, ורק כאלה שבאמת מנוקדות */
  const pick = list
    .filter(x => /[\u0591-\u05C7]/.test(forSpeech(x.text)))
    .filter((_, i) => i % 97 === 0)
    .slice(0, n);

  console.log('\n' + pick.length + ' מחרוזות · קול ' + voiceId + '\n');
  let good = 0, bad = 0;
  for(const item of pick){
    const spoken = forSpeech(item.text);
    let buf;
    try{
      buf = await withRetry(() => P.speak(spoken, langCode, voiceId), item.id);
    }catch(e){
      bad++;
      console.log('  ✗ ' + item.id + '  ' + e.message.slice(0, 120));
      continue;
    }
    const p = path.join(out, item.id + '.mp3');
    fs.writeFileSync(p, buf);
    const size = fs.statSync(p).size;
    /* MP3 מתחיל ב-ID3 או במסגרת שמסתמנת ב-0xFF. קובץ באורך אפס,
       או JSON של שגיאה שנשמר בטעות, ייפול כאן. */
    const head = buf.slice(0, 3).toString('latin1');
    const isMp3 = head === 'ID3' || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0);
    if(size > 0 && isMp3){
      good++;
      console.log('  ✓ ' + item.id + '  ' + String(size).padStart(6) + ' bytes   ' +
                  spoken.slice(0, 46));
    }else{
      bad++;
      console.log('  ✗ ' + item.id + '  ' + size + ' bytes · לא נראה כמו MP3');
    }
  }

  console.log('\n  תקינים: ' + good + '   כשלו: ' + bad);
  console.log('  הקבצים: ' + out);
  if(bad) process.exitCode = 1;
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
  if(cmd === 'verify') return cmdVerify(lang);
  if(cmd === 'refresh') return cmdRefresh(lang, argv.includes('--yes'));

  if(!PROVIDERS[prov]) throw new Error('ספק לא מוכר: ' + prov);
  /* הצגת עלות בלבד אינה נוגעת ברשת, ולכן אינה דורשת מפתח. */
  const dryRun = (cmd === 'try' || cmd === 'all') && !argv.includes('--yes');
  /* כל ספק והמפתח שלו. ג'מיני אינו נוגע ב-TTS_KEY, ולכן TTS_KEY
     פגום או חסר אינו אמור לחסום אותו. */
  const activeKey = prov === 'gemini' ? GEMINI_KEY : KEY;
  const keyName   = prov === 'gemini' ? 'GEMINI_KEY' : 'TTS_KEY';
  if(!activeKey && !dryRun) throw new Error('חסר ' + keyName + ' בסביבה.  ' +
    keyName + '=xxx node tools/tts-build.js …');
  if(!dryRun) checkKey(activeKey);

  const langCode = lang === 'he' ? 'he-IL' : lang;
  if(cmd === 'sample'){
    return cmdSample(prov, langCode, arg('out', path.join(ROOT, 'tools', 'samples', prov)));
  }
  if(cmd === 'try'){
    return cmdTry(prov, lang, arg('voices'), +(arg('count', 12)), argv.includes('--yes'));
  }
  if(cmd === 'smoke'){
    return cmdSmoke(prov, lang, langCode,
      arg('voice', 'he-IL-Chirp3-HD-Aoede'), +(arg('count', 1)));
  }
  if(cmd === 'all'){
    return cmdAll(prov, lang, arg('voice'), arg('as'), argv.includes('--yes'));
  }

  console.log([
    'שימוש:',
    '  node tools/tts-build.js plan   [--lang he]',
    '  node tools/tts-build.js verify [--lang he]',
    '  node tools/tts-build.js refresh [--yes]   מוחק קבצים שהגייתם תוקנה',
    '  TTS_KEY=xxx node tools/tts-build.js smoke [--count 10]   בדיקת עשן',
    '  TTS_KEY=xxx node tools/tts-build.js sample --provider gcloud|azure|elevenlabs',
    '  TTS_KEY=xxx node tools/tts-build.js all --provider gcloud --voice <id> --as <folder> --yes'
  ].join('\n'));
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
