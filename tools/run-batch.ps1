# תאוריה מדברת · החלת כל תיקוני ההגייה הממתינים, בסבב אחד
# לוחצים פעמיים על run-batch.cmd. לא דורש מפתח ולא עולה כלום.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host ''
Write-Host '  תאוריה מדברת - apply pending pronunciation fixes' -ForegroundColor Cyan
Write-Host '  ---------------------------------------------'
node tools/pending-fixes.js run-batch --yes
Write-Host ''
