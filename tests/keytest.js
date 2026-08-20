/* כל מפתח שהקוד קורא לו חייב להתקיים בארבע השפות. */
/* נתיב שורש הפרויקט, כדי שהבדיקה תרוץ מכל מקום ולא רק מהמחשב
   שעליו נכתבה. זה מה שמאפשר לה לרוץ גם ב-GitHub Actions. */
const ROOT = require('path').resolve(__dirname, '..');

const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(ROOT + '/index.html', 'utf8')
              .split('\r\n').join('\n');
const B = require(ROOT + '/tools/bank');
const UI = vm.runInNewContext(B.appBlock(src, 'const UI = {', '{', '}') + '; UI', {});
const codes = Object.keys(UI);
const base = new Set(Object.keys(UI.he));
let bad = 0;
codes.forEach(c => {
  const k = new Set(Object.keys(UI[c]));
  [...base].filter(x => !k.has(x)).forEach(x => { console.log('✗ חסר ב-' + c + ': ' + x); bad++; });
  [...k].filter(x => !base.has(x)).forEach(x => { console.log('✗ עודף ב-' + c + ': ' + x); bad++; });
});
const used = new Set([...src.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'\s*\)/g)].map(m => m[1]));
[...used].filter(x => !base.has(x)).forEach(x => { console.log('✗ הקוד קורא ל-' + x + ' שלא קיים'); bad++; });
console.log(codes.length + ' שפות, ' + base.size + ' מפתחות, ' + used.size + ' בשימוש ישיר');
['spSlow','spNormal','spFast'].forEach(k =>
  console.log('  ' + k + ': ' + codes.map(c => UI[c][k]).join(' / ')));
console.log('  slow/normal/rateL הוסרו: ' +
  ['slow','normal','rateL'].every(k => codes.every(c => !(k in UI[c]))));
if(bad){ console.log('\n' + bad + ' בעיות'); process.exit(1); }
console.log('\nכל השפות מסונכרנות');
