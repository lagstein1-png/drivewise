# תאוריה מדברת · בדיקת שלמות קבצי ההקראה
# לוחצים פעמיים על run-verify.cmd שלידו. לא דורש מפתח ולא עולה כלום.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  תאוריה מדברת - check the generated recordings' -ForegroundColor Cyan
Write-Host '  ------------------------------------------'
Write-Host ''

node tools/tts-build.js verify

Write-Host ''
