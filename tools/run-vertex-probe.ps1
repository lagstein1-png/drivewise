# תאוריה מדברת · האם Vertex מגיש את מודלי ההקראה?
# לוחצים פעמיים על run-vertex-probe.cmd שלידו.
#
# שש בקשות של שתי מילים — שלושה מודלים על שני אזורים — כדי לדעת אם
# אפשר בכלל לייצר דרך Vertex. מי שעונה נשמר כקובץ WAV להאזנה.
#
# אין כאן מפתח API. האימות הוא הטוקן של gcloud, ולכן אין מה לדלוף
# בצילום מסך.
#
# ארגומנט אופציונלי: מזהה פרויקט. בלעדיו נלקח מ-gcloud config.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

$proj = if ($args.Count -ge 1 -and $args[0]) { $args[0] } else { '' }

Write-Host ''
Write-Host '  תאוריה מדברת - does Vertex serve the speech models?' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------'
Write-Host ''
Write-Host '  Six two-word requests. No API key - authentication is the'
Write-Host '  gcloud token already on this machine.'
Write-Host ''
Write-Host '  If gcloud is not installed:  winget install Google.CloudSDK'
Write-Host '  If it is installed but not signed in:  gcloud auth login'
Write-Host ''

node tools/vertex-probe.js $proj
$code = $LASTEXITCODE

if ($code -eq 0 -and (Test-Path 'tools\samples\vertex')) {
  Write-Host '  Opening the folder with the clips...'
  Start-Process (Resolve-Path 'tools\samples\vertex')
}

exit $code
