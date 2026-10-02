/* twintest — שתי שאלות תאומות לא מוגשות באותו סבב (O-107, 2.10.2026).

   במאגר הרשמי q0687 ו-q1063 הן אותה שאלה בשני מספרים: באנגלית ובערבית
   מילה במילה, בעברית בשינוי ניסוח אחד. שתיהן נשארות — המבחן האמיתי שואל
   כל אחת מהן — אבל לומד שמקבל את שתיהן באותו מבחן תרגול מקבל שאלה כפולה.

   הבדיקה מריצה את הקוד האמיתי מ-index.html: deckFromBank (מבחן ותרגול)
   ו-buildQueue (תור הלמידה), 2,000 פעמים כל אחת, ונופלת אם שתיהן יצאו יחד.
   ובנוסף — שהזוג עדיין זהה במאגר האנגלי, ושאין במאגר זוג זהה נוסף שלא
   נרשם ב-TWINS. */
const ROOT = require('path').resolve(__dirname, '..');
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(ROOT + '/index.html', 'utf8').split('\r\n').join('\n');
const grab = (n) => {
  const i = src.indexOf('function ' + n + '(');
  if(i < 0) throw new Error('לא נמצא: ' + n);
  let d = 0;
  for(let k = src.indexOf('{', i); k < src.length; k++){
    if(src[k] === '{') d++; else if(src[k] === '}'){ d--; if(!d) return src.slice(i, k+1); }
  }
};
const opt = (re) => { const m = src.match(re); return m ? m[0] : ''; };

const items = JSON.parse(fs.readFileSync(ROOT + '/data/questions.en.json', 'utf8'));
const ctx = { BANK:{ items, source:'file' }, S:{ lang:'en', cat:null },
              PROG:{ queue:[], saved:null, mastered:{} }, Math, Set, console };
vm.createContext(ctx);
vm.runInContext([
  opt(/const TWINS = \{[^}]*\};/), src.indexOf('function withoutTwins(') >= 0 ? grab('withoutTwins') : '',
  grab('shuffle'), grab('deckFromBank'), grab('buildQueue'),
  'this.deckFromBank = deckFromBank; this.buildQueue = buildQueue;'
].join('\n'), ctx);

let fail = 0;
const A = 'q0687', B = 'q1063';
const both = ids => ids.includes(A) && ids.includes(B);

let deckHits = 0;
for(let i = 0; i < 2000; i++){
  if(both(ctx.deckFromBank(1273).map(q => q.id))) deckHits++;
}
console.log((deckHits ? '✗' : '✓') + ' deckFromBank: ' + deckHits + ' מתוך 2,000 חפיסות עם שתי התאומות');
if(deckHits) fail++;

let queueHits = 0;
for(let i = 0; i < 2000; i++){
  ctx.PROG.queue = []; ctx.PROG.saved = null; ctx.PROG.mastered = {};
  ctx.buildQueue();
  if(both(ctx.PROG.queue)) queueHits++;
}
console.log((queueHits ? '✗' : '✓') + ' buildQueue: ' + queueHits + ' מתוך 2,000 תורות עם שתי התאומות');
if(queueHits) fail++;

/* התאומה השנייה עדיין נלמדת — אחרי שהראשונה נלמדה, היא חוזרת לתור. */
ctx.PROG.queue = []; ctx.PROG.saved = null; ctx.PROG.mastered = { [A]:true };
ctx.buildQueue();
const backIn = ctx.PROG.queue.includes(B);
console.log((backIn ? '✓' : '✗') + ' אחרי ש-' + A + ' נלמדה, ' + B + ' ' + (backIn ? 'בתור' : 'נעלמה מהתור'));
if(!backIn) fail++;

/* הזוג באמת זהה, ואין זוג זהה נוסף שלא נרשם. */
const key = q => q.q.trim() + '|' + q.o.map(s => s.trim()).sort().join('|') + '|' + (q.img || '');
const groups = {};
for(const q of items) (groups[key(q)] = groups[key(q)] || []).push(q.id);
const dups = Object.values(groups).filter(g => g.length > 1).map(g => g.sort().join('+'));
const ok = dups.length === 1 && dups[0] === A + '+' + B;
console.log((ok ? '✓' : '✗') + ' זוגות זהים במאגר האנגלי: ' + (dups.join(', ') || 'אין'));
if(!ok) fail++;

process.exit(fail ? 1 : 0);
