/* מוודא שהמזהים שהאפליקציה מחפשת זהים למזהים שהכלי מייצר.
   אם שני הצדדים לא מסכימים — אף קובץ לא יימצא. */
/* נתיב שורש הפרויקט, כדי שהבדיקה תרוץ מכל מקום ולא רק מהמחשב
   שעליו נכתבה. זה מה שמאפשר לה לרוץ גם ב-GitHub Actions. */
const ROOT = require('path').resolve(__dirname, '..');

const fs = require('fs'), vm = require('vm'), path = require('path');

const src = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');

/* שולפים בלוק שמתחיל בהצהרה ונסגר בסוגר המאזן שלה */
function block(decl, open, close){
  const i = src.indexOf(decl);
  if(i < 0) throw new Error('לא נמצא: ' + decl);
  let d = 0;
  for(let k = src.indexOf(open, i); k < src.length; k++){
    if(src[k] === open) d++;
    else if(src[k] === close){ d--; if(!d) return src.slice(i, k + 1); }
  }
  throw new Error('לא נסגר: ' + decl);
}

const code = [
  block('const HE_NUM = [', '[', ']') + ';',
  block('const LANGS = {', '{', '}') + ';',
  block('const UI = {', '{', '}') + ';',
  block('const PRACTICE = [', '[', ']') + ';',
  block('function audioId(', '{', '}'),
  block('function buildAudioMap(', '{', '}')
].join('\n\n');

/* נתוני אמת: אותו מאגר, ומיזוג הרמזים בדיוק כמו ב-loadBank */
const items = JSON.parse(fs.readFileSync(ROOT + '/data/questions.he.json', 'utf8'));
const hints = JSON.parse(fs.readFileSync(ROOT + '/data/hints.he.json', 'utf8'));
for(const q of items){
  const x = hints[q.id];
  if(!x) continue;
  if(x.h1) q.h1 = x.h1;
  if(x.h2) q.h2 = x.h2;
  if(x.p)  q.p  = x.p;
}

const ctx = { STATIC: { map: new Map() }, BANK: { items }, S: { lang: 'he' }, console };
vm.createContext(ctx);
vm.runInContext(code, ctx);
vm.runInContext('buildAudioMap()', ctx);

const appMap = ctx.STATIC.map;                        /* 'lang|text' → id */
const appIds = new Set([...appMap.values()]);

/* צד הכלי — ייבוא ישיר של המודול */
const toolList = require(ROOT + '/tools/bank').collect('he');
const toolIds = new Set(toolList.map(x => x.id));

let bad = 0;
const say = (ok, msg) => { if(!ok) bad++; console.log((ok ? '✓ ' : '✗ ') + msg); };

/* 1 — הכלי משתמש בפונקציות של האפליקציה עצמה, לא בעותק שלהן.
   אם ההרצה הזאת עברה, המימוש אחד ויחיד מעצם הבנייה. */
say(toolIds.size > 0, `הכלי הריץ את buildAudioMap של האפליקציה — ${toolIds.size.toLocaleString()} מזהים`);

/* 2 — כל מה שהכלי מייצר, האפליקציה מחפשת */
const orphan = [...toolIds].filter(id => !appIds.has(id));
say(orphan.length === 0,
    `כל ${toolIds.size.toLocaleString()} הקבצים שהכלי מייצר נמצאים במפה של האפליקציה` +
    (orphan.length ? ` — ${orphan.length} יתומים` : ''));

/* 3 — כל מחרוזת מהמאגר שהאפליקציה תבקש, יש לה קובץ */
let missing = 0, checked = 0;
for(const q of items){
  for(const txt of [q.q, ...(q.o || []), q.h1, q.h2, q.p]){
    if(typeof txt !== 'string' || !txt.trim()) continue;
    checked++;
    const id = appMap.get('he|' + txt);
    if(!id || !toolIds.has(id)) missing++;
  }
}
say(missing === 0, `כל ${checked.toLocaleString()} המחרוזות במאגר ממופות לקובץ שייוצר` +
                   (missing ? ` — ${missing} חסרות` : ''));

/* 3ב — הכיוון ההפוך: כל מה שהאפליקציה עשויה להשמיע בעברית חייב
   קובץ. בלי הבדיקה הזאת מחרוזת ממשק חדשה שנאמרת בקול — למשל
   "תשובה 1" — נשארת בלי הקלטה, ואז נשמע מעבר קול באמצע שאלה. */
const heOnly = [...appMap].filter(([k]) => k.slice(0, k.indexOf("|")) === "he");
const unrecorded = heOnly.filter(([, id]) => !toolIds.has(id));
say(unrecorded.length === 0,
    `כל ${heOnly.length.toLocaleString()} מחרוזות העברית שהאפליקציה מחפשת ייוצרו` +
    (unrecorded.length ? ` — ${unrecorded.length} בלי קובץ: ` +
      unrecorded.slice(0,4).map(([k]) => k.slice(k.indexOf("|")+1).slice(0,24)).join(" | ") : ""));

/* 4 — כפילויות באמת מתאחדות */
say(appMap.size > toolIds.size,
    `איחוד כפילויות: ${appMap.size.toLocaleString()} מחרוזות → ${toolIds.size.toLocaleString()} קבצים`);

/* 5 — אין התנגשויות גיבוב: שני טקסטים שונים עם אותו מזהה */
const byId = new Map();
let collide = 0;
for(const [k, id] of appMap){
  const txt = k.slice(k.indexOf('|') + 1).trim().replace(/\s+/g, ' ');
  if(byId.has(id) && byId.get(id) !== txt){ collide++; console.log('   ', byId.get(id), '≠', txt); }
  else byId.set(id, txt);
}
say(collide === 0, 'אין התנגשויות גיבוב' + (collide ? ` — ${collide}` : ''));

/* 6 — עריכת טקסט מייצרת מזהה חדש (הגנה מפני קובץ ישן על טקסט חדש) */
const before = vm.runInContext('audioId("מה פירוש התמרור?")', ctx);
const after  = vm.runInContext('audioId("מה פירוש התמרור הזה?")', ctx);
say(before !== after, 'עריכת ניסוח משנה את המזהה — קובץ ישן לא ינוגן על טקסט חדש');

console.log(bad ? `\n${bad} נכשלו` : '\nהאפליקציה והכלי מסונכרנים');
process.exit(bad ? 1 : 0);
