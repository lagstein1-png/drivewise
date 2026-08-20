/* rewardFor אחרי הסרת cheerFixed: ציון דרך, רצף, עידוד רגיל. */
/* נתיב שורש הפרויקט, כדי שהבדיקה תרוץ מכל מקום ולא רק מהמחשב
   שעליו נכתבה. זה מה שמאפשר לה לרוץ גם ב-GitHub Actions. */
const ROOT = require('path').resolve(__dirname, '..');

const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(ROOT + '/index.html', 'utf8')
              .split('\r\n').join('\n');
const B = require(ROOT + '/tools/bank');

const code = [
  B.appBlock(src, 'const UI = {', '{', '}') + ';',
  'const S = { lang:"he" };',
  'const t = (k) => UI[S.lang][k];',
  'const pick = (a) => Array.isArray(a) ? a[0] : a;',
  'let REWARD = { answered:0, streak:0, best:0 };',
  'const saveReward = () => {};',
  B.appBlock(src, 'function milestoneFor(', '{', '}'),
  B.appBlock(src, 'function rewardFor(', '{', '}'),
  'module1 = { rewardFor, REWARD:()=>REWARD, reset:()=>{REWARD={answered:0,streak:0,best:0};} };'
].join('\n');

const ctx = { module1: null, console };
vm.runInNewContext(code, ctx);
const { rewardFor, reset } = ctx.module1;

let pass = 0, fail = 0;
const is = (name, got, want) => {
  const ok = want instanceof RegExp ? want.test(got) : got === want;
  console.log((ok ? '✓ ' : '✗ ') + name + '  →  ' + JSON.stringify(got));
  ok ? pass++ : fail++;
};

/* arity — הפרמטר השני נעלם */
is('rewardFor מקבל ארגומנט אחד', rewardFor.length, 1);

/* שאלה שנייה: לא ציון דרך, לא רצף — עידוד רגיל */
reset();
rewardFor({});
const r2 = rewardFor({});
is('עידוד רגיל בשאלה 2', r2.big, false);

/* רצף של 3 */
reset();
rewardFor({}); rewardFor({});
const r3 = rewardFor({});
is('רצף 3 → משפט רצף', r3.big, false);
is('רצף 3 → יש טקסט', typeof r3.text === 'string' && r3.text.length > 0, true);

/* ציון דרך 10 גובר על רצף */
reset();
let r10; for(let i = 0; i < 10; i++) r10 = rewardFor({});
is('שאלה 10 → ציון דרך גדול', r10.big, true);
is('שאלה 10 → הטקסט של milestone10', r10.text, UIhe('milestone10'));
function UIhe(k){ return vm.runInNewContext(B.appBlock(src,'const UI = {','{','}') + '; UI.he.' + k, {}); }

/* q.p גובר על cheers האקראי */
reset();
const rp = rewardFor({ p: 'הסבר ייעודי' });
is('q.p משמש כשקיים', rp.text, 'הסבר ייעודי');

/* אין יותר אזכור של השאלה הקודמת בשום שפה */
const ui = vm.runInNewContext(B.appBlock(src, 'const UI = {', '{', '}') + '; UI', {});
is('cheerFixed הוסר מכל השפות',
   Object.keys(ui).every(c => !('cheerFixed' in ui[c])), true);

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
