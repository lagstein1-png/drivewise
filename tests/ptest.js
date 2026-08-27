/* נתיב שורש הפרויקט, כדי שהבדיקה תרוץ מכל מקום ולא רק מהמחשב
   שעליו נכתבה. זה מה שמאפשר לה לרוץ גם ב-GitHub Actions. */
const ROOT = require('path').resolve(__dirname, '..');

const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');
const grab = (n) => {
  const i = src.indexOf('function ' + n + '(');
  if(i < 0) throw new Error('לא נמצא: ' + n);
  let d = 0;
  for(let k = src.indexOf('{', i); k < src.length; k++){
    if(src[k] === '{') d++; else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k+1); }
  }
};
const chunk = (re) => { const m = src.match(re); if(!m) throw new Error('לא נמצא: ' + re); return m[0]; };

// הקוד האמיתי מתוך index.html
const gender = src.match(/const PREFER_FEMALE = true;/)[0] + '\n'
             + src.match(/const FEMALE_VOICE = [\s\S]*?;\n/)[0]
             + src.match(/const MALE_VOICE   = [\s\S]*?;\n/)[0];
const real = [
  chunk(/const NEEDS_KEEPALIVE = [\s\S]*?\nlet keepAliveTimer = null;/),
  grab('stopKeepAlive'), grab('maybeStopKeepAlive'), grab('startKeepAlive'),
  chunk(/let voicesLoaded = false;[\s\S]*?\n  return voicesPromise;\n\}/),
  gender,
  chunk(/const LANG_HINT = \{[\s\S]*?\};/),
  grab('safeVoices'), grab('voiceScore'), grab('bestVoiceFor'), grab('pickVoice'),
  /* הפיצול והעוזרים שלו — בלעדיהם speakLocalNow זורק והבדיקה
     בודקת סביבה שבורה במקום את הקוד. */
  src.slice(src.indexOf('const SEG_MAX ='), src.indexOf('function insideNumber(')),
  grab('insideNumber'), grab('segments'),
  grab('speakLocal'), grab('speakLocalNow')
].join('\n\n');

// ---- סביבת דמה ----
function makeSynth(opts = {}){
  const listeners = {};
  return {
    _voices: opts.voices || [],
    speaking:false, pending:false, paused:false, spoke:[],
    getVoices(){ if(opts.throwVoices) throw new Error('boom'); return this._voices; },
    addEventListener(e, f){ (listeners[e] = listeners[e] || []).push(f); },
    removeEventListener(e, f){ if(listeners[e]) listeners[e] = listeners[e].filter(x => x !== f); },
    fire(e){ (listeners[e] || []).slice().forEach(f => f()); },
    speak(u){
      if(opts.throwSpeak) throw new Error('speak נכשל');
      this.spoke.push(u); this.speaking = true;
      if(opts.silent){ setTimeout(() => { this.speaking = false; }, 40); return; }
      setTimeout(() => { this.speaking = false;
        if(opts.errorWith) u.onerror({error: opts.errorWith}); else u.onend(); }, opts.delay || 30);
    },
    cancel(){ this.speaking = false; }, pause(){ this.paused = true; }, resume(){ this.paused = false; }
  };
}
function ctxFor(synth){
  const c = {
    synth, voice:null, manualStop:false, DEV:false, console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    navigator:{ userAgent:'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile' },
    LANGS:{ he:{tts:'he-IL',name:'עברית'}, en:{tts:'en-US',name:'English'} },
    S:{ lang:'he', rate:0.85, ttsRate:1 },
    /* שפת הדיבור הולכת אחרי המאגר. כאן אין מאגר, ולכן שפת הממשק. */
    speechLang: () => c.S.lang,
    VOICE_TUNE:{ he:{base:0.82,pitch:1.0} },
    KARAOKE:{ supported:false, node:null, spans:[], cur:-1 },
    speechMap: t => ({ spoken:t, words:[] }),
    clearKaraoke(){}, highlightWord(){}, highlightWhole(){}, paintWords(){ return []; },
    SpeechSynthesisUtterance: function(text){ this.text = text; }
  };
  vm.createContext(c); vm.runInContext(real, c); return c;
}
const speak = (c, text = 'שלום') => new Promise(res => {
  vm.runInContext('globalThis.__done = null;', c);
  c.__cb = (why) => res(why);
  vm.runInContext(`speakLocal(${JSON.stringify(text)}, () => __cb('done'), null, () => __cb('error'))`, c);
});

let fails = 0;
const ok = (label, cond, extra = '') => {
  if(cond) console.log('✓ ' + label + (extra ? '  →  ' + extra : ''));
  else { fails++; console.log('✗ ' + label + '  ' + extra); }
};

(async () => {
  const V = (name, lang) => ({name, lang, localService:true});

  // 1 — הקולות מגיעים רק אחרי voiceschanged
  {
    const s = makeSynth({ voices: [] });
    const c = ctxFor(s);
    const p = speak(c);
    await new Promise(r => setTimeout(r, 50));
    ok('לא מדבר לפני שהקולות נטענו', s.spoke.length === 0, `נאמרו ${s.spoke.length}`);
    s._voices = [V('Google עברית','he-IL')];
    s.fire('voiceschanged');
    const why = await p;
    ok('מדבר אחרי voiceschanged', s.spoke.length === 1 && why === 'done');
    ok('בחר את הקול העברי ולא ברירת מחדל', s.spoke[0].voice && s.spoke[0].voice.name === 'Google עברית',
       s.spoke[0].voice ? s.spoke[0].voice.name : '(אין)');
    ok('u.lang נלקח מהקול עצמו', s.spoke[0].lang === 'he-IL', s.spoke[0].lang);
  }

  // 2 — voiceschanged שלא נורה לעולם (Safari): פולינג מציל
  {
    const s = makeSynth({ voices: [] });
    const c = ctxFor(s);
    const p = speak(c);
    setTimeout(() => { s._voices = [V('Carmit','he-IL')]; }, 200);   /* בלי fire */
    const why = await p;
    ok('פולינג תופס קולות גם בלי אירוע', why === 'done' && s.spoke[0].voice.name === 'Carmit');
  }

  // 3 — אין קולות בכלל: תקרת הזמן משחררת ולא נתקעים
  {
    const s = makeSynth({ voices: [] });
    const c = ctxFor(s);
    const t0 = Date.now();
    const why = await speak(c);
    const dt = Date.now() - t0;
    ok('תקרת 4 שניות משחררת ומדבר בכל זאת', why === 'done' && dt >= 3900 && dt < 6000, dt + 'ms');
  }

  // 4 — onend שלא נורה לעולם: השומר משחרר את התור
  {
    const s = makeSynth({ voices:[V('Carmit','he-IL')], silent:true });
    const c = ctxFor(s);
    const t0 = Date.now();
    const why = await speak(c);
    ok('שומר הזמן משחרר תור תקוע', why === 'done', (Date.now()-t0) + 'ms');
  }

  // 5 — synth.speak שזורק
  {
    const s = makeSynth({ voices:[V('Carmit','he-IL')], throwSpeak:true });
    const c = ctxFor(s);
    const why = await speak(c);
    ok('חריגה ב-speak נתפסת ומדווחת כשגיאה', why === 'error', why);
  }

  // 6 — getVoices שזורק
  {
    const s = makeSynth({ throwVoices:true });
    const c = ctxFor(s);
    const t0 = Date.now();
    const why = await speak(c);
    ok('getVoices שזורק לא מפיל את האפליקציה', why === 'done', (Date.now()-t0) + 'ms');
  }

  // 7 — ביטול יזום אינו שגיאה
  {
    const s = makeSynth({ voices:[V('Carmit','he-IL')], errorWith:'canceled' });
    const c = ctxFor(s);
    ok('onerror=canceled נחשב סיום רגיל, לא תקלה', await speak(c) === 'done');
  }

  // 8 — שגיאת מנוע אמיתית מדווחת
  {
    const s = makeSynth({ voices:[V('Carmit','he-IL')], errorWith:'synthesis-failed' });
    const c = ctxFor(s);
    ok('onerror אמיתי מדווח כשגיאה', await speak(c) === 'error');
  }

  // 9 — מנוע שנשאר paused מתעורר לפני ההקראה
  {
    const s = makeSynth({ voices:[V('Carmit','he-IL')] });
    s.paused = true;
    const c = ctxFor(s);
    await speak(c);
    ok('resume נקרא על מנוע תקוע במצב paused', s.paused === false);
  }

  // פיצול משפט ארוך למקטעים
  {
    const s = makeSynth({ voices:[V('Carmit','he-IL')] });
    const c = ctxFor(s);
    const long = "אמבולנס של מגן דוד אדום, רכב של משטרת ישראל, ורכב לכיבוי שרפות. בזמן שהוא מפעיל אור מהבהב מותר לו לחרוג מן ההוראות. מה עליך לעשות?";
    await speak(c, long);
    const said = s.spoke.map(u => u.text);
    ok('משפט ארוך נאמר בכמה מקטעים', said.length > 1, said.length + ' מקטעים');
    ok('המקטעים יחד מרכיבים את הטקסט המלא',
       said.join('').replace(/\s+/g,' ').trim() === long.replace(/\s+/g,' ').trim(),
       said.join('').slice(0,46));
    ok('אף מקטע אינו ריק', said.every(t => t && t.trim().length));
  }

  // משפט קצר נשאר אמירה אחת
  {
    const s = makeSynth({ voices:[V('Carmit','he-IL')] });
    const c = ctxFor(s);
    await speak(c, 'משפט קצר.');
    ok('משפט קצר נשאר אמירה אחת', s.spoke.length === 1, s.spoke.length + '');
  }

  console.log(fails ? `\n${fails} בדיקות נכשלו` : '\nכל הבדיקות עברו');
  process.exit(fails ? 1 : 0);
})();
