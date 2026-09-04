/* =====================================================================
   תאוריה מדברת · השוואת ניקוד: החוקים שלנו מול הנקדן של דיקטה
   כלי פיתוח. אפס תלויות. לא דורש מפתח.

   שלוש גרסאות של אותו משפט:

     חשוף   — כפי שהוא במאגר, בלי ניקוד
     שלנו   — 79 החוקים. מנקד בממוצע פחות ממילה אחת במשפט
     דיקטה  — ניקוד מלא, כל מילה, לפי הקשר

   מטרת הכלי היא להראות את ההבדל לפני שמשקיעים בסבב הקלטה.

     node tools/dicta-compare.js          עשרה משפטים מהמאגר
     node tools/dicta-compare.js 25       עשרים וחמישה
   ===================================================================== */
'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const B = require('./bank');
const { forSpeech } = require('./speech');

const API = 'https://nakdan-5-1.loadbalancer.dicta.org.il/api';
const NIQ = /[֑-ׇ]/;

async function nakdan(text){
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'nakdan', data: text, genre: 'modern', addmorph: true,
      keepqq: false, nodageshdefmem: false, patachma: false, keepmetagim: true
    })
  });
  if(!r.ok) throw new Error('דיקטה החזירה ' + r.status);
  const toks = await r.json();
  return toks.map(tk => {
    if(!tk.options || !tk.options.length) return tk.word;
    const first = tk.options[0];
    const s = Array.isArray(first) ? first[0] : (first.w || first);
    return String(s).split('|').join('');       /* הקו האנכי הוא גבול מורפמה */
  }).join('');
}

/* כמה מהמילים במשפט מנוקדות */
function ratio(s){
  const w = s.split(/\s+/).filter(t => /[֐-׿]/.test(t));
  if(!w.length) return 0;
  return w.filter(t => NIQ.test(t)).length / w.length;
}

(async () => {
  const n = parseInt(process.argv[2], 10) || 10;
  const list = B.collect('he')
    .filter(x => x.text.length > 45 && x.text.length < 110)
    .filter((_, i) => i % 37 === 0)          /* פרוס על פני המאגר */
    .slice(0, n);

  console.log('\n' + '─'.repeat(76));
  console.log('  ' + list.length + ' משפטים מהמאגר · חשוף מול החוקים שלנו מול דיקטה');
  console.log('─'.repeat(76));

  let ours = 0, theirs = 0, fails = 0;

  for(const x of list){
    const mine = forSpeech(x.text);
    let full;
    try{ full = await nakdan(x.text); }
    catch(e){ fails++; console.log('\n✗ ' + e.message); continue; }
    await new Promise(r => setTimeout(r, 350));

    ours   += ratio(mine);
    theirs += ratio(full);

    console.log('\nחשוף : ' + x.text);
    console.log('שלנו : ' + mine   + '     [' + Math.round(ratio(mine) * 100) + '% מנוקד]');
    console.log('דיקטה: ' + full   + '     [' + Math.round(ratio(full) * 100) + '% מנוקד]');
  }

  const ok = list.length - fails;
  console.log('\n' + '─'.repeat(76));
  console.log('  ניקוד ממוצע — החוקים שלנו : ' + (100 * ours / ok).toFixed(1) + '%');
  console.log('  ניקוד ממוצע — דיקטה       : ' + (100 * theirs / ok).toFixed(1) + '%');
  console.log('─'.repeat(76) + '\n');
})().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
