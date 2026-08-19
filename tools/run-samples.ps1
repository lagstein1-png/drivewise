# DriveWise · הרצת דגימות קול
# לא מריצים את הקובץ הזה ישירות — לוחצים פעמיים על run-samples.cmd שלידו.
# המפתח נקרא מהמקלדת, מוסתר בזמן ההקלדה, ולא נשמר בשום מקום.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  DriveWise - Google Cloud voice samples' -ForegroundColor Cyan
Write-Host '  ---------------------------------------'
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

Write-Host ''
node tools/tts-build.js sample --provider gcloud

$env:TTS_KEY = ''
Write-Host ''
Write-Host '  Done. The comparison page is at:' -ForegroundColor Cyan
Write-Host ('  ' + (Join-Path (Get-Location) 'tools\samples\gcloud\compare.html'))
Write-Host ''
