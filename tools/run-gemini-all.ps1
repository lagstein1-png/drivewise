# DriveWise · הקלטת קול שלם עם ג'מיני
# לוחצים פעמיים על run-gemini-all.cmd שלידו.
#
# נכתב לתיקיית ביניים audio/he/gemini ולא לתוך aoede, וזאת בכוונה:
# 'all' מדלג על קבצים קיימים, ולכן כתיבה ישירה ל-aoede הייתה מחייבת
# למחוק אותו קודם — ואם ההרצה נקטעת באמצע, נשאר קול אחד שחציו
# Chirp3 וחציו ג'מיני, בלי דרך לדעת מי מי.
#
# כשהתיקייה תהיה שלמה, ההחלפה היא שתי פקודות rename ואפשר לחזור
# ממנה. עד אז האפליקציה לא נוגעת בה בכלל.
#
# בטוח לעצור ולהריץ שוב: מה שהוקלט כבר מדולג.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

$voice = if ($args.Count -ge 1 -and $args[0]) { $args[0] } else { 'Kore' }

Write-Host ''
Write-Host '  DriveWise - record one full voice with Gemini' -ForegroundColor Cyan
Write-Host '  ---------------------------------------------'
Write-Host ''
Write-Host ("  Voice: {0}   ->  audio/he/gemini  (a staging folder)" -f $voice)
Write-Host '  6,823 strings. The preview model is capped near 5 requests a'
Write-Host '  minute, so expect this to run for many hours. That is fine:'
Write-Host '  stop it whenever you like and run it again - finished files'
Write-Host '  are skipped and it picks up where it left off.'
Write-Host ''
Write-Host '  Needs ffmpeg on PATH. Nothing here touches the app.'
Write-Host ''

if ($env:GEMINI_KEY) {
  Write-Host '  Using GEMINI_KEY from the environment.'
  Write-Host ''
} else {

Write-Host '  Paste your Gemini API key and press Enter.'
Write-Host '  Right-click pastes in this window. Ctrl+V does not.'
Write-Host '  Nothing will appear on screen while you paste. That is normal.'
Write-Host ''

if ([Console]::IsInputRedirected) {
  Write-Host '  No keyboard attached. Run this from a console window.' -ForegroundColor Red
  exit 1
}

$secure = Read-Host '  API key' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:GEMINI_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if (-not $env:GEMINI_KEY) {
  Write-Host ''
  Write-Host '  No key entered. Nothing to do.' -ForegroundColor Yellow
  exit 1
}

}   # סוף הענף שמבקש מפתח

node tools/tts-build.js all --provider gemini --voice $voice --as gemini --yes
$code = $LASTEXITCODE

Write-Host ''
Write-Host '  Counting what is present...' -ForegroundColor Cyan
node tools/tts-build.js verify --lang he

$env:GEMINI_KEY = ''
exit $code
