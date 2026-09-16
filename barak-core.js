/* עותק מקומי של /tutor/barak-core.js מהריפו הראשי (lagstein1-png.github.io).
   **מקור האמת שם.** הריפו הזה מקבל עותק לפי המנדט של מנוע ברק
   (״עותק מקומי של קובץ הלקוח, עם ענף ו-service worker משלו״),
   ו-tests/baraktest.js בודק ש-BARAK_CORE_VERSION כאן זהה למה
   ש-index.html מצפה לו. עדכון = העתקה מחדש של הקובץ כולו. */
/* =====================================================================
   מנוע ברק — הלקוח המשותף (BARAK-CORE) · 16.9.2026

     <script src="/tutor/tutor.js"></script>
     <script src="/tutor/barak-core.js"></script>     ← אחרי tutor.js
     BARAK.register(adapter)                          ← האפליקציה, פעם אחת
     BARAK.ask(text, opts) → Promise<{ say, action, face, source }>

   **מה זה פותר.** שני כשלים של הגרסה הקודמת: ״ברק לא יודע כלום״ —
   כי השרת קיבל את התרגיל בלבד; ו״ברק אומר ׳נעבור למסך׳ ולא מעביר״ —
   כי לא הייתה לו שום דרך להעביר. עכשיו:

   1. **ההקשר** מגיע מהמתאם של האפליקציה — `getScreenContext()` —
      ובו מזהה המסך, סוגו, השאלה, האפשרויות, התשובה הנכונה, מה
      התלמיד ענה, הנושא והפניה לתוכנית הלימודים.
   2. **הפעולות** מוצהרות במתאם — שם, תיאור, פרמטרים ופונקציה
      שמבצעת — ונשלחות לשרת כרשימה סגורה. המודל רשאי לבחור אחת;
      **הקוד כאן מבצע**, ורק אם הביצוע הצליח מוצג הטקסט שמלווה
      אותה. נכשל — נוסח קבוע (`ACTION_FAILED`) במקומו. ברק אינו
      מכריז על פעולה שלא בוצעה.
   3. **הנפילה המקומית** — אין רשת, timeout, 429, או הוראת נפילה
      מהשרת — עונה בשקט מ-`josh-local.js`, ומזהה גם בקשת פעולה
      פשוטה (״הבא״, ״רמז״, ״תקריא״) בארבע השפות. הלומד אינו רואה
      הודעת שגיאה.

   **מה אין כאן, בכוונה.** אין מפתח, אין הנחיות מערכת — הן בשרת
   (`tutor-api/worker.js`), ודפדפן אפשר לערוך. אין הקראה ואין
   בחירת קול — הן ב-`tutor.js`, שכבר נושא את ארבעת המנגנונים. אין
   ציור — הפנים הן `josh-face.js`, וכאן רק נשלח אליהן אירוע.

   `tutor.js` הוא הפאנל, והוא מאציל לכאן את הקריאה לשרת בלבד
   (`send()`). האפליקציה אינה קוראת ל-`ask` ישירות — היא רושמת מתאם.
   ===================================================================== */
(function (g) {
"use strict";

var BARAK_CORE_VERSION = "2026-09-16.1";   /* העותק בריפו של ״תאוריה מדברת״ נושא את אותו ערך */
var TIMEOUT_MS = 8000;       /* המנדט: כ-8 שניות, ואז המוח המקומי */
var HISTORY_MAX = 8;         /* ארבעה חילופי דברים */
var ADAPTER = null;
var LAST = null;             /* התוצאה האחרונה — לבדיקות ולדף התצוגה */

/* הנוסח כשפעולה נכשלה. מוצג **במקום** הטקסט של המודל, מפני שהטקסט
   הזה מתאר משהו שלא קרה. ארבע שפות, בלי סימני קריאה. */
var ACTION_FAILED = {
  he: "לא הצלחתי לעשות את זה עכשיו. בוא נמשיך כאן.",
  ar: "لم أتمكّن من فعل ذلك الآن. لنكمل هنا.",
  ru: "Сейчас у меня не получилось это сделать. Продолжим здесь.",
  en: "I could not do that right now. Let us carry on here."
};
/* הנוסח כשפעולה בוצעה מהמוח המקומי — אין מודל שיכתוב משפט. */
var ACTION_DONE = {
  next_question:    { he: "עוברים לשאלה הבאה.", ar: "ننتقل إلى السؤال التالي.", ru: "Переходим к следующему вопросу.", en: "Moving on to the next question." },
  show_hint:        { he: "הנה רמז.", ar: "إليك تلميحًا.", ru: "Вот подсказка.", en: "Here is a hint." },
  read_aloud:       { he: "מקריא.", ar: "أقرأ.", ru: "Читаю.", en: "Reading it out." },
  repeat_question:  { he: "עוד פעם.", ar: "مرة أخرى.", ru: "Ещё раз.", en: "Once more." },
  explain_again:    { he: "אסביר שוב, בדרך אחרת.", ar: "سأشرح مرة أخرى بطريقة مختلفة.", ru: "Объясню ещё раз, по-другому.", en: "Let me explain again, another way." },
  highlight_option: { he: "הסתכל על האפשרות המסומנת.", ar: "انظر إلى الخيار المحدَّد.", ru: "Посмотри на выделенный вариант.", en: "Look at the highlighted option." },
  go_screen:        { he: "עוברים.", ar: "ننتقل.", ru: "Переходим.", en: "Going there." },
  slow_mode:        { he: "נעשה את זה לאט.", ar: "سنفعل ذلك ببطء.", ru: "Сделаем это медленно.", en: "Let us do this slowly." },
  formula_sheet:    { he: "הנה דף הנוסחאות.", ar: "إليك ورقة الصيغ.", ru: "Вот лист формул.", en: "Here is the formula sheet." },
  show_sign_image:  { he: "הנה התמרור.", ar: "إليك الإشارة.", ru: "Вот знак.", en: "Here is the sign." },
  next_sentence:    { he: "המשפט הבא.", ar: "الجملة التالية.", ru: "Следующее предложение.", en: "Next sentence." },
  read_word:        { he: "מקריא את המילה.", ar: "أقرأ الكلمة.", ru: "Читаю слово.", en: "Reading the word." }
};

/* זיהוי בקשת פעולה כשאין שרת. מילים ולא תחביר — הקלט הוא ילד
   שמקליד מהר. מתבצע רק אם הפעולה רשומה במתאם של האפליקציה. */
var LOCAL_INTENT = [
  ["show_hint",       /\sרמז|\sتلميح|\sподсказ|\shint\s|\sclue\s/i],
  ["next_question",   /\sהבא\S*\s|\sנמשיך|\sתעבור|\sעבור ל|\sדלג|\sالتالي|\sследующ|\sдальше|\sпропусти|\snext\s|\sskip\s/i],
  ["next_sentence",   /\sהמשפט הבא|\sالجملة التالية|\sследующее предложение|\snext sentence/i],
  ["repeat_question", /\sשוב\s|\sעוד פעם|\sתחזור|\sأعد|\sكرر|\sповтори|\sещё раз|\sagain\s|\srepeat\s/i],
  ["read_aloud",      /\sתקריא|\sהקרא|\sקרא לי|\sתקרא|\saقرأ|\sإقرأ|\sاقرأ|\sпрочитай|\sпрочти|\sread\s/i],
  ["formula_sheet",   /\sנוסחא|\sנוסחה|\sנוסחאות|\sالصيغ|\sформул|\sformula/i],
  ["show_sign_image", /\sתמרור|\sתראה לי|\sתמונה|\sإشارة|\sصورة|\sзнак|\sкартинк|\ssign\s|\simage\s/i],
  ["slow_mode",       /\sלאט|\sתאט|\sببطء|\sмедленн|\sslow/i],
  ["explain_again",   /\sתסביר שוב|\sהסבר שוב|\sלא הבנתי את ההסבר|\sاشرح مرة|\sобъясни ещё|\sexplain again/i]
];
/* הגבולות הם רווחים ולא \b: אותיות עבריות, ערביות וקיריליות אינן
   \w ב-JavaScript, ולכן \b אחרי ״הבא״ בסוף מחרוזת אינו גבול כלל —
   נמדד: ״הבא״ לא זוהה. הטקסט נבדק עם רווח משני צדדיו. */

function safe(fn, dflt) { try { return fn() } catch (e) { return dflt } }
function trunc(v, n) { return v == null ? null : String(v).replace(/\s+/g, " ").trim().slice(0, n) || null }

/* ---------- ההקשר ----------
   מה שיוצא מהמכשיר, ורק זה. שדות שאינם כאן אינם נשלחים גם אם
   המתאם החזיר אותם — זו הרשימה הלבנה של הפרטיות. */
function context() {
  if (!ADAPTER || typeof ADAPTER.getScreenContext !== "function") return null;
  var c = safe(function () { return ADAPTER.getScreenContext() }, null);
  if (!c || typeof c !== "object") return null;
  var out = {
    id: trunc(c.id, 80), type: trunc(c.type, 40),
    q: trunc(c.q != null ? c.q : c.expr, 400),
    correct: trunc(c.correct != null ? c.correct : c.ans, 400),
    student: trunc(c.student, 160),
    topic: trunc(c.topic, 120), level: trunc(c.level, 120),
    curriculum: trunc(c.curriculum, 200)
  };
  if (Array.isArray(c.options)) {
    out.options = c.options.slice(0, 8).map(function (o) {
      return trunc(o && typeof o === "object" ? (o.text || o.t || o.h) : o, 160);
    }).filter(Boolean);
    if (!out.options.length) delete out.options;
  }
  if (!out.q && !out.topic) return null;
  return out;
}

/* הפעולות כפי שנשלחות לשרת — בלי הפונקציות. */
function actionsList() {
  if (!ADAPTER || !ADAPTER.actions) return [];
  var out = [];
  for (var name in ADAPTER.actions) if (Object.prototype.hasOwnProperty.call(ADAPTER.actions, name)) {
    var a = ADAPTER.actions[name];
    if (!a || typeof a.run !== "function") continue;
    var item = { name: name, desc: trunc(a.desc, 160) || name };
    if (a.params && typeof a.params === "object") item.params = a.params;
    out.push(item);
  }
  return out.slice(0, 12);
}

/* ---------- ביצוע פעולה, עם אימות ----------
   `run` מחזירה true/false (או Promise). אם למתאם יש `verify` —
   היא קובעת; אחרת ל-`next_question` יש אימות ברירת מחדל: מזהה
   המסך השתנה. פעולה שאין לה `run` אינה קיימת, ולכן נכשלת. */
/* אימות הפרמטרים גם כאן, ולא רק בשרת: הלקוח אינו יודע מי ענה לו
   (שרת ישן, שרת בדיקות), ופעולה עם ערך לא חוקי אינה פעולה. */
function validArgs(spec, args) {
  var params = spec.params || {}, out = {};
  for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) {
    var p = params[k] || {}, v = args ? args[k] : undefined;
    if (v === undefined || v === null) { if (p.required) return null; continue }
    if (p.type === "integer" || p.type === "number") {
      if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) v = +v;
      if (typeof v !== "number" || !isFinite(v)) return null;
      if (p.type === "integer" && v !== Math.floor(v)) return null;
      if (typeof p.min === "number" && v < p.min) return null;
      if (typeof p.max === "number" && v > p.max) return null;
    } else if (p.type === "boolean") {
      if (typeof v !== "boolean") return null;
    } else {
      v = String(v).slice(0, 120);
      if (p.enum && p.enum.indexOf(v) < 0) return null;
    }
    out[k] = v;
  }
  return out;
}
function runAction(action) {
  if (!action || !ADAPTER || !ADAPTER.actions) return Promise.resolve(false);
  var spec = ADAPTER.actions[action.name];
  if (!spec || typeof spec.run !== "function") return Promise.resolve(false);
  var args = validArgs(spec, action.args || {});
  if (!args) return Promise.resolve(false);
  action = { name: action.name, args: args };
  var before = safe(function () { return ADAPTER.getScreenContext() }, null);
  var beforeId = before ? String(before.id) : "";
  return new Promise(function (resolve) {
    var done = false;
    function fin(v) { if (!done) { done = true; resolve(!!v) } }
    try {
      Promise.resolve(spec.run(action.args || {})).then(function (r) {
        if (r === false) return fin(false);
        if (typeof spec.verify === "function") return fin(safe(function () { return spec.verify(before, action.args || {}) }, false));
        if (action.name === "next_question" || action.name === "next_sentence") {
          var after = safe(function () { return ADAPTER.getScreenContext() }, null);
          var afterId = after ? String(after.id) : "";
          return fin(afterId !== beforeId || (r === true && !before));
        }
        fin(r !== undefined ? r : true);
      }, function () { fin(false) });
    } catch (e) { fin(false) }
    setTimeout(function () { fin(false) }, 3000);
  });
}

/* ---------- המוח המקומי ---------- */
function localIntent(text) {
  if (!ADAPTER || !ADAPTER.actions) return null;
  for (var i = 0; i < LOCAL_INTENT.length; i++) {
    var name = LOCAL_INTENT[i][0];
    if (ADAPTER.actions[name] && LOCAL_INTENT[i][1].test(" " + String(text).replace(/[.,?!؟]/g, " ") + " ")) return { name: name, args: {} };
  }
  return null;
}
function local(text, opts, why) {
  var lang = opts.lang || "he";
  var q = context();
  var face = opts.sign === "frustrated" ? "encourage" : opts.sign === "stuck" ? "stuck" : opts.sign === "slow" ? "slow" : "speaking";
  var intent = localIntent(text);
  var base = { source: "local-fallback", why: why || "local", face: face, model: null };
  if (intent) {
    return runAction(intent).then(function (ok) {
      var tbl = ACTION_DONE[intent.name] || {};
      return Object.assign(base, {
        say: ok ? (tbl[lang] || tbl.he) : (ACTION_FAILED[lang] || ACTION_FAILED.he),
        action: { name: intent.name, args: intent.args, ok: ok }
      });
    });
  }
  var out = null;
  if (typeof g.JOSHLOCAL !== "undefined") {
    out = safe(function () {
      return g.JOSHLOCAL.reply(text, { lang: lang, q: q ? { expr: q.q, ask: q.q, ans: q.correct, topic: q.topic, level: q.level } : (opts.q || null), sign: opts.sign || null });
    }, null);
  }
  if (!out || !out.text) return Promise.resolve(null);   /* אין מוח מקומי — הפאנל יציג שגיאה */
  return Promise.resolve(Object.assign(base, { say: out.text, action: null, kind: out.kind }));
}

/* ---------- הקריאה לשרת ---------- */
function fetchWithTimeout(url, init) {
  var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  if (ctl) init.signal = ctl.signal;
  var timer = setTimeout(function () { if (ctl) ctl.abort() }, TIMEOUT_MS);
  return fetch(url, init).then(function (r) { clearTimeout(timer); return r },
                               function (e) { clearTimeout(timer); throw e });
}
function endpoint(api) {
  api = String(api || "");
  if (!api) return "";
  return /\/ask\/?$/.test(api) ? api : api.replace(/\/?$/, "/ask");
}

/* opts = { api, lang, target, sign, history:[{role,text}], mode, online, why }
   `online` שלילי — לא מנסים את השרת כלל (המונה במכשיר, או אין רשת). */
function ask(text, opts) {
  opts = opts || {};
  text = String(text || "").trim();
  var lang = opts.lang || "he";
  var api = endpoint(opts.api);
  var face = function (f) { if (typeof g.JOSHFACE !== "undefined") safe(function () { g.JOSHFACE.emit(f) }) };
  function finish(res) {
    if (!res) return null;
    LAST = res; face(res.face || "speaking");
    return res;
  }
  if (!text) return Promise.resolve(null);
  if (!api || opts.online === false) return local(text, opts, opts.why || (!api ? "local" : "offline")).then(finish);

  face("thinking");
  var body = {
    app: ADAPTER ? ADAPTER.app : opts.app, lang: lang,
    target: opts.target || null, sign: opts.sign || null, mode: opts.mode || "chat",
    screen: context(), userText: text, actions: actionsList(),
    history: (opts.history || []).slice(-HISTORY_MAX).map(function (m) {
      return { role: m.role === "assistant" ? "assistant" : "user", text: trunc(m.text, 300) };
    })
  };
  return fetchWithTimeout(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(function (r) {
      return r.json().catch(function () { return {} }).then(function (d) {
        if (r.status === 429) throw new Error(d && d.scope === "all" ? "limitAll" : "limit");
        if (!r.ok) {
          safe(function () { console.error("[barak] " + r.status + " " + ((d && (d.detail || d.error)) || "")) });
          throw new Error(r.status === 500 || r.status === 503 ? "setup" : "http");
        }
        var say = String((d && (d.say || d.text)) || "").trim();
        if (!say) throw new Error("empty");
        var res = { say: say, action: d.action || null, face: d.face || "speaking", source: "ai", model: d.model || null, why: "" };
        if (!res.action) return res;
        /* הפעולה קודם, הטקסט אחריה — וזה לא סדר, זה החוזה. */
        return runAction(res.action).then(function (ok) {
          res.action = { name: res.action.name, args: res.action.args || {}, ok: ok };
          if (!ok) res.say = ACTION_FAILED[lang] || ACTION_FAILED.he;
          return res;
        });
      });
    })
    .then(finish)
    .catch(function (err) {
      var why = String(err && err.message || "");
      if (!/^(limit|limitAll|setup|http|empty)$/.test(why)) why = /abort/i.test(why) ? "timeout" : "network";
      return local(text, opts, why).then(finish);
    });
}

/* הדגשת אפשרות — כלל אחד לכל האפליקציות, מוזרק פעם אחת. מסגרת ולא
   צבע רקע: קורא צבעים ולומד עם עיוורון צבעים רואים מסגרת. */
var HL_CSS = ".bk-hl{outline:4px solid #0a8f8f;outline-offset:3px;transition:outline-color .2s}";
function ensureStyle() {
  if (document.getElementById("bk-style")) return;
  var st = document.createElement("style"); st.id = "bk-style"; st.textContent = HL_CSS;
  (document.head || document.documentElement).appendChild(st);
}
/* עזר למתאמים: מדגיש איבר לכמה שניות ומחזיר true אם נמצא. */
function highlight(el, ms) {
  if (!el) return false;
  el.classList.add("bk-hl");
  safe(function () { el.scrollIntoView({ block: "nearest" }) });
  setTimeout(function () { el.classList.remove("bk-hl") }, ms || 4000);
  return true;
}

g.BARAK = {
  register: function (adapter) {
    if (!adapter || typeof adapter !== "object" || !adapter.app) return false;
    ADAPTER = adapter;
    safe(ensureStyle);
    return true;
  },
  highlight: highlight,
  ready: function () { return !!ADAPTER },
  adapter: function () { return ADAPTER },
  context: context,
  actions: actionsList,
  run: runAction,
  ask: ask,
  last: function () { return LAST },
  /* לבדיקות ולדף התצוגה */
  _local: local, _intent: localIntent, _endpoint: endpoint,
  VERSION: BARAK_CORE_VERSION, TIMEOUT_MS: TIMEOUT_MS, ACTION_FAILED: ACTION_FAILED, ACTION_DONE: ACTION_DONE
};
/* `barakAsk` — נקודת הכניסה בשם שהמנדט ביקש. `joshAsk` לא הייתה
   קיימת במאגר, ולכן אין לה כינוי לאחור (D-16). */
g.barakAsk = ask;
})(window);
