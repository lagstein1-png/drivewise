# DriveWise · ייצור כל קבצי ההקראה, בארבעה קולות
# לוחצים פעמיים על run-generate-all.cmd שלידו.
#
# בטוח להפסיק ולהריץ שוב: כל קובץ נכתב מיד, וההרצה הבאה מדלגת על
# מה שכבר קיים ומשלימה רק את החסר.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

# id בתיקייה  =  שם הקול אצל Google
$voices = @(
  @{ folder = 'aoede';    google = 'he-IL-Chirp3-HD-Aoede';    label = 'Woman 1' },
  @{ folder = 'achernar'; google = 'he-IL-Chirp3-HD-Achernar'; label = 'Woman 2' },
  @{ folder = 'algenib';  google = 'he-IL-Chirp3-HD-Algenib';  label = 'Man 1'   },
  @{ folder = 'iapetus';  google = 'he-IL-Chirp3-HD-Iapetus';  label = 'Man 2'   }
)

Write-Host ''
Write-Host '  DriveWise - generate all recordings' -ForegroundColor Cyan
Write-Host '  -----------------------------------'
Write-Host ''
Write-Host ('  {0} voices.  The exact count is printed below, after the' -f $voices.Count)
Write-Host '  stale recordings are removed.  Roughly an hour per voice.'
Write-Host '  Safe to stop and re-run: finished files are skipped.'
Write-Host ''
# כבר בסביבה - לא מבקשים שוב
if ($env:TTS_KEY) {
  Write-Host '  Using TTS_KEY from the environment.'
  Write-Host ''
} else {

Write-Host '  Paste your API key and press Enter.'
Write-Host '  Nothing will appear on screen while you paste. That is normal.'
Write-Host ''

# Read-Host waits forever when there is no keyboard - which is what
# happens when this is launched from an editor Run button, a pipe, or a
# task runner. It looks like the script is working. It is not: it sits
# at the prompt until something kills it, and nothing gets recorded.
# So we check first, and say so.
if ([Console]::IsInputRedirected) {
  Write-Host ''
  Write-Host '  No keyboard attached to this window.' -ForegroundColor Yellow
  Write-Host '  The key has to be typed, so start this from a console:'
  Write-Host '    double-click  tools\run-generate-all.cmd'
  Write-Host '  or set TTS_KEY in the environment before starting.'
  Write-Host ''
  exit 1
}

$secure = Read-Host '  API key' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:TTS_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if (-not $env:TTS_KEY) {
  Write-Host ''
  Write-Host '  No key entered. Nothing to do.' -ForegroundColor Yellow
  exit 1
}

}   # סוף הענף שמבקש מפתח

# בדיקת עשן לפני הכול. מייצרת קובץ אחד אמיתי ומוודאת שהמפתח עובד.
#
# הסדר כאן אינו קוסמטי. בפעם הקודמת המחיקה רצה ראשונה, המפתח היה
# פסול, וכל בקשה נכשלה - וכך 26,692 הקלטות נמחקו בלי שיהיה במה
# להחליף אותן. שום דבר לא נמחק עוד לפני שהוכח שאפשר להקליט.
Write-Host ''
Write-Host '  Checking the key with one real recording...' -ForegroundColor Cyan
node tools/tts-build.js smoke --count 1
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '  Smoke test failed. Nothing was deleted.' -ForegroundColor Red
  Write-Host '  Fix the problem above and run this again.'
  Write-Host ''
  $env:TTS_KEY = ''
  exit 1
}

# מזהה הקובץ הוא גיבוב של הטקסט המוצג, לא של טקסט ההקראה. לכן תיקון
# הגייה לא משנה את שם הקובץ, הקובץ הישן עדיין קיים, והייצור מדלג
# עליו כי הוא "כבר קיים" - ואז --seed בסוף רושם אותו כמעודכן.
# התוצאה: אודיו ישן שהמניפסט טוען שהוא תקין.
#
# לכן מוחקים כאן, לפני הייצור, כל קובץ שההקראה שלו השתנתה.
Write-Host ''
Write-Host '  Removing recordings whose text changed...' -ForegroundColor Cyan
node tools/diff-build.js --apply --changed-only

$n = 0
foreach ($v in $voices) {
  $n++
  Write-Host ''
  Write-Host ('  [{0}/{1}]  {2}  ->  audio/he/{3}' -f $n, $voices.Count, $v.label, $v.folder) -ForegroundColor Cyan
  node tools/tts-build.js all --provider gcloud --voice $v.google --as $v.folder --yes
}

# המניפסט הוא ההצהרה "כל מה שעל הדיסק תואם לחוקים הנוכחיים". אם
# הייצור לא הושלם, ההצהרה הזאת שקרית, ומאותו רגע אי אפשר לדעת מה
# מעודכן ומה לא. לכן בודקים שלמות קודם, ורושמים רק אם הכול שם.
Write-Host ''
Write-Host '  Checking that every file is present...' -ForegroundColor Cyan
node tools/tts-build.js verify --lang he
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '  Some files are still missing, so the manifest was NOT updated.' -ForegroundColor Yellow
  Write-Host '  Run this again - finished files are skipped and only the gaps'
  Write-Host '  are recorded.'
  Write-Host ''
  $env:TTS_KEY = ''
  exit 1
}

# רושם מה נשלח למנוע עבור כל קובץ שקיים עכשיו. בנקודה הזאת כל מה
# שעל הדיסק תואם לחוקים הנוכחיים, ולכן הרישום מדויק — וזה מה
# שמאפשר ל-run-diff-build לדעת בעתיד מה בדיוק השתנה.
node tools/diff-build.js --seed

$env:TTS_KEY = ''

Write-Host ''
Write-Host '  All done.' -ForegroundColor Cyan
foreach ($v in $voices) {
  $dir = Join-Path (Get-Location) ('audio\he\' + $v.folder)
  $count = if (Test-Path $dir) { (Get-ChildItem $dir -Filter *.mp3).Count } else { 0 }
  $mb = if (Test-Path $dir) {
          [math]::Round(((Get-ChildItem $dir -Filter *.mp3 | Measure-Object Length -Sum).Sum / 1MB), 0)
        } else { 0 }
  Write-Host ('    {0,-10} {1,6} files   {2,4} MB' -f $v.folder, $count, $mb)
}
Write-Host ''
