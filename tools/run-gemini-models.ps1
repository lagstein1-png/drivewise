# DriveWise · איזה מודל אודיו פתוח עכשיו?
# לוחצים פעמיים על run-gemini-models.cmd שלידו.
#
# בקשה אחת קצרה לכל מודל אודיו בחשבון, וטבלה בסוף: מי פתוח, מי
# חסום על מכסה, ומי לא מקבל בקשות אודיו בכלל.
#
# לכל מודל מכסה נפרדת. זו הדרך המהירה ביותר לעקוף 429 בלי לחכות
# לאישור הגדלה מגוגל.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  DriveWise - which audio model is open right now?' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------'
Write-Host ''
Write-Host '  One short request per model. Costs a fraction of a cent.'
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

node tools/gemini-models.js
$code = $LASTEXITCODE

$env:GEMINI_KEY = ''
exit $code
