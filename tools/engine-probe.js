/* =====================================================================
   DriveWise · מה המנוע בכלל מקבל ממני?
   כלי פיתוח. אפס תלויות.

   ארבע שאלות שכל ארכיטקטורת ההגייה תלויה בהן, ולאף אחת מהן אין
   תשובה בפרויקט. שלוש הראשונות אובייקטיביות לחלוטין — סטטוס HTTP
   והשוואת בייטים. אין צורך באוזן, ואין מקום לדעה.

     1. האם ניקוד משנה את האודיו?
        אותו משפט, עם ניקוד ובלי. אם הבייטים זהים — המנוע מתעלם
        מהניקוד, וכל 105 חוקי ההגייה אינם עושים דבר להקלטות.

     2. האם הקול הנוכחי מקבל SSML בכלל?
        Chirp 3 HD הוא מודל חדש, ולפי התיעוד הוא מקבל טקסט בלבד.
        אם זה נכון, <phoneme alphabet="ipa"> אינו אפשרות כאן.

     3. האם <phoneme> משנה את האודיו אצל קול שכן מקבל SSML?
        קבלה של הבקשה אינה הבטחה שהתג נאכף. משווים בייטים.

     4. אילו קולות עבריים קיימים, ומי מהם מקבל SSML?

   התשובה קובעת את הצעד הבא, ולא להפך:

     ניקוד עובד            → ממשיכים בדיוק כפי שאנחנו
     ניקוד לא, SSML כן     → עוברים לקול שמקבל SSML ומכתיבים IPA
     שניהם לא              → ההגייה נשלטת רק בכתיב, ואין מה לחפש

   עלות: חמש קריאות קצרות. פחות מאגורה.

   הרצה: run-engine-probe.cmd  (מבקש את המפתח בבטחה)
   ===================================================================== */
'use strict';

const crypto = require('crypto');

const KEY = process.env.TTS_KEY || '';
const LANG = 'he-IL';
const CHIRP = 'he-IL-Chirp3-HD-Aoede';        /* הקול שבשימוש היום */

/* משפט קצר עם מילה שדווחה כשגויה מהאזנה אמיתית */
const BARE    = 'מותר לעבור את הצומת.';
const VOWELED = 'מוּתָּר לַעֲבוֹר את הצוֹמֶת.';
const IPA     = 'muˈtaʁ';                     /* mutar, ההגייה הנכונה */

if(!KEY){
  console.error('חסר TTS_KEY בסביבה. הרץ דרך run-engine-probe.cmd');
  process.exit(1);
}

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

/* קריאה אחת ל-API. מחזירה או אודיו, או את השגיאה כמות שהיא —
   כאן דווקא השגיאה היא התוצאה המעניינת. */
async function synth(input, voice){
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      input,
      voice: { languageCode: LANG, name: voice },
      audioConfig: { audioEncoding: 'MP3' }
    })
  });
  const body = await r.text();
  if(!r.ok){
    let msg = body;
    try { msg = JSON.parse(body).error.message; } catch(e){}
    return { ok: false, status: r.status, msg: String(msg).slice(0, 160) };
  }
  return { ok: true, audio: Buffer.from(JSON.parse(body).audioContent, 'base64') };
}

async function voices(){
  const r = await fetch('https://texttospeech.googleapis.com/v1/voices?languageCode=he-IL',
                        { headers: { 'x-goog-api-key': KEY } });
  if(!r.ok) return [];
  return ((await r.json()).voices || []).map(v => v.name).sort();
}

const line = (n = 70) => '─'.repeat(n);
const yn = b => b ? 'כן' : 'לא';

(async function main(){
  console.log('\n' + line());
  console.log('  מה המנוע מקבל ממני — ' + CHIRP);
  console.log(line() + '\n');

  /* ---- 1. ניקוד ---- */
  const a = await synth({ text: BARE },    CHIRP);
  const b = await synth({ text: VOWELED }, CHIRP);
  let niqqudMatters = null;
  if(!a.ok || !b.ok){
    console.log('1. ניקוד      ✗ הבקשה נכשלה: ' + ((a.ok ? b : a).msg));
  } else {
    niqqudMatters = sha(a.audio) !== sha(b.audio);
    console.log('1. ניקוד משנה את האודיו?   ' + yn(niqqudMatters));
    console.log('     בלי ניקוד : ' + sha(a.audio) + '   ' + a.audio.length + ' בייט');
    console.log('     עם ניקוד  : ' + sha(b.audio) + '   ' + b.audio.length + ' בייט');
    console.log(niqqudMatters
      ? '     → הניקוד מגיע למנוע. השאלה שנשארת היא רק אם לטובה, וזו שאלה לאוזן.'
      : '     → זהים בבייט. המנוע מתעלם מהניקוד, וחוקי ההגייה אינם נוגעים בהקלטות.');
  }

  /* ---- 2. SSML על הקול הנוכחי ---- */
  console.log('');
  const plainSsml = '<speak>' + BARE + '</speak>';
  const s1 = await synth({ ssml: plainSsml }, CHIRP);
  console.log('2. ' + CHIRP + ' מקבל SSML?   ' + yn(s1.ok));
  if(!s1.ok) console.log('     ' + s1.status + ': ' + s1.msg);

  /* ---- 3. phoneme ---- */
  console.log('');
  const phon = '<speak><phoneme alphabet="ipa" ph="' + IPA + '">מותר</phoneme>' +
               ' לעבור את הצומת.</speak>';
  if(s1.ok){
    const s2 = await synth({ ssml: phon }, CHIRP);
    if(!s2.ok){
      console.log('3. <phoneme> על הקול הנוכחי   ✗ ' + s2.status + ': ' + s2.msg);
    } else {
      const enforced = sha(s1.audio) !== sha(s2.audio);
      console.log('3. <phoneme> משנה את האודיו?  ' + yn(enforced));
      console.log('     → ' + (enforced
        ? 'התג נאכף. אפשר להכתיב הגייה ב-IPA ישירות.'
        : 'הבקשה התקבלה אבל התג לא שינה דבר — הוא מתועלם.'));
    }
  } else {
    console.log('3. <phoneme> על הקול הנוכחי   לא רלוונטי, SSML נדחה');
  }

  /* ---- 4. אילו קולות קיימים, ומי מקבל SSML ---- */
  console.log('\n' + line());
  console.log('  קולות he-IL, ומי מהם מקבל SSML');
  console.log(line());
  const list = await voices();
  if(!list.length) console.log('  לא הוחזרה רשימה.');

  /* בודקים נציג אחד מכל משפחה — קריאה לכל קול היא בזבוז */
  const families = new Map();
  for(const v of list){
    const fam = (v.match(/he-IL-([A-Za-z0-9]+)/) || [])[1] || v;
    if(!families.has(fam)) families.set(fam, v);
  }
  for(const [fam, v] of families){
    const r = await synth({ ssml: '<speak>שלום</speak>' }, v);
    console.log('  ' + fam.padEnd(12) + (r.ok ? 'SSML ✓' : 'SSML ✗  ' + r.status) +
                '    (' + [...list].filter(x => x.startsWith('he-IL-' + fam)).length + ' קולות)');
  }

  /* ---- מסקנה ---- */
  console.log('\n' + line());
  console.log('  מה זה אומר');
  console.log(line());
  if(niqqudMatters === true){
    console.log('  הניקוד מגיע למנוע. ממשיכים בשיטה הנוכחית — חוקים ממוקדים');
    console.log('  למילים דו-משמעיות — ומשקיעים באוזן, לא בארכיטקטורה חדשה.');
  } else if(niqqudMatters === false){
    console.log('  הניקוד אינו מגיע. כל טבלת החוקים אינה משפיעה על ההקלטות,');
    console.log('  ורק על קול המכשיר. אם קול אחר מקבל SSML — שם הפתרון.');
    console.log('  אם אף אחד לא — ההגייה נשלטת רק דרך הכתיב עצמו.');
  }
  console.log('');
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
