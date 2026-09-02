/* =====================================================================
   מוודא שמה שהדף מבקש הוא בדיוק מה שה-service worker הקדים לטעון.

   ההגשה מהמטמון ב-sw.js היא caches.match(req) בלי ignoreSearch, ולכן
   ההשוואה היא על הכתובת המלאה — query כלול. די ב-?v= אחד בצד הדף כדי
   שרשומת ה-PRECACHE לעולם לא תיענה: הקובץ יושב במטמון, לא נמצא,
   ואופליין הטעינה נכשלת בשקט.

   זה קרה עם data/speech-rules.json (v98): הדף ביקש אותו עם ?v=BUILD,
   ה-worker הקדים לטעון את הכתובת החשופה, וההקראה אופליין חזרה לבטא
   שגוי בדיוק את המילים שתוקנו.
   ===================================================================== */
'use strict';

const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

const html = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');
const sw   = fs.readFileSync(ROOT + '/sw.js', 'utf8').split('\r\n').join('\n');

const fails = [];
function check(ok, msg){ if(!ok) fails.push(msg); }

/* --- מה ה-worker מקדים לטעון --- */
const m = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
check(!!m, 'לא נמצא PRECACHE ב-sw.js');
const precache = m
  ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1].replace(/^\.\//, ''))
  : [];
check(precache.length > 0, 'PRECACHE ריק');

/* --- מה הדף מבקש --- */
/* רק מחרוזות ליטרליות; כתובת שנבנית ממשתנה אינה ניתנת להשוואה כאן */
const asked = [];
for(const x of html.matchAll(/fetch\(\s*(['"`])([^'"`]*)\1/g)){
  const url = x[2];
  if(/^[a-z]+:|^\/\//i.test(url)) continue;          /* מקור חיצוני */
  if(url.includes('${')) continue;                    /* נבנית בזמן ריצה */
  asked.push({ url, line: html.slice(0, x.index).split('\n').length });
}
check(asked.length > 0, 'לא נמצאה אף בקשת fetch יחסית ב-index.html');

/* --- ההצלבה --- */
for(const a of asked){
  const [p, q] = a.url.split('?');
  const bare = p.replace(/^\.\//, '');
  if(!precache.includes(bare)) continue;              /* לא מוקדם-טעינה */
  check(q === undefined,
    'index.html:' + a.line + ' מבקש ' + a.url + ' עם query, אבל sw.js ' +
    'מקדים לטעון ' + bare + ' בלי query — שתי הכתובות אינן אותה רשומה, ' +
    'והקובץ לא יימצא אופליין');
}

/* --- הגרסה נמצאת במקום אחד, וה-CHANGELOG מסכים איתה --- */
const build = (html.match(/const BUILD = '([^']+)'/) || [])[1];
check(!!build, "לא נמצא const BUILD ב-index.html");
check(/serviceWorker\.register\('sw\.js\?v=' \+ BUILD\)/.test(html),
  'רישום ה-service worker אינו נגזר מ-BUILD — מפתח המטמון יישאר ישן');

const top = (fs.readFileSync(ROOT + '/CHANGELOG.md', 'utf8').match(/^## (\S+)/m) || [])[1];
check(top === build,
  'CHANGELOG פותח ב-' + top + ' ואילו BUILD הוא ' + build);

if(fails.length){
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('  ✓ ' + asked.length + ' בקשות מוצלבות מול ' + precache.length +
            ' רשומות PRECACHE · BUILD=' + build);
