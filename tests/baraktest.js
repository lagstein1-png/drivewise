/* =====================================================================
   baraktest.js — ״עזרה מהמורה״ (ברק) מחווט, ואינו יכול להישבר בשקט.

   מנוע ברק, 16.9.2026. שבע בדיקות סטטיות, אפס רשת:
     1. ארבעת קובצי /tutor/ נטענים, josh-face לפני tutor, ו-barak-core
        המקומי אחרי tutor
     2. barak-core.js קיים, נושא BARAK_CORE_VERSION, ואין בו מפתח
     3. PRECACHE מכיל את חמשת הקבצים — אחרת אופליין הבוט נשבר בשקט
     4. TUTOR.mount ו-BARAK.register עם app:'theory' (התפקיד בשרת)
     5. getScreenContext שולח options ו-correct — זה מה שפותר ״ברק
        לא יודע כלום״
     6. privacy.html מתאר מה נשלח, בעברית ובאנגלית
     7. הכפתור אינו במסך הבחינה
   ===================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
const sw = fs.readFileSync(ROOT + '/sw.js', 'utf8');
const priv = fs.readFileSync(ROOT + '/privacy.html', 'utf8');
const fails = [];
const check = (ok, m) => { if (!ok) fails.push(m) };

const iFace = html.indexOf('src="/tutor/josh-face.js"'), iTut = html.indexOf('src="/tutor/tutor.js"'),
      iCore = html.indexOf('src="./barak-core.js"'), iLocal = html.indexOf('src="/tutor/josh-local.js"');
check(iFace >= 0 && iTut > iFace, 'josh-face.js חייב להיטען לפני tutor.js');
check(iLocal >= 0 && iLocal < iTut, 'josh-local.js חייב להיטען לפני tutor.js');
check(iCore > iTut, 'barak-core.js המקומי חייב להיטען אחרי tutor.js');

const corePath = ROOT + '/barak-core.js';
check(fs.existsSync(corePath), 'אין barak-core.js בשורש');
const core = fs.existsSync(corePath) ? fs.readFileSync(corePath, 'utf8') : '';
check(/var BARAK_CORE_VERSION = "[\d.-]+"/.test(core), 'barak-core.js בלי BARAK_CORE_VERSION');
check(/g\.BARAK\s*=/.test(core), 'barak-core.js אינו מייצא BARAK');
check(!/AIza[0-9A-Za-z_-]{20,}|sk-ant-[0-9A-Za-z_-]{20,}/.test(core + html + sw), 'מפתח API בקוד');

const m = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
const pre = m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
for (const f of ['/tutor/josh-face.js', '/tutor/josh-local.js', '/tutor/tutor.js', './barak-core.js', '/img/josh.jpg'])
  check(pre.includes(f), 'PRECACHE חסר ' + f);

check(/TUTOR\.mount\(\{\s*app:\s*'theory'/.test(html), "TUTOR.mount עם app:'theory'");
check(/BARAK\.register\(\{\s*app:\s*'theory'/.test(html), "BARAK.register עם app:'theory'");
check(/getScreenContext:[\s\S]{0,900}options:/.test(html) && /getScreenContext:[\s\S]{0,900}correct:/.test(html), 'getScreenContext בלי options/correct');
for (const a of ['next_question', 'show_hint', 'read_aloud', 'highlight_option', 'show_sign_image', 'go_screen'])
  check(new RegExp(a + ':\\s*\\{').test(html), 'פעולה חסרה במתאם: ' + a);

check(/tutor\.lagstein1\.workers\.dev/.test(priv) && /Gemini/.test(priv), 'privacy.html אינו מתאר את ״עזרה מהמורה״');
check(/Ask the teacher/.test(priv), 'privacy.html — אין תיאור באנגלית');

/* הכפתור מופיע ברצף ובתרגול; במסך הבחינה (isExam) הוא מותנה כמו הרמז */
const prac = html.slice(html.indexOf('function renderPractice'), html.indexOf('function showHint'));
check(/isExam \? '' :[\s\S]*btnTutor/.test(prac), 'בתרגול הכפתור חייב לשבת בתוך הענף שאינו בחינה');

if (fails.length) { console.log('✗ baraktest — ' + fails.length + ' ממצאים\n  ' + fails.join('\n  ')); process.exit(1) }
console.log('✓ baraktest — ברק מחווט: תגיות, עותק מקומי, PRECACHE, מתאם, פרטיות');
