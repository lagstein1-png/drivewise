# תאוריה מדברת · מוחק רק את ההקלטות שהטקסט הנשלח שלהן באמת השתנה
# לוחצים פעמיים על run-diff-build.cmd. לא דורש מפתח ולא עולה כלום.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host ''
Write-Host '  תאוריה מדברת - differential rebuild' -ForegroundColor Cyan
Write-Host '  --------------------------------'
node tools/diff-build.js --apply
Write-Host ''
Write-Host '  Next: run-generate-all.cmd' -ForegroundColor Cyan
Write-Host ''
