/* =====================================================================
   תאוריה מדברת · ניקוי פלט של הנקדן
   כלי פיתוח. אפס תלויות. לא דורש מפתח.

   הנקדן של דיקטה מנקד בכתיב חסר. כשמבקשים ממנו לשמור על הכתיב המלא
   הוא לא מוחק את אֵם הקריאה — הוא משאיר אותה ערומה, שם את התנועה על
   האות שלפניה, ומסמן אותה במֶתֶג:

     צֹוֽמֶת     במקום  צוֹמֶת
     מֻוֽתָּר     במקום  מוּתָּר

   זו נוטציה בלשנית ולא כתיב. מנוע הקראה רואה וי"ו בלי תנועה והוגה
   אותה כעיצור, ואת המתג הוא קורא כהטעמה. כאן מזיזים את התנועה אל
   אֵם הקריאה ומורידים את המתג.

   אף אות אינה נוספת, נמחקת או מוחלפת — רק סימנים זזים. לכן
   raw === stripNikud(pointed) ממשיך להתקיים.

     node tools/normalize-dicta.js --dir data --dry-run
     node tools/normalize-dicta.js --dir data
     echo צֹוֽמֶת | node tools/normalize-dicta.js --stdin
     node tools/normalize-dicta.js --file data/speech-he.json

   *** מה הכלי הזה אינו עושה ***
   הוא מנקה טקסט. הוא אינו מקליט, אינו מוחק שמע ואינו נוגע במניפסט.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { fixMaters } = require('./mater');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const has = f => argv.indexOf('--' + f) !== -1;
const val = (f, d) => { const i = argv.indexOf('--' + f); return i > -1 ? argv[i + 1] : d; };

const dry = has('dry-run');
const METEG = /ֽ/g;
const MATER = /[ֹֻ]ֽ?ו(?![ְ-ּֿ-ׇ])/;

/* קבצי טקסט בלבד. שמע ובינארי לא נפתחים כאן. */
const READABLE = /\.(json|txt|md|csv)$/i;

function scan(text){
  return {
    meteg: (text.match(METEG) || []).length,
    mater: (text.split(/[^\p{L}\p{N}\p{M}]+/u).filter(t => MATER.test(t))).length
  };
}

function doFile(file){
  const rel = path.relative(ROOT, file);
  let before;
  try{ before = fs.readFileSync(file, 'utf8'); }
  catch(e){ console.log('  ✗ ' + rel + '  ' + e.message); return 0; }

  const found = scan(before);
  if(!found.meteg && !found.mater){
    console.log('  · ' + rel.padEnd(34) + 'נקי');
    return 0;
  }

  const after = fixMaters(before);
  const left = scan(after);

  console.log('  ' + (dry ? '?' : '✓') + ' ' + rel.padEnd(34) +
              'מֶתֶג ' + found.meteg + ' → ' + left.meteg +
              '   אֵם קריאה ' + found.mater + ' → ' + left.mater);

  if(!dry && after !== before) fs.writeFileSync(file, after, 'utf8');
  return found.meteg + found.mater;
}

function walk(dir, out){
  for(const name of fs.readdirSync(dir)){
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if(st.isDirectory()) walk(p, out);
    /* קבצים שמתחילים בנקודה הם מטמון בנייה. .dicta-raw.json נשמר
       במכוון כפי שהנקדן החזיר אותו, כדי שאפשר יהיה לבנות ממנו מחדש
       אחרי שינוי חוק. נרמול במקום הורס בדיוק את התכונה הזאת. */
    else if(name[0] === '.'){
      if(has('include-cache')) out.push(p);
    }
    else if(READABLE.test(name)) out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------------ */
if(has('stdin')){
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => buf += d);
  process.stdin.on('end', () => {
    process.stdout.write(fixMaters(buf));
    if(!buf.endsWith('\n')) process.stdout.write('\n');
  });
} else if(has('file')){
  const f = path.resolve(ROOT, val('file'));
  console.log('');
  doFile(f);
  console.log('');
} else if(has('dir')){
  const dir = path.resolve(ROOT, val('dir'));
  if(!fs.existsSync(dir)){
    console.error('\n✗ אין תיקייה כזאת: ' + dir + '\n');
    process.exit(1);
  }
  const files = walk(dir, []);
  console.log('\n' + (dry ? 'בדיקה בלבד — לא נכתב דבר.' : 'מתקן במקום.'));
  console.log(files.length + ' קבצי טקסט ב-' + path.relative(ROOT, dir) + '\n');

  let total = 0;
  for(const f of files) total += doFile(f);

  console.log('\n  סימנים שנמצאו: ' + total.toLocaleString());
  if(!total){
    console.log('  אין מה לתקן. אם ציפית למצוא כאן ניקוד של דיקטה —');
    console.log('  ייתכן שהקובץ שחיפשת אינו קיים יותר.');
  } else if(dry){
    console.log('  לתיקון בפועל, הרץ שוב בלי --dry-run.');
  }
  console.log('');
} else {
  console.log([
    '',
    'שימוש:',
    '  node tools/normalize-dicta.js --dir data --dry-run',
    '  node tools/normalize-dicta.js --dir data',
    '  node tools/normalize-dicta.js --file data/speech-he.json',
    '  echo צֹוֽמֶת | node tools/normalize-dicta.js --stdin',
    ''
  ].join('\n'));
}
