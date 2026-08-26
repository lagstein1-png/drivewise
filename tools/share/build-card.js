/* =====================================================================
   DriveWise · דף שיתוף להדפסה
   כלי פיתוח. אפס תלויות.

   מייצר קובץ HTML אחד עם ה-QR מוטבע בתוכו כ-data URI. קובץ אחד
   שאפשר לשלוח, לפתוח בכל מחשב ולהדפיס — בלי תיקייה של תמונות
   שנשארות מאחור וכל הקישורים נשברים.

   ה-QR עצמו נוצר פעם אחת ונשמר כ-qr.png. אם הכתובת תשתנה, צריך
   ליצור אותו מחדש — הוא מקודד את הכתובת ולא מצביע עליה.

     node tools/share/build-card.js
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const URL_APP = 'https://lagstein1-png.github.io/drivewise/';
const qr = fs.readFileSync(path.join(HERE, 'qr.png')).toString('base64');

const html = `<!doctype html>
<html lang="he" dir="rtl">
<meta charset="utf-8">
<title>תאוריה מדברת — דף שיתוף</title>
<style>
  @page { size: A5; margin: 12mm; }
  *{ box-sizing:border-box; }
  body{
    font-family: system-ui, "Segoe UI", Arial, sans-serif;
    margin:0; padding:6mm; color:#111; background:#fff;
    display:flex; flex-direction:column; align-items:center;
    text-align:center; min-height:100vh;
  }
  h1{ font-size:34px; margin:4mm 0 2mm; letter-spacing:-.5px; }
  .sub{ font-size:19px; line-height:1.5; max-width:105mm; margin:0 0 4mm; }
  .who{ font-size:15px; color:#444; line-height:1.6; max-width:100mm; margin:0 0 6mm; }
  .qr{ width:62mm; height:62mm; display:block; }
  .qrbox{ border:1.5px solid #111; border-radius:4mm; padding:4mm; margin-bottom:4mm; }
  .how{ font-size:16px; font-weight:600; margin:0 0 2mm; }
  .url{
    font-family: ui-monospace, Consolas, monospace; direction:ltr;
    font-size:14px; background:#f2f1ee; padding:2mm 3mm; border-radius:2mm;
    word-break:break-all; max-width:110mm;
  }
  ul{ list-style:none; padding:0; margin:6mm 0 0; font-size:15px; color:#333; }
  li{ margin:1.5mm 0; }
  .foot{ margin-top:auto; padding-top:6mm; font-size:13px; color:#666; }
  @media print { body{ padding:0; } .foot{ color:#888; } }
</style>

<h1>תאוריה מדברת</h1>

<p class="sub">
  לימוד תאוריה לנהיגה שבו <b>כל שאלה, כל תשובה וכל הסבר מוקראים בקול</b>.
</p>

<p class="who">
  בשביל מי שקשה לו לקרוא מסך — דיסלקציה, קושי בריכוז,
  מי שלומד בשפה שנייה, ומי שחוזר לתאוריה אחרי שנים.
</p>

<div class="qrbox">
  <img class="qr" src="data:image/png;base64,${qr}" alt="קוד QR לאפליקציה">
</div>

<p class="how">כוונו את מצלמת הטלפון אל הריבוע</p>
<p class="url">${URL_APP}</p>

<ul>
  <li>נפתח בדפדפן — בלי להתקין כלום</li>
  <li>1,273 שאלות ממאגר משרד התחבורה</li>
  <li>עובד גם בלי אינטרנט</li>
  <li>חינם</li>
</ul>

<p class="foot">אפשר גם להקליד את הכתובת ידנית. עובד בטלפון, בטאבלט ובמחשב.</p>
</html>`;

const out = path.join(HERE, 'card.html');
fs.writeFileSync(out, html, 'utf8');
console.log('נכתב: ' + out);
console.log('גודל: ' + (Buffer.byteLength(html) / 1024).toFixed(0) + 'KB — קובץ אחד, ה-QR בפנים');
