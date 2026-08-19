# DriveWise · השוואת שלושת הקולות המועמדים על תוכן אמיתי
# לוחצים פעמיים על run-compare-3.cmd שלידו.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  DriveWise - compare 3 voices on real questions' -ForegroundColor Cyan
Write-Host '  ----------------------------------------------'
Write-Host ''
Write-Host '  Aoede  /  Achernar  /  Zephyr'
Write-Host '  12 real sentences from the question bank, in each voice.'
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

$voices = 'he-IL-Chirp3-HD-Aoede,he-IL-Chirp3-HD-Achernar,he-IL-Chirp3-HD-Zephyr'

Write-Host ''
node tools/tts-build.js try --provider gcloud --voices $voices --count 12 --yes

$env:TTS_KEY = ''
Write-Host ''
Write-Host '  Done. Open this file:' -ForegroundColor Cyan
Write-Host ('  ' + (Join-Path (Get-Location) 'tools\samples\try\compare.html'))
Write-Host ''
