/* =====================================================================
   תאוריה מדברת · סדר הכניסה לצומת בנגן ההסבר

   ORDER ב-index.html מצמיד לשאלות זכות קדימה תגיות "ראשון / שני / שלישי"
   על הרכבים שבתמונה. תגית בסדר שגוי מלמדת בדיוק את הטעות שהשאלה באה
   למנוע, ולכן כל רשומה נבדקת מול התשובה הרשמית:

     · השאלה קיימת ויש לה תמונה
     · כל רכב בסדר מופיע ב-pts, וכל מיקום בתוך התמונה (0–100)
     · כל מספר בסוגריים בתשובה הנכונה מופיע בסדר
     · המספרים מופיעים בסדר לפי הסדר שבו התשובה מונה אותם —
       מי שהתשובה מזכירה קודם לא נכנס אחרי מי שהיא מזכירה אחריו
   ===================================================================== */
'use strict';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');
const m = html.match(/\nconst ORDER = (\{[\s\S]*?\n\});\n/) || html.match(/\nconst ORDER = (\{\});\n/);
if(!m){ console.log('✗ לא נמצא ORDER ב-index.html'); process.exit(1); }
const ORDER = vm.runInNewContext('(' + m[1] + ')');
const bank = Object.fromEntries(
  JSON.parse(fs.readFileSync(ROOT + '/data/questions.he.json', 'utf8')).map(q => [q.id, q]));

let bad = 0;
const fail = msg => { bad++; console.log('✗ ' + msg); };

for(const [id, e] of Object.entries(ORDER)){
  const q = bank[id];
  if(!q){ fail(id + ': אין שאלה כזאת במאגר'); continue; }
  if(!q.img) fail(id + ': לשאלה אין תמונה');
  const groupOf = {};
  e.order.forEach((g, gi) => g.forEach(n => { groupOf[n] = gi; }));
  for(const n of Object.keys(groupOf)){
    const pt = e.pts[n];
    if(!pt) fail(id + ': לרכב ' + n + ' אין מיקום');
    else if(!pt.every(v => Number.isInteger(v) && v >= 0 && v <= 100)) fail(id + ': מיקום מחוץ לתמונה ' + n);
  }
  const named = [...q.o[q.c].matchAll(/\((\d+)\)/g)].map(x => x[1]);
  let last = -1;
  for(const n of named){
    if(!(n in groupOf)){ fail(id + ': התשובה מזכירה את ' + n + ' והוא לא בסדר'); continue; }
    if(groupOf[n] < last) fail(id + ': ' + n + ' מוקדם מדי — התשובה מונה אותו אחרי רכב שנכנס אחריו');
    last = Math.max(last, groupOf[n]);
  }
}

console.log(Object.keys(ORDER).length + ' שאלות עם סדר כניסה');
if(bad){ console.log('\n' + bad + ' בעיות'); process.exit(1); }
console.log('הסדר תואם את התשובות הרשמיות');
