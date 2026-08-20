/* נתיב שורש הפרויקט, כדי שהבדיקה תרוץ מכל מקום ולא רק מהמחשב
   שעליו נכתבה. זה מה שמאפשר לה לרוץ גם ב-GitHub Actions. */
const ROOT = require('path').resolve(__dirname, '..');

const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');
const grab = (n) => {
  const i = src.indexOf('function ' + n + '(');
  let d = 0;
  for(let k = src.indexOf('{', i); k < src.length; k++){
    if(src[k] === '{') d++; else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k+1); }
  }
};
const pick = (re) => src.match(re)[0];
const code = [
  pick(/const PREFER_FEMALE = true;/), pick(/const FEMALE_VOICE = [\s\S]*?;\n/),
  pick(/const MALE_VOICE   = [\s\S]*?;\n/), pick(/const LANG_HINT = \{[\s\S]*?\};/),
  grab('safeVoices'), grab('voiceScore'), grab('bestVoiceFor'), grab('pickVoice')
].join('\n');

const V = (name, lang, local = true) => ({name, lang, localService: local});
const ctx = { LANGS:{ he:{tts:'he-IL',name:'עברית'}, ar:{tts:'ar-SA',name:'العربية'},
                      en:{tts:'en-US',name:'English'}, ru:{tts:'ru-RU',name:'Русский'} },
              S:{lang:'he'}, NET_VOICE_OK: true, navigator: { onLine: true }, synth:{ getVoices: () => ctx.voices }, voices:[], voice:null, console };
vm.createContext(ctx); vm.runInContext(code, ctx);
const p = (v, l='he') => { ctx.voices = v; ctx.S.lang = l; return vm.runInContext('pickVoice()', ctx); };

let fails = 0;
const is = (label, got, want) => {
  const g = got ? got.name : '(null)';
  if(g !== want){ fails++; console.log(`✗ ${label}\n    התקבל: ${g}   ציפינו: ${want}`); }
  else console.log(`✓ ${label}  →  ${g}`);
};

is('עברית: Hila הנשית מנצחת את Asaf הגברי (שניהם Microsoft)',
   p([V('Microsoft Asaf - Hebrew (Israel)','he-IL'), V('Microsoft Hila - Hebrew (Israel)','he-IL')]),
   'Microsoft Hila - Hebrew (Israel)');
is('עברית: Carmit מנצחת קול גברי גנרי',
   p([V('Hebrew Male','he-IL'), V('Carmit','he-IL')]), 'Carmit');
is('סימון female מפורש בשם',
   p([V('Hebrew Voice 1 male','he-IL'), V('Hebrew Voice 2 female','he-IL')]), 'Hebrew Voice 2 female');
is('נשי לא גובר על התאמת שפה',
   p([V('Samantha','en-US'), V('Microsoft Asaf - Hebrew (Israel)','he-IL')]),
   'Microsoft Asaf - Hebrew (Israel)');
is('נשי לא גובר על espeak מול קול תקין',
   p([V('eSpeak Carmit female','he-IL'), V('Microsoft Asaf - Hebrew (Israel)','he-IL')]),
   'Microsoft Asaf - Hebrew (Israel)');
is('אין נשי — נשאר עם הגברי ולא נופל לאנגלית',
   p([V('Microsoft Asaf - Hebrew (Israel)','he-IL'), V('Samantha','en-US')]),
   'Microsoft Asaf - Hebrew (Israel)');
is('נפילה לאנגלית בוחרת קול נשי',
   p([V('Microsoft David - English (United States)','en-US'), V('Microsoft Zira - English (United States)','en-US')]),
   'Microsoft Zira - English (United States)');
is('"female" אינו מזוהה בטעות כ-male',
   p([V('Hebrew female','he-IL'), V('Hebrew plain','he-IL')]), 'Hebrew female');
is('ערבית: Hoda הנשית',
   p([V('Maged','ar-SA'), V('Hoda','ar-SA')], 'ar'), 'Hoda');
is('רוסית: Irina הנשית',
   p([V('Yuri','ru-RU'), V('Irina','ru-RU')], 'ru'), 'Irina');
is('Google גברי מול נשי לא ממותג — Google מנצח באיכות',
   p([V('Google עברית male','he-IL'), V('Carmit','he-IL')]), 'Google עברית male');

console.log(fails ? `\n${fails} נכשלו` : '\nכל בדיקות המגדר עברו');
process.exit(fails ? 1 : 0);
