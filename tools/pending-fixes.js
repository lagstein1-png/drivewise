/* =====================================================================
   DriveWise · צבירת תיקוני הגייה
   כלי פיתוח. אפס תלויות.

   הבעיה: כל תיקון בודד גרר סבב ייצור שלם. שבעה תיקונים ביום אחד =
   שבעה סבבים, שבע הרצות, ושבע פעמים תשלום.

   כאן אוספים תיקונים ב-pending_fixes.json, ומריצים סבב אחד כשמוכנים.

   הוספת תיקון אינה נוגעת בהקלטות ואינה עולה כלום. רק run-batch
   מחיל, ורק הייצור שאחריו עולה כסף.

   הגנות:
     · גיבוי אוטומטי של word-rules.js ושל pending_fixes.json לפני
       כל שינוי, לתיקייה tools/.backup
     · rollback משחזר את הגיבוי האחרון
     · תיקון שכבר קיים בטבלה נדחה, כדי לא ליצור כפילויות סותרות

   שימוש:
     node tools/pending-fixes.js add מפגש מִפְגָּשׁ ["הקשר לדוגמה"]
     node tools/pending-fixes.js list
     node tools/pending-fixes.js remove מפגש
     node tools/pending-fixes.js run-batch
     node tools/pending-fixes.js rollback
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT     = path.resolve(__dirname, '..');
const PENDING  = path.join(__dirname, 'pending_fixes.json');
const WORDFILE = path.join(__dirname, 'word-rules.js');
const BACKUP   = path.join(__dirname, '.backup');

const HE = '֐-׿';

const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

/* יומן כל פעולה, לא רק של תיקונים שהוחלו. כשמשהו נשמע שגוי חודש
   אחרי, זה מה שעונה על "מתי בכלל נגענו במילה הזאת". */
function logAction(data, action, detail){
  data.history = (data.history || []).concat([{ action, ...detail, at: now() }]);
  if(data.history.length > 400) data.history = data.history.slice(-400);
  return data;
}

/* כתיבה אטומית: קודם לקובץ זמני, ואז שינוי שם. כך הפסקה באמצע
   הכתיבה — Ctrl+C, קריסה, דיסק מלא — משאירה את הקובץ המקורי שלם
   במקום חצי JSON שאי אפשר לקרוא. */
function atomicWrite(file, text){
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

/* ---------------- גיבוי ושחזור ---------------- */
function backup(tag){
  fs.mkdirSync(BACKUP, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const made = [];
  for(const f of [WORDFILE, PENDING]){
    if(!fs.existsSync(f)) continue;
    const dest = path.join(BACKUP, path.basename(f) + '.' + stamp + (tag ? '.' + tag : '') + '.bak');
    fs.copyFileSync(f, dest);
    made.push(path.basename(dest));
  }
  /* מצביע על הגיבוי האחרון, כדי ש-rollback ידע לאן לחזור */
  fs.writeFileSync(path.join(BACKUP, 'LATEST'), stamp, 'utf8');
  return made;
}

function rollback(){
  if(!fs.existsSync(path.join(BACKUP, 'LATEST'))){
    console.log('אין גיבוי לשחזור.');
    return false;
  }
  const stamp = fs.readFileSync(path.join(BACKUP, 'LATEST'), 'utf8').trim();
  const files = fs.readdirSync(BACKUP).filter(f => f.indexOf(stamp) !== -1);
  if(!files.length){ console.log('הגיבוי האחרון לא נמצא.'); return false; }
  for(const f of files){
    const target = f.startsWith('word-rules.js') ? WORDFILE
                 : f.startsWith('pending_fixes.json') ? PENDING : null;
    if(!target) continue;
    fs.copyFileSync(path.join(BACKUP, f), target);
    console.log('  שוחזר: ' + path.basename(target));
  }
  return true;
}

/* ---------------- קובץ התיקונים ---------------- */
function readPending(){
  if(!fs.existsSync(PENDING)) return { fixes: [] };
  try{
    const o = JSON.parse(fs.readFileSync(PENDING, 'utf8'));
    return (o && Array.isArray(o.fixes)) ? o : { fixes: [] };
  }catch(e){
    console.warn('pending_fixes.json פגום — מתחילים מרשימה ריקה. הישן שמור בגיבוי.');
    backup('corrupt');
    return { fixes: [] };
  }
}

function writePending(data){
  atomicWrite(PENDING, JSON.stringify(data, null, 2));
}

/* ---------------- הוספה ---------------- */
function addFix(word, voweled, context){
  if(!word || !voweled) throw new Error('חסר: מילה וניקוד');
  if(!new RegExp('^[' + HE + ']+$').test(word))
    throw new Error('המילה המקורית חייבת להיות עברית בלי ניקוד: ' + word);

  const { WORD_RULES } = require('./word-rules');
  if(WORD_RULES.some(([w]) => w === word))
    throw new Error('"' + word + '" כבר קיים בטבלה. הסר אותו קודם אם צריך לשנות.');

  const data = readPending();
  if(data.fixes.some(f => f.word === word))
    throw new Error('"' + word + '" כבר ממתין ברשימה.');

  backup('add');
  data.fixes.push({
    word,
    voweled,
    context: context || '',
    added: now()
  });
  logAction(data, 'add', { word, voweled });
  writePending(data);
  return data.fixes.length;
}

function removeFix(word){
  const data = readPending();
  const before = data.fixes.length;
  data.fixes = data.fixes.filter(f => f.word !== word);
  if(data.fixes.length === before) return false;
  backup('remove');
  logAction(data, 'remove', { word });
  writePending(data);
  return true;
}

/* ---------------- החלה על הטבלה ---------------- */
function applyToWordRules(fixes){
  const raw = fs.readFileSync(WORDFILE, 'utf8');
  const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
  const marker = '];';
  const idx = raw.lastIndexOf(marker);
  if(idx < 0) throw new Error('word-rules.js לא במבנה הצפוי');

  const stamp = new Date().toISOString().slice(0, 10);
  const lines = [''];
  lines.push('  /* נוסף אוטומטית ' + stamp + ' על ידי pending-fixes */');
  for(const f of fixes){
    if(f.context) lines.push('  /* ' + f.context.replace(/\*\//g, '') .slice(0, 70) + ' */');
    lines.push("  ['" + f.word + "', '" + f.voweled + "'],");
  }
  /* מסירים פסיק מהאחרון */
  lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');

  /* אם כבר יש איברים, צריך פסיק אחרי האחרון הקיים */
  const before = raw.slice(0, idx).replace(/\s*$/, '');
  const needsComma = /\]$/.test(before);
  const out = before + (needsComma ? ',' : '') + EOL + lines.join(EOL) + EOL + raw.slice(idx);
  atomicWrite(WORDFILE, out);
}

/* ---------------- סבב ---------------- */
function runBatch(opts){
  const data = readPending();
  if(!data.fixes.length){ console.log('\nאין תיקונים ממתינים.'); return; }

  console.log('\nתיקונים ממתינים: ' + data.fixes.length);
  for(const f of data.fixes){
    console.log('  ' + f.word.padEnd(12) + ' → ' + f.voweled + (f.context ? '   (' + f.context.slice(0, 34) + ')' : ''));
  }

  if(!opts.apply){
    console.log('\nלהחלה בפועל: run-batch.cmd, או --yes');
    return;
  }

  const made = backup('batch');
  console.log('\nגיבוי: ' + made.join(', '));

  applyToWordRules(data.fixes);
  console.log('✓ ' + data.fixes.length + ' תיקונים נכנסו ל-word-rules.js');

  /* אימות: הקובץ עדיין נטען? אחרת חוזרים אחורה מיד. */
  try{
    delete require.cache[require.resolve('./word-rules')];
    delete require.cache[require.resolve('./speech')];
    const { applyWords } = require('./word-rules');
    applyWords('בדיקה');
  }catch(e){
    console.error('\n✗ word-rules.js נשבר: ' + e.message);
    console.error('  משחזר גיבוי…');
    rollback();
    process.exit(1);
  }

  data.applied = (data.applied || []).concat(data.fixes.map(f => ({ ...f, at: now() })));
  logAction(data, 'run-batch', { count: data.fixes.length,
                                 words: data.fixes.map(f => f.word).join(' ') });
  data.fixes = [];
  writePending(data);
  console.log('✓ הרשימה רוקנה. ההיסטוריה נשמרה בקובץ.');

  console.log('\nמחשב מה צריך להקליט מחדש…');
  try{
    const out = execFileSync(process.execPath, [path.join(__dirname, 'diff-build.js')], { encoding: 'utf8' });
    console.log(out);
  }catch(e){
    console.log('(diff-build נכשל: ' + e.message.slice(0, 80) + ')');
  }
  console.log('הצעד הבא: run-diff-build.cmd ואז run-generate-all.cmd');
}

/* ---------------- CLI ---------------- */
if(require.main === module){
  const [cmd, ...rest] = process.argv.slice(2);
  const yes = rest.includes('--yes') || process.argv.includes('--yes');
  const args = rest.filter(a => a !== '--yes');

  try{
    if(cmd === 'add'){
      const n = addFix(args[0], args[1], args.slice(2).join(' '));
      console.log('✓ נוסף. ממתינים עכשיו: ' + n);
      console.log('  להחלה: run-batch.cmd');
    }
    else if(cmd === 'remove'){
      console.log(removeFix(args[0]) ? '✓ הוסר' : 'לא נמצא ברשימה');
    }
    else if(cmd === 'list'){
      const d = readPending();
      if(!d.fixes.length) console.log('\nאין תיקונים ממתינים.');
      else {
        console.log('\nממתינים (' + d.fixes.length + '):');
        d.fixes.forEach(f => console.log('  ' + f.word.padEnd(12) + ' → ' + f.voweled));
      }
      if(d.applied && d.applied.length) console.log('\nהוחלו בעבר: ' + d.applied.length);
      if(d.history && d.history.length){
        console.log('\nפעולות אחרונות:');
        d.history.slice(-5).forEach(h =>
          console.log('  ' + h.at + '  ' + h.action + (h.word ? '  ' + h.word : '') +
                      (h.count != null ? '  (' + h.count + ')' : '')));
      }
    }
    else if(cmd === 'run-batch') runBatch({ apply: yes });
    else if(cmd === 'rollback'){
      console.log('\nמשחזר גיבוי אחרון…');
      console.log(rollback() ? '✓ שוחזר' : '✗ לא שוחזר');
    }
    else {
      console.log([
        'שימוש:',
        '  node tools/pending-fixes.js add <מילה> <מנוקד> [הקשר]',
        '  node tools/pending-fixes.js list',
        '  node tools/pending-fixes.js remove <מילה>',
        '  node tools/pending-fixes.js run-batch --yes',
        '  node tools/pending-fixes.js rollback'
      ].join('\n'));
    }
  }catch(e){
    console.error('\n✗ ' + e.message);
    process.exit(1);
  }
}

module.exports = { addFix, removeFix, readPending, runBatch, backup, rollback };
