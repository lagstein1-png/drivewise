# DriveWise · מחיקת ההקלטות שההגייה שלהן תוקנה
# לוחצים פעמיים על run-refresh.cmd שלידו. לא דורש מפתח ולא עולה כלום.
#
# אחרי זה מריצים run-generate-all.cmd, שייצר מחדש רק את מה שנמחק.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  DriveWise - clear recordings whose pronunciation changed' -ForegroundColor Cyan
Write-Host '  --------------------------------------------------------'
Write-Host ''

node tools/tts-build.js refresh --yes

Write-Host ''
Write-Host '  Next: run-generate-all.cmd  (it will rebuild only what was removed)' -ForegroundColor Cyan
Write-Host ''
