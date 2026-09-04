# תאוריה מדברת · הקלטת קול שלם דרך Vertex
# לוחצים פעמיים על run-vertex-all.cmd שלידו.
#
#   run-vertex-all.cmd [קול] [מודל] [פרויקט]
#   ברירת מחדל: Kore · gemini-3.1-flash-tts-preview · הפרויקט של gcloud
#
# נכתב לתיקיית הביניים audio/he/gemini — אותה תיקייה שהצ'יפ באפליקציה
# מחכה לה, ושכבר יש בה 200 קבצים מהמסלול הקודם. מה שקיים מדולג.
#
# אין מפתח API. האימות הוא הטוקן של gcloud, והוא נשלף מחדש לבד
# במהלך הריצה. בטוח לעצור ולהריץ שוב.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

$voice = if ($args.Count -ge 1 -and $args[0]) { $args[0] } else { 'Kore' }
$model = if ($args.Count -ge 2 -and $args[1]) { $args[1] } else { 'gemini-3.1-flash-tts-preview' }
if ($args.Count -ge 3 -and $args[2]) { $env:VERTEX_PROJECT = $args[2] }

$env:GEMINI_MODEL = $model

Write-Host ''
Write-Host '  תאוריה מדברת - record one full voice through Vertex' -ForegroundColor Cyan
Write-Host '  -----------------------------------------------'
Write-Host ''
Write-Host ("  Voice: {0}   Model: {1}" -f $voice, $model)
Write-Host '  Writes to audio/he/gemini. Finished files are skipped, so'
Write-Host '  stopping and running again costs nothing.'
Write-Host ''
Write-Host '  No API key. Authentication is the gcloud token on this machine.'
Write-Host '  Needs ffmpeg on PATH.'
Write-Host ''

node tools/tts-build.js all --provider vertex --voice $voice --as gemini --yes
$code = $LASTEXITCODE

Write-Host ''
Write-Host '  Counting what is present...' -ForegroundColor Cyan
node tools/tts-build.js verify --lang he

exit $code
