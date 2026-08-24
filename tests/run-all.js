/* =====================================================================
   DriveWise · מריץ את כל חבילות הבדיקה
   אפס תלויות. רק node.

     node tests/run-all.js          כל החבילות
     node tests/run-all.js vtest    חבילה אחת
     node tests/run-all.js --quiet  רק סיכום

   חבילה שנכשלת מחזירה קוד יציאה שאינו אפס, וכך גם המריץ — זה מה
   שגורם ל-GitHub Actions לצבוע את הריצה באדום.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const argv = process.argv.slice(2);
const quiet = argv.includes('--quiet');
const only = argv.filter(a => !a.startsWith('--'));

/* מה כל חבילה שומרת עליו, כדי שכישלון יסביר את עצמו */
const ABOUT = {
  xtest:   'האפליקציה והכלי מסכימים על מזהי קבצי השמע',
  atest:   'שכבת ההקראה באפליקציה — חוקי הגייה על טקסט לא מנוקד',
  vtest:   'בחירת הקול — התאמת שפה, איכות, ונפילה בחן',
  gtest:   'בחירת קול לפי מגדר',
  ntest:   'קולות רשת מול קולות מקומיים',
  stest:   'אבחון מצב ההקראה שמוצג למשתמש',
  ptest:   'עמידות ההקראה — שגיאות, מנוע תקוע, ניקוי',
  keytest: 'מפתחות התרגום קיימים בכל ארבע השפות',
  rtest:   'משפטי העידוד — ציון דרך, רצף, עידוד רגיל',
  ptest2:  'שלושת מסלולי ההקראה אומרים אותו דבר',
  segtest: 'פיצול משפטים — הרכבה, היסטים, מספרים',
  mtest:   'ניקוד מונחה-הקשר — סמיכות מול נפרד',
  ltest:   'ניקוד מוסיף סימנים ולא מוחק אותיות'
};

const suites = fs.readdirSync(HERE)
  .filter(f => f.endsWith('.js') && f !== 'run-all.js')
  .map(f => f.replace(/\.js$/, ''))
  .filter(n => !only.length || only.includes(n))
  .sort();

if(!suites.length){
  console.error('לא נמצאו חבילות' + (only.length ? ' בשם: ' + only.join(', ') : ''));
  process.exit(1);
}

console.log('\nDriveWise · ' + suites.length + ' חבילות בדיקה\n');

const failed = [];
const t0 = Date.now();

for(const name of suites){
  const r = spawnSync(process.execPath, [path.join(HERE, name + '.js')], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  const ok = r.status === 0;
  if(!ok) failed.push(name);

  console.log((ok ? '  ✓ ' : '  ✗ ') + name.padEnd(9) + '  ' + (ABOUT[name] || ''));

  /* פלט מלא רק כשנכשל — אחרת הלוג מוצף */
  if(!ok && !quiet){
    const out = ((r.stdout || '') + (r.stderr || '')).trimEnd();
    out.split('\n').slice(-14).forEach(l => console.log('      ' + l));
    console.log('');
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\n' + '─'.repeat(46));
if(failed.length){
  console.log('  ' + failed.length + ' מתוך ' + suites.length + ' נכשלו: ' + failed.join(', ') + '   (' + secs + ' שניות)');
  process.exit(1);
}
console.log('  כל ' + suites.length + ' החבילות עברו   (' + secs + ' שניות)');
