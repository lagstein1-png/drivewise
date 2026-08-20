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
Write-Host ('  {0} voices x 6,794 files.  About an hour.' -f $voices.Count)
Write-Host '  Safe to stop and re-run: finished files are skipped.'
Write-Host ''
Write-Host '  Paste your API key and press Enter.'
Write-Host '  Nothing will appear on screen while you paste. That is normal.'
Write-Host ''

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
