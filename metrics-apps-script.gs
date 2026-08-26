/* תאוריה מדברת — קולט מדידות ורושם אותן בגיליון.
   מקבל בקשות מהאפליקציה ב-lagstein1-png.github.io/drivewise ורושם שורה לכל אירוע.
   לא נשמר שום מזהה אישי: אין שם, אין אימייל, אין כתובת IP. */

var SHEET = 'data';
var HEADERS = ['מתי', 'אירוע', 'מזהה אנונימי', 'מכשיר', 'איך נפתח',
               'שפה', 'גרסה', 'שניות', 'שאלות שנענו'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) sh = ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { d = {}; }

  /* ערך לא צפוי לא מפיל את הגיליון — נרשם ריק ונמשיך */
  sheet_().appendRow([
    new Date(),
    String(d.ev || '').slice(0, 20),
    String(d.aid || '').slice(0, 30),
    String(d.device || '').slice(0, 20),
    String(d.installed || '').slice(0, 20),
    String(d.lang || '').slice(0, 10),
    String(d.build || '').slice(0, 20),
    Number(d.secs) || '',
    Number(d.answered) || ''
  ]);

  return ContentService.createTextOutput('ok');
}

/* מאפשר לפתוח את הכתובת בדפדפן ולוודא שהשירות חי */
function doGet() {
  return ContentService.createTextOutput('DriveWise metrics: alive');
}

/* ── מחיקה אוטומטית אחרי 90 יום ──────────────────────────────────
   מדידה שנשמרת לנצח היא לא מדידה, היא ארכיון. תשעים יום מספיקים
   כדי לראות מגמה, ואחריהם השורה נמחקת מעצמה.

   להפעלה: פתח את הסקריפט, בחר installPurgeTrigger ברשימה למעלה
   ולחץ Run. פעם אחת בלבד. משם זה רץ כל לילה לבד. */

var KEEP_DAYS = 90;

function purgeOld() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return 0;

  var cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  var dates = sh.getRange(2, 1, last - 1, 1).getValues();

  /* השורות נרשמות לפי הסדר, ולכן הישנות תמיד בראש. מספיק לספור
     מלמעלה עד הראשונה שנשארת ולמחוק בלוק אחד. */
  var n = 0;
  while (n < dates.length && dates[n][0] instanceof Date &&
         dates[n][0].getTime() < cutoff) n++;

  if (n > 0) sh.deleteRows(2, n);
  return n;
}

function installPurgeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'purgeOld') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('purgeOld').timeBased().everyDays(1).atHour(3).create();
  return 'הותקן. רץ כל לילה ב-03:00.';
}
