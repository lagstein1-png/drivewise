# תאוריה מדברת · האם ניקוד משפר את ההגייה?
# לוחצים פעמיים על run-niqqud-ab.cmd שלידו.
#
# מייצר 20 קטעים קצרים - עשרה משפטים, כל אחד עם ניקוד ובלי.
# פחות מסנט. בסוף נפתח דף האזנה שמעמיד אותם זה מול זה.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  תאוריה מדברת - does niqqud change the pronunciation?' -ForegroundColor Cyan
Write-Host '  -------------------------------------------------'
Write-Host ''
Write-Host '  10 sentences, each synthesized twice: plain and vocalized.'
Write-Host '  Cost: well under one cent.'
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

node tools/niqqud-ab.js

$env:TTS_KEY = ''

$page = Join-Path (Get-Location) 'tools\samples\niqqud-ab\listen.html'
if (Test-Path $page) {
  Write-Host ''
  Write-Host '  Opening the listening page...' -ForegroundColor Cyan
  Start-Process $page
}
Write-Host ''
