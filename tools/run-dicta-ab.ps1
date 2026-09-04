# תאוריה מדברת · ניקוד מלא מול חלקי מול חשוף
# לוחצים פעמיים על run-dicta-ab.cmd שלידו.
#
# שמונה משפטים אמיתיים מהמאגר, שלוש גרסאות כל אחד.
# הניקוד המלא מגיע מדיקטה, בחינם ובלי מפתח. רק ההקראה עולה,
# ופחות משני סנט.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  תאוריה מדברת - full vocalization vs partial vs bare' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------'
Write-Host ''
Write-Host '  8 real sentences from the bank, three versions each.'
Write-Host '  Cost: under two cents.'
Write-Host ''
Write-Host '  Paste your API key and press Enter.'
Write-Host '  Nothing will appear on screen while you paste. That is normal.'
Write-Host ''

$secure = Read-Host '  API key' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:TTS_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

if (-not $env:TTS_KEY) {
  Write-Host ''
  Write-Host '  No key entered. Nothing to do.' -ForegroundColor Yellow
  exit 1
}

node tools/dicta-ab.js
$env:TTS_KEY = ''

$page = Join-Path (Get-Location) 'tools\samples\dicta-ab\listen.html'
if (Test-Path $page) {
  Write-Host ''
  Write-Host '  Opening the listening page...' -ForegroundColor Cyan
  Start-Process $page
}
Write-Host ''
