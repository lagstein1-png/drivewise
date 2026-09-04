/* אבחון מצב הקול.
   הלקח שמאחורי הקובץ הזה: רשימת קולות ריקה אינה עדות לכך שאין הקראה.
   יש מכשירי אנדרואיד שמחזירים רשימה ריקה תמיד ומדברים מצוין בקול
   ברירת המחדל. גרסה קודמת הסיקה מכאן "הדפדפן לא תומך בהקראה"
   והציגה זאת למשתמש שההקראה עבדה אצלו — בדיוק ההפך מהאמת. */
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
    if(src[k] === '{') d++; else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k + 1); }
  }
};
const pick = re => { const m = src.match(re); if(!m) throw new Error('לא נמצא: ' + re); return m[0]; };

const code = [
  pick(/const PREFER_FEMALE\s+= true;/),
  pick(/const FEMALE_VOICE\s*=[^\n]*\n/),
  pick(/const MALE_VOICE\s*=[^\n]*\n/),
  pick(/const LANG_HINT = \{[\s\S]*?\};/),
  grab('safeVoices'), grab('voiceScore'), grab('bestVoiceFor'),
  grab('pickVoice'), grab('voiceStatus')
].join('\n');

const V = (name, lang, local = true) => ({ name, lang, localService: local });

function status(voices, loaded, lang, hasApi){
  const ctx = {
  /* שפת הדיבור הולכת אחרי המאגר. כאן אין מאגר, ולכן היא שפת הממשק —
     בדיוק ההתנהגות שהייתה לפני שהופרדו השתיים. */
  speechLang: () => ctx.S.lang,
    LANGS: { he:{tts:'he-IL',name:'עברית'}, en:{tts:'en-US',name:'English'} },
    S: { lang: lang || 'he' }, voice: null, console,
    NET_VOICE_OK: true, navigator: { onLine: true },
    voicesLoaded: loaded,
    synth: { getVoices: () => voices },
    window: hasApi === false ? {} : { speechSynthesis: {} }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return vm.runInContext('voiceStatus()', ctx);
}

let bad = 0;
const is = (label, got, want) => {
  const ok = got === want;
  if(!ok) bad++;
  console.log((ok ? '✓ ' : '✗ ') + label + '  →  ' + got + (ok ? '' : '   ציפינו: ' + want));
};

is('רשימה ריקה לפני הטעינה — שקט, בלי אזעקה',
   status([], false), 'ok');

is('רשימה ריקה גם אחרי הטעינה — עדיין לא מכריזים על תקלה',
   status([], true), 'ok');

is('יש קולות אבל אף אחד לא בעברית — נפילה לשפה אחרת',
   status([V('Microsoft Zira', 'en-US')], true), 'fallback');

is('יש קול עברי — תקין',
   status([V('Microsoft Asaf - Hebrew (Israel)', 'he-IL')], true), 'ok');

is('אין speechSynthesis בכלל — רק כאן מותר להכריז שאין תמיכה',
   status([], true, 'he', false), 'none');

is('שפת ממשק אנגלית עם קול אנגלי — תקין',
   status([V('Microsoft Zira', 'en-US')], true, 'en'), 'ok');

console.log(bad ? `\n${bad} נכשלו` : '\nכל בדיקות האבחון עברו');
process.exit(bad ? 1 : 0);
