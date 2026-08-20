/* =====================================================================
   DriveWise · ניקוד מונחה-הקשר
   כלי פיתוח. אפס תלויות.

   טבלה שממפה מילה אחת לניקוד אחד לא יכולה להכריע כשהמילה עצמה
   דו-משמעית. "מראה" מופיעה במאגר בשלוש הגיות שונות:

     כיוון נכון של המראה השמאלית   → הַמַּרְאָה   (מראה ברכב)
     את המראה הנשקף מאחור          → הַמַּרְאֶה   (נוף)
     התמרור מראה לאן מוביל         → מַרְאֶה     (פועל)

   ניקוד גורף היה מתקן משפט אחד ומקלקל שניים. כאן ההכרעה לפי הסביבה:
   כל חוק מזהה תבנית שלמה ומנקד רק בתוכה.

   סדר החוקים משמעותי — הראשון שמתאים מנצח לאותו מופע. חוקים
   ספציפיים לפני כלליים.

   שים לב: \b לא עובד על עברית ב-JavaScript. גבול מילה נבדק מפורשות
   מול טווח התווים העבריים.
   ===================================================================== */
'use strict';

const HE = '\\u0590-\\u05FF';          /* טווח התווים העבריים, כולל ניקוד */
const NOT_HE = '[^' + HE + ']';
const B0 = '(^|' + NOT_HE + ')';       /* גבול מילה משמאל */
const B1 = '(?![' + HE + '])';         /* גבול מילה מימין */

/* כל חוק: word — המילה שמנוקדת. before/after — מה חייב להופיע
   סביבה. voweled — הניקוד שיוחל. why — כדי שאפשר יהיה להבין
   מאוחר יותר למה החוק קיים. */
const CONTEXT_RULES = [
  /* ---- מראה ---- */
  {
    word: 'המראה',
    after: '(השמאלית|הימנית|האחורית|הפנימית|החיצונית|ברכב|הפנורמית)',
    voweled: 'הַמַּרְאָה',
    why: 'מראה של רכב — נקבה'
  },
  {
    word: 'המראה',
    after: '(הנשקף|הנשקפת|היפה|הנוף|שנשקף)',
    voweled: 'הַמַּרְאֶה',
    why: 'מראה במובן נוף — זכר'
  },
  {
    word: 'מראה',
    before: '(התמרור|הרמזור|השלט|התימרור)',
    after: '(לאן|כיוון|איפה|היכן|את|לך)',
    voweled: 'מַרְאֶה',
    why: 'פועל — התמרור מראה'
  },
  {
    word: 'מראה',
    after: '(פנורמית|צדדית|פנימית|חיצונית)',
    voweled: 'מַרְאָה',
    why: 'מראה של רכב, בלי ה"א הידיעה'
  },

  /* ---- דוגמאות נוספות לאותו דפוס ---- */
  {
    word: 'ברירה',
    after: '(מחדל)',
    voweled: 'בְּרֵרַת',
    why: 'סמיכות — ברירת מחדל'
  }
];

function ruleToRegex(rule){
  let src = B0 + '(' + rule.word + ')' + B1;
  if(rule.after)  src += '(\\s+' + rule.after + ')';
  let re = src;
  if(rule.before) re = B0 + rule.before + B1 + '(\\s+\\S*\\s*)?' + '(' + rule.word + ')' + B1
                     + (rule.after ? '(\\s+' + rule.after + ')' : '');
  return new RegExp(re, 'g');
}

/* מחיל את החוקים. מחזיר גם דיווח, כדי שאפשר יהיה לבדוק מה נגע במה. */
function applyContext(text, opts){
  const report = [];
  let out = String(text == null ? '' : text);

  for(const rule of CONTEXT_RULES){
    if(rule.before){
      /* before — המילה המנוקדת היא הקבוצה האחרונה שאינה ה-after */
      const re = new RegExp(
        B0 + rule.before + B1 + '(\\s+)' + '(' + rule.word + ')' + B1 +
        (rule.after ? '(\\s+' + rule.after + ')' : ''), 'g');
      out = out.replace(re, (m, pre, subj, gap, word, tail) => {
        report.push(rule.why);
        return pre + subj + gap + rule.voweled + (tail || '');
      });
    } else {
      const re = new RegExp(
        B0 + '(' + rule.word + ')' + B1 +
        (rule.after ? '(\\s+' + rule.after + ')' : ''), 'g');
      out = out.replace(re, (m, pre, word, tail) => {
        report.push(rule.why);
        return pre + rule.voweled + (tail || '');
      });
    }
  }

  if(opts && opts.report) return { text: out, applied: report };
  return out;
}

module.exports = { applyContext, CONTEXT_RULES, ruleToRegex, HE };
