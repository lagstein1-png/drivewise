# DriveWise · לפני ואחרי תיקון אימות הקריאה
# לוחצים פעמיים על run-mater-ab.cmd שלידו.
#
# שמונה משפטים אמיתיים מהמאגר, שתי גרסאות כל אחד.
# שתי הגרסאות נבנות מקומית מהמטמון. רק ההקראה עולה,
# ופחות משני סנט.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  DriveWise - does the engine want niqqud at all' -ForegroundColor Cyan
Write-Host '  ---------------------------------------------'
Write-Host ''
Write-Host '  8 real sentences, three versions: bare, last night, fixed.'
Write-Host '  Cost: about one cent.'
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

node tools/mater-ab.js
$env:TTS_KEY = ''

$page = Join-Path (Get-Location) 'tools\samples\mater-ab\listen.html'
if (Test-Path $page) {
  Write-Host ''
  Write-Host '  Opening the listening page...' -ForegroundColor Cyan
  Start-Process $page
}
Write-Host ''
