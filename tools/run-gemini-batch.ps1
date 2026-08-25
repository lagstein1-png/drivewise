# DriveWise · אצווה מדודה מול ג'מיני
# לוחצים פעמיים על run-gemini-batch.cmd שלידו, או מריצים אותו עם מספר.
#
# מודד קצב, זמן, נפח ותווים על דגימה פרוסה מהמאגר, וגוזר מזה הערכה
# למאגר המלא. דורש ffmpeg על המחשב — כלי פיתוח, לא חלק מהאפליקציה.
#
# שים לב: זהו Generative Language API, לא Cloud TTS. המפתח הוא
# GEMINI_KEY ואינו זהה לזה של ההקלטות.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

$count = if ($args.Count -ge 1 -and $args[0]) { $args[0] } else { '50' }
$model = if ($args.Count -ge 2 -and $args[1]) { $args[1] } else { '' }

Write-Host ''
Write-Host '  DriveWise - measured batch against Gemini' -ForegroundColor Cyan
Write-Host '  -----------------------------------------'
Write-Host ''
Write-Host ("  Sample size: {0} strings, spread across the whole bank." -f $count)
Write-Host '  Measures rate, time, size and characters, then extrapolates.'
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

node tools/gemini-batch.js $count $model
$code = $LASTEXITCODE

$env:GEMINI_KEY = ''
exit $code
