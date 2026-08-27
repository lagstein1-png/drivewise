/* קול רשת מול קול מקומי — התרחיש של Edge עם Hila המקוונת */
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
  pick(/const PREFER_FEMALE = true;/),
  pick(/const FEMALE_VOICE = [\s\S]*?;\n/),
  pick(/const MALE_VOICE   = [\s\S]*?;\n/),
  pick(/const LANG_HINT = \{[\s\S]*?\};/),
  grab('safeVoices'), grab('voiceScore'), grab('bestVoiceFor'), grab('pickVoice')
].join('\n');

const V = (name, lang, localService) => ({ name, lang, localService });

/* הקולות האמיתיים: Asaf מקומי גברי, Hila מקוונת נוירלית נשית */
const ASAF = V('Microsoft Asaf - Hebrew (Israel)', 'he-IL', true);
const HILA = V('Microsoft Hila Online (Natural) - Hebrew (Israel)', 'he-IL', false);

function run(voices, opts){
  const ctx = {
  /* שפת הדיבור הולכת אחרי המאגר. כאן אין מאגר, ולכן היא שפת הממשק —
     בדיוק ההתנהגות שהייתה לפני שהופרדו השתיים. */
  speechLang: () => ctx.S.lang,
    LANGS: { he:{tts:'he-IL',name:'עברית'}, en:{tts:'en-US',name:'English'} },
    S: { lang: 'he' }, voice: null, console,
    NET_VOICE_OK: opts.netOk !== false,
    navigator: { onLine: opts.online !== false },
    synth: { getVoices: () => voices }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const v = vm.runInContext('pickVoice()', ctx);
  const score = n => vm.runInContext(
    'voiceScore(' + JSON.stringify(n) + ", 'he-IL','he',LANG_HINT.he)", ctx);
  return { picked: v ? v.name : null, asaf: score(ASAF), hila: score(HILA) };
}

let bad = 0;
const is = (label, got, want, extra) => {
  const ok = got === want;
  if(!ok) bad++;
  console.log((ok ? '✓ ' : '✗ ') + label + '  →  ' + got + (extra ? '   ' + extra : ''));
};

let r = run([ASAF, HILA], { online: true, netOk: true });
is('מקוון: Hila הנשית הנוירלית מנצחת', r.picked, HILA.name,
   `(Hila ${r.hila} מול Asaf ${r.asaf})`);

r = run([ASAF, HILA], { online: false, netOk: true });
is('בלי אינטרנט: נבחר הקול המקומי', r.picked, ASAF.name,
   `(Hila ${r.hila} מול Asaf ${r.asaf})`);

r = run([ASAF, HILA], { online: true, netOk: false });
is('אחרי כישלון של קול רשת: עוברים למקומי', r.picked, ASAF.name,
   `(Hila ${r.hila} מול Asaf ${r.asaf})`);

r = run([HILA], { online: false, netOk: true });
is('אין חלופה מקומית — עדיין בוחרים משהו ולא כלום', r.picked, HILA.name);

r = run([ASAF], { online: true, netOk: true });
is('אין קול רשת בכלל — המקומי נבחר כרגיל', r.picked, ASAF.name);

console.log(bad ? `\n${bad} נכשלו` : '\nכל בדיקות קול הרשת עברו');
process.exit(bad ? 1 : 0);
