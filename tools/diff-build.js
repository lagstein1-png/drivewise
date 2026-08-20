/* =====================================================================
   DriveWise · בנייה דיפרנציאלית
   כלי פיתוח. אפס תלויות.

   הבעיה שזה פותר: refresh מוחק כל מחרוזת שהחוקים נוגעים בה — כולל
   כאלה שכבר הוקלטו נכון בסבב קודם. לכן המספר טיפס 108 → 212 → 596
   → 884 → 1,420, ועם כל תיקון נוסף הוא היה ממשיך לגדול, כי כל תיקון
   ישן נספר מחדש לנצח.

   הפתרון: לזכור מה נשלח למנוע בפועל עבור כל קובץ. אחרי כל ייצור
   נשמר מניפסט של מזהה ← גיבוב הטקסט המדובר. הבנייה הדיפרנציאלית
   משווה את הגיבוב הנוכחי לשמור, ומחזירה רק את מה שבאמת השתנה.

   זה מדויק ולא הערכה: אין צורך לדעת מראש אילו מילים תוקנו, ואין
   סיכון לפספס מחרוזת שהושפעה בעקיפין.

   המניפסט משותף לכל הקולות, כי הטקסט הנשלח למנוע אינו תלוי בקול.

   שימוש:
     node tools/diff-build.js                 מה השתנה
     node tools/diff-build.js --apply         מוחק את מה שהשתנה
     node tools/diff-build.js --words a,b     רק מחרוזות המכילות מילים אלה
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { forSpeech, speechHash } = require('./speech');

const ROOT = path.resolve(__dirname, '..');

function manifestPath(lang){
  return path.join(ROOT, 'audio', lang, '.speech-manifest.json');
}

function readManifest(lang){
  const p = manifestPath(lang);
  if(!fs.existsSync(p)) return {};
  try{ return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch(e){ return {};  /* פגום — נתייחס כאילו אין, וניבנה מחדש */ }
}

function writeManifest(lang, map){
  const p = manifestPath(lang);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(map, null, 0), 'utf8');
}

/* רושם מזהה כמוקלט עם הטקסט הנוכחי. נקרא מ-tts-build אחרי כל קובץ. */
function recordGenerated(lang, id, text){
  const m = readManifest(lang);
  m[id] = speechHash(text);
  writeManifest(lang, m);
}

/* גרסה יעילה לכתיבה מרוכזת בסוף ריצה */
function recordMany(lang, pairs){
  const m = readManifest(lang);
  for(const [id, text] of pairs) m[id] = speechHash(text);
  writeManifest(lang, m);
  return Object.keys(m).length;
}

/* מה השתנה מאז ההקלטה?
   list — [{id, text}] מהמאגר.
   מחזיר { changed, unknown, unchanged } */
function diff(lang, list, opts){
  const man = readManifest(lang);
  const words = (opts && opts.words) || null;

  const changed = [], unknown = [], unchanged = [];
  for(const item of list){
    if(words && !words.some(w => item.text.indexOf(w) !== -1)) { unchanged.push(item); continue; }
    const now = speechHash(item.text);
    const was = man[item.id];
    if(was === undefined) unknown.push(item);       /* אין רישום — הוקלט לפני המניפסט */
    else if(was !== now)  changed.push(item);
    else                  unchanged.push(item);
  }
  return { changed, unknown, unchanged };
}

/* מסמן את כל מה שקיים על הדיסק כתואם לחוקים הנוכחיים.
   להרצה אך ורק מיד אחרי בנייה מלאה — אחרת נסמן כתקין קבצים
   שהוקלטו לפי חוקים ישנים, והם לא ייבנו מחדש לעולם. */
function seed(lang, list){
  const base = path.join(ROOT, 'audio', lang);
  if(!fs.existsSync(base)) return 0;
  const voices = fs.readdirSync(base, { withFileTypes: true })
                   .filter(d => d.isDirectory()).map(d => d.name);
  if(!voices.length) return 0;
  const m = readManifest(lang);
  let n = 0;
  for(const item of list){
    /* מספיק שקובץ אחד קיים — הטקסט הנשלח זהה בכל הקולות */
    if(voices.some(v => fs.existsSync(path.join(base, v, item.id + '.mp3')))){
      m[item.id] = speechHash(item.text);
      n++;
    }
  }
  writeManifest(lang, m);
  return n;
}

/* מוחק את הקבצים של הפריטים שנמסרו, בכל תיקיות הקול */
function removeFiles(lang, items){
  const base = path.join(ROOT, 'audio', lang);
  if(!fs.existsSync(base)) return { removed: 0, voices: [] };
  const voices = fs.readdirSync(base, { withFileTypes: true })
                   .filter(d => d.isDirectory()).map(d => d.name);
  let removed = 0;
  for(const v of voices){
    for(const it of items){
      const p = path.join(base, v, it.id + '.mp3');
      if(fs.existsSync(p)){ fs.unlinkSync(p); removed++; }
    }
  }
  return { removed, voices };
}

/* ---------------- הרצה ישירה ---------------- */
if(require.main === module){
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf('--' + n); return i > -1 ? argv[i + 1] : d; };
  const lang = arg('lang', 'he');
  const apply = argv.includes('--apply') || argv.includes('--yes');
  const words = arg('words') ? arg('words').split(',').map(s => s.trim()).filter(Boolean) : null;

  /* collect חי ב-tts-build; טוענים אותו כדי לא לשכפל את הרשימה */
  const { collect } = require('./bank');
  const list = collect(lang);

  if(argv.includes('--seed')){
    const n = seed(lang, list);
    console.log('');
    console.log('✓ נרשמו ' + n.toLocaleString() + ' מזהים כתואמים לחוקים הנוכחיים.');
    console.log('  מעכשיו diff-build ידע בדיוק מה השתנה.');
    process.exit(0);
  }

  const { changed, unknown, unchanged } = diff(lang, list, { words });

  console.log('\nשפה: ' + lang + ' · מחרוזות: ' + list.length.toLocaleString());
  if(words) console.log('סינון לפי מילים: ' + words.join(', '));
  console.log('');
  console.log('  השתנו מאז ההקלטה: ' + changed.length.toLocaleString());
  console.log('  ללא רישום במניפסט: ' + unknown.length.toLocaleString());
  console.log('  ללא שינוי: ' + unchanged.length.toLocaleString());

  /* --changed-only מוחק רק קבצים שההקראה שלהם באמת השתנתה, ולא
     כאלה שפשוט אינם במניפסט. זה מה שרץ לפני הייצור: קובץ בלי רישום
     הוא בדרך כלל חדש וייווצר ממילא, בעוד שקובץ שההקראה שלו השתנתה
     כבר קיים על הדיסק — והייצור מדלג על קבצים קיימים. */
  const todo = argv.includes('--changed-only') ? changed : changed.concat(unknown);
  if(!todo.length){ console.log('\nאין מה לבנות מחדש.'); process.exit(0); }

  console.log('\nלדוגמה:');
  changed.slice(0, 3).forEach(x => {
    console.log('  ' + x.text.slice(0, 44));
    console.log('  → ' + forSpeech(x.text).slice(0, 50));
  });

  if(!apply){
    console.log('\nלמחיקה בפועל הוסף --apply, ואז הרץ את הייצור.');
    process.exit(0);
  }

  const { removed, voices } = removeFiles(lang, todo);
  console.log('\n✓ נמחקו ' + removed.toLocaleString() + ' קבצים ב-' + voices.length + ' קולות.');
  console.log('  הרץ עכשיו run-generate-all.cmd — הוא ייצר רק את אלה.');
}

module.exports = { diff, seed, removeFiles, recordGenerated, recordMany,
                   readManifest, writeManifest, manifestPath };
