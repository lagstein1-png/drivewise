/* =====================================================================
   תאוריה מדברת · חקירת שרשרת ההקראה
   כלי פיתוח. אפס תלויות.

   מדפיס עבור מחרוזת אחת את כל השלבים, ומודד את הכיסוי על המאגר
   כולו. נועד לענות על שאלה אחת: איפה בשרשרת ההגייה מתקלקלת.

     node tools/debug-speech.js                 סקירה + מדידת כיסוי
     node tools/debug-speech.js "טקסט כלשהו"    שרשרת למחרוזת אחת
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const B = require('./bank');
const { applyNumbers } = require('./number-rules');
const { applyContext } = require('./context-rules');
const { applyWords, WORD_RULES } = require('./word-rules');
const { applyKtiv, KTIV } = require('./ktiv');
const { forSpeech } = require('./speech');
const { CONTEXT_RULES } = require('./context-rules');

const NIQ = /[֑-ׇ]/;
const HEWORD = /[֐-׿]{2,}/g;

/* מרים את speechMap האמיתי מ-index.html */
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\r\n').join('\n');
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'speech-rules.json'), 'utf8'));
function grab(decl){
  const i = src.indexOf(decl);
  if(i < 0) throw new Error('לא נמצא: ' + decl);
  return src.slice(i, src.indexOf('\n', i));
}
const ctx = {
  DEV:false, console, S:{ lang:'he' },
  SPEECH_RULES:{
    words:rules.words, numbers:rules.numbers, ktiv:rules.ktiv,
    context:(rules.context||[]).map(x=>({ word:x.word,
      before:x.before?new RegExp('^'+x.before+'$'):null,
      after:x.after?new RegExp('^'+x.after+'$'):null, voweled:x.voweled })),
    /* אותה טבלת ניקוד שהאפליקציה טוענת בזמן ריצה. בלעדיה הבדיקה
       מדמה אפליקציה שלא קיימת. */
    voc: (function(){ try{ return JSON.parse(fs.readFileSync(
      path.join(ROOT, 'data', 'speech-he.json'), 'utf8')); }catch(e){ return null; } })(),
    ready:true }
};
vm.runInNewContext([
  B.appBlock(src,'const KTIV = {','{','}')+';',
  grab('const SEP_SPLIT ='), grab('const SEP_ONLY  ='), grab('const STOP      ='),
  'const SPEECH_CACHE = new Map();',
  B.appBlock(src,'function spokenToken(','{','}'),
  B.appBlock(src,'function speechMap(','{','}'),
  'this.speechMap = speechMap;'
].join('\n'), ctx);
const speechMap = ctx.speechMap;

const bar = (n=76) => '─'.repeat(n);

/* ------------------------------------------------------------------ */
function chain(text){
  const n1 = applyNumbers(text);
  const n2 = applyContext(n1);
  const n3 = applyWords(n2);
  const n4 = applyKtiv(n3);
  const map = speechMap(text);

  console.log('\n' + bar());
  console.log('ORIGINAL        : ' + text);
  console.log('NORMALIZED      : ' + (text === n1 ? '(ללא שינוי — אין נרמול נפרד)' : n1));
  console.log('  ← מספרים      : ' + (n1 === text ? 'לא נגע' : 'שינה'));
  console.log('  ← הקשר        : ' + (n2 === n1 ? 'לא נגע' : 'שינה'));
  console.log('  ← חוקי מילה   : ' + (n3 === n2 ? 'לא נגע' : 'שינה'));
  console.log('  ← כתיב KTIV   : ' + (n4 === n3 ? 'לא נגע' : 'שינה'));
  console.log('PRONUNCIATION   : ' + n4);
  console.log('TTS INPUT (בנייה): ' + forSpeech(text));
  console.log('TTS INPUT (אפליקציה): ' + map.spoken);
  console.log('זהים?           : ' + (forSpeech(text) === map.spoken ? 'כן' : '✗ לא'));

  console.log('\nWORD SPLIT (להדגשה בלבד):');
  map.words.forEach((w,i) => {
    const disp = text.slice(w.dStart, w.dEnd);
    const spok = map.spoken.slice(w.sStart, w.sEnd);
    const changed = disp !== spok;
    console.log('  ' + String(i).padStart(2) + '  ' +
      (changed ? '✱ ' : '  ') + disp.padEnd(14) + ' → ' + spok);
  });

  /* אילו מילים לא קיבלו שום טיפול */
  const bare = [...new Set((text.match(HEWORD) || []))];
  const untouched = bare.filter(w => {
    const t = ctx.SPEECH_RULES;
    return !(t.words && t.words[w]) && !t.ktiv[w] &&
           !CONTEXT_RULES.some(r => r.word === w);
  });
  console.log('\nמילים עבריות במחרוזת : ' + bare.length);
  console.log('קיבלו תיקון          : ' + (bare.length - untouched.length));
  console.log('נשלחו למנוע כמו שהן  : ' + untouched.length +
              (untouched.length ? '  →  ' + untouched.slice(0,10).join(' · ') : ''));
}

/* ------------------------------------------------------------------ */
function coverage(){
  const list = B.collect('he');
  const words = new Map();          /* מילה → כמה פעמים */
  for(const x of list){
    for(const w of (x.text.match(HEWORD) || [])){
      words.set(w, (words.get(w) || 0) + 1);
    }
  }

  const covered = new Set([
    ...Object.keys(KTIV),
    ...WORD_RULES.map(([w]) => w),
    ...CONTEXT_RULES.map(r => r.word)
  ]);

  let hitTokens = 0, allTokens = 0;
  for(const [w, n] of words){ allTokens += n; if(covered.has(w)) hitTokens += n; }

  const uncovered = [...words.entries()]
    .filter(([w]) => !covered.has(w))
    .sort((a,b) => b[1]-a[1]);

  console.log('\n' + bar());
  console.log('  כיסוי חוקי ההגייה על המאגר');
  console.log(bar());
  console.log('  מחרוזות              : ' + list.length.toLocaleString());
  console.log('  מילים עבריות ייחודיות: ' + words.size.toLocaleString());
  console.log('  מילים בחוקים         : ' + covered.size);
  console.log('  כיסוי מילים ייחודיות : ' +
    (100 * [...covered].filter(w=>words.has(w)).length / words.size).toFixed(1) + '%');
  console.log('  כיסוי מופעים בפועל   : ' + (100 * hitTokens / allTokens).toFixed(1) + '%');
  console.log('\n  המילים הנפוצות שאין להן שום חוק:');
  uncovered.slice(0, 20).forEach(([w,n]) =>
    console.log('    ' + String(n).padStart(4) + '  ' + w));

  /* כמה מהמילים במשפט ממוצע מקבלות ניקוד */
  let sumWords = 0, sumVoweled = 0, mixed = 0;
  for(const x of list){
    const spoken = forSpeech(x.text);
    const toks = spoken.split(/\s+/).filter(t => /[֐-׿]/.test(t));
    const v = toks.filter(t => NIQ.test(t)).length;
    sumWords += toks.length; sumVoweled += v;
    if(v > 0 && v < toks.length) mixed++;
  }
  console.log('\n  מילים בממוצע במחרוזת : ' + (sumWords/list.length).toFixed(1));
  console.log('  מהן מנוקדות בממוצע   : ' + (sumVoweled/list.length).toFixed(2) +
              '   (' + (100*sumVoweled/sumWords).toFixed(1) + '%)');
  console.log('  מחרוזות בניקוד חלקי  : ' + mixed.toLocaleString() +
              '  (' + (100*mixed/list.length).toFixed(1) + '%)');
  console.log(bar() + '\n');
}

/* ------------------------------------------------------------------ */
const arg = process.argv.slice(2).join(' ');
if(arg) chain(arg);
else {
  coverage();
  const list = B.collect('he');
  const good = list.find(x => /הרכב/.test(x.text) && x.text.length < 70);
  const bad  = list.find(x => !NIQ.test(forSpeech(x.text)) && x.text.length > 40 && x.text.length < 80);
  console.log('\n### מחרוזת שכן מקבלת תיקון:');
  if(good) chain(good.text);
  console.log('\n\n### מחרוזת שלא מקבלת שום תיקון:');
  if(bad) chain(bad.text);
}
