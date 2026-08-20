/* נתיב שורש הפרויקט, כדי שהבדיקה תרוץ מכל מקום ולא רק מהמחשב
   שעליו נכתבה. זה מה שמאפשר לה לרוץ גם ב-GitHub Actions. */
const ROOT = require('path').resolve(__dirname, '..');

const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');

// שולפים את הקוד האמיתי מתוך index.html — לא עותק
const grab = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('לא נמצא: ' + name);
  let d = 0;
  for(let k = src.indexOf('{', i); k < src.length; k++){
    if(src[k] === '{') d++;
    else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k + 1); }
  }
};
const gender = src.match(/const PREFER_FEMALE = true;/)[0] + '\n'
             + src.match(/const FEMALE_VOICE = [\s\S]*?;\n/)[0]
             + src.match(/const MALE_VOICE   = [\s\S]*?;\n/)[0];
const hint = src.match(/const LANG_HINT = \{[\s\S]*?\};/)[0];
const code = [gender, hint].concat(['safeVoices','voiceScore','bestVoiceFor','pickVoice'].map(grab)).join('\n\n');

const V = (name, lang, localService = true) => ({ name, lang, localService });
const ctx = {
  LANGS: { he:{tts:'he-IL',name:'עברית'}, ar:{tts:'ar-SA',name:'العربية'},
           en:{tts:'en-US',name:'English'}, ru:{tts:'ru-RU',name:'Русский'} },
  S: { lang:'he' }, NET_VOICE_OK: true, navigator: { onLine: true }, synth: { getVoices: () => ctx.voices }, voices: [], voice: null, console
};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const pick = (voices, lang = 'he') => { ctx.voices = voices; ctx.S.lang = lang; return vm.runInContext('pickVoice()', ctx); };

let fails = 0;
const is = (label, got, want) => {
  const g = got ? got.name : '(null)';
  if(g !== want){ fails++; console.log(`✗ ${label}\n    התקבל: ${g}   ציפינו: ${want}`); }
  else console.log(`✓ ${label}  →  ${g}`);
};

is('Google he-IL מנצח קול יצרן עברי',
   pick([V('Samsung Hebrew','he-IL'), V('Google עברית','he-IL'), V('espeak he','he')]), 'Google עברית');
is('Microsoft he-IL מנצח קול גנרי',
   pick([V('Hebrew Israel','he-IL'), V('Microsoft Asaf - Hebrew (Israel)','he-IL',false)]), 'Microsoft Asaf - Hebrew (Israel)');
is('מותג Google גובר על he-IL מדויק — כפי שביקש המשתמש',
   pick([V('Google he','he'), V('Carmit','he-IL')]), 'Google he');
is('בין שני קולות מאותו מותג — he-IL המדויק מנצח',
   pick([V('Google he','he'), V('Google עברית','he-IL')]), 'Google עברית');
is('he_IL עם קו תחתון (אנדרואיד) מזוהה',
   pick([V('en-US default','en-US'), V('Google Hebrew','he_IL')]), 'Google Hebrew');
is('espeak נדחה לטובת כל קול עברי אחר',
   pick([V('eSpeak Hebrew','he-IL'), V('Carmit','he-IL')]), 'Carmit');
is('אין קול עברי → הקול האנגלי האיכותי ביותר',
   pick([V('Microsoft David - English (US)','en-US'), V('Google US English','en-US',false),
         V('eSpeak English','en-US'), V('Yuri Russian','ru-RU')]), 'Google US English');
is('אין עברית ואין אנגלית → null, הדפדפן יבחר',
   pick([V('Yuri Russian','ru-RU'), V('Maged Arabic','ar-SA')]), '(null)');
is('רשימה ריקה → null', pick([]), '(null)');
is('שפת ממשק אנגלית לא נופלת פעמיים',
   pick([V('Google US English','en-US',false)], 'en'), 'Google US English');
is('רוסית בלי קול רוסי → נופל לאנגלית',
   pick([V('Microsoft Zira - English (US)','en-US')], 'ru'), 'Microsoft Zira - English (US)');
is('lang ריק אבל השם באנגלית רומז לעברית',
   pick([V('Hebrew Female','')]), 'Hebrew Female');
is('lang ריק והשם בעברית',
   pick([V('קול עברית','')]), 'קול עברית');
is('רמז לפי שם לא גובר על התאמת שפה אמיתית',
   pick([V('Hebrew Female',''), V('Carmit','he-IL')]), 'Carmit');
is('getVoices שזורק → null בלי קריסה', (() => {
   ctx.synth = { getVoices(){ throw new Error('boom'); } };
   const r = vm.runInContext('pickVoice()', ctx);
   ctx.synth = { getVoices: () => ctx.voices };
   return r; })(), '(null)');

console.log(fails ? `\n${fails} בדיקות נכשלו` : `\nכל ${15} הבדיקות עברו`);
process.exit(fails ? 1 : 0);
