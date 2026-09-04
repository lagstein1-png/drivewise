/* =====================================================================
   תאוריה מדברת · איזה מודל אודיו פתוח עכשיו?
   כלי פיתוח. אפס תלויות.

   לכל מודל מכסה משלו. שניים נחסמו על 429 אחרי שנשרפו, ואין סיבה
   להניח שהשאר במצב זהה — הם פשוט מעולם לא נוסו.

   בקשה אחת קצרה לכל מודל, ואז טבלה: מי החזיר אודיו, מי החזיר 429,
   ומי לא מכיר את הבקשה בכלל. זה כל מה שצריך כדי לדעת לאן להפנות
   את הייצור.

   שמונה בקשות באורך מילה. אם אחד מהם פתוח, הייצור ממשיך מיד.

   הרצה: run-gemini-models.cmd
   ===================================================================== */
'use strict';

const KEY = process.env.GEMINI_KEY || '';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const VOICE = process.env.GEMINI_VOICE || 'Kore';
const TEXT = 'זכות קדימה.';       /* קצר, ועדיין עברית אמיתית */

function checkKey(){
  if(!KEY) throw new Error('חסר GEMINI_KEY. הרץ דרך run-gemini-models.cmd');
  const i = [...KEY].findIndex(c => c.codePointAt(0) > 126 || c.codePointAt(0) < 32);
  if(i === -1) return;
  throw new Error('API key has a non-ASCII character at position ' + (i + 1) +
    ' (code ' + KEY.codePointAt(i) + ').  The key itself was never read or stored.');
}

async function listAudioModels(){
  const r = await fetch(API + '/models?key=' + encodeURIComponent(KEY));
  if(!r.ok) throw new Error('רשימת המודלים נכשלה: ' + r.status + ' ' +
                            (await r.text()).slice(0, 160));
  const j = await r.json();
  return (j.models || []).map(m => m.name.replace('models/', ''))
    .filter(n => /tts|native-audio/i.test(n))
    .filter(n => !/live-translate/i.test(n));   /* תרגום חי אינו הקראה */
}

async function tryModel(model){
  const t0 = Date.now();
  try{
    const r = await fetch(API + '/models/' + model + ':generateContent?key=' +
                          encodeURIComponent(KEY), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: TEXT }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
        }
      })
    });
    const ms = Date.now() - t0;
    if(!r.ok){
      const body = await r.text();
      let msg = body;
      try { msg = JSON.parse(body).error.message; } catch(e){}
      return { model, ok:false, status:r.status, ms, msg:String(msg).slice(0, 90) };
    }
    const j = await r.json();
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const inline = parts.map(p => p.inlineData).filter(Boolean)[0];
    if(!inline) return { model, ok:false, status:200, ms, msg:'תשובה בלי אודיו' };
    const bytes = Buffer.from(inline.data, 'base64').length;
    return { model, ok:true, ms, bytes, mime: inline.mimeType };
  }catch(e){
    return { model, ok:false, status:0, ms:Date.now() - t0, msg:e.message.slice(0, 90) };
  }
}

const P = (s, n) => String(s).padEnd(n);

(async function main(){
  checkKey();
  const models = await listAudioModels();
  if(!models.length){ console.log('\n  לא נמצאו מודלי אודיו.\n'); return; }

  console.log('\n  ' + models.length + ' מודלי אודיו · קול ' + VOICE +
              ' · "' + TEXT + '"\n');
  console.log('  ' + P('מודל', 46) + P('מצב', 10) + 'פרטים');
  console.log('  ' + '─'.repeat(84));

  const open = [];
  for(const m of models){
    const r = await tryModel(m);
    if(r.ok){
      open.push(r);
      console.log('  ' + P(m, 46) + P('✓ פתוח', 10) +
                  (r.bytes / 1024).toFixed(0) + 'KB · ' + r.ms + 'ms');
    } else {
      const label = r.status === 429 ? '✗ מכסה'
                  : r.status === 404 ? '✗ לא קיים'
                  : r.status === 400 ? '✗ לא מקבל'
                  : '✗ ' + (r.status || 'רשת');
      console.log('  ' + P(m, 46) + P(label, 10) + r.msg);
    }
  }

  console.log('');
  if(!open.length){
    console.log('  כל מודלי האודיו חסומים כרגע. זו מכסה בצד גוגל,');
    console.log('  ואין מה לתקן בקוד. הבקשה להגדלה היא הדרך.\n');
    return;
  }
  open.sort((a, b) => a.ms - b.ms);
  console.log('  פתוחים: ' + open.length + '. המהיר ביותר:\n');
  console.log('    tools\\run-gemini-all.cmd Kore ' + open[0].model + '\n');
})().catch(e => { console.error('\n' + e.message + '\n'); process.exit(1); });
