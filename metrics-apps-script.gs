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
