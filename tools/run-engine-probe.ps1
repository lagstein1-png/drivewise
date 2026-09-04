# תאוריה מדברת · מה המנוע בכלל מקבל ממני?
# לוחצים פעמיים על run-engine-probe.cmd שלידו.
#
# חמש קריאות קצרות שמכריעות שלוש שאלות אובייקטיביות: האם ניקוד
# משנה את האודיו, האם הקול הנוכחי מקבל SSML, והאם <phoneme> נאכף.
# פחות מאגורה, ואין צורך באוזן.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  תאוריה מדברת - what does the engine actually receive?' -ForegroundColor Cyan
Write-Host '  -------------------------------------------------'
Write-Host ''
Write-Host '  Five short calls. Decides whether niqqud reaches the engine,'
Write-Host '  whether the current voice accepts SSML, and whether <phoneme>'
Write-Host '  is enforced. Costs a fraction of a cent. No listening needed.'
Write-Host ''

if ($env:TTS_KEY) {
  Write-Host '  Using TTS_KEY from the environment.'
  Write-Host ''
} else {

Write-Host '  Paste your API key and press Enter.'
Write-Host '  Right-click pastes in this window. Ctrl+V does not.'
Write-Host '  Nothing will appear on screen while you paste. That is normal.'
Write-Host ''

# Read-Host waits forever when there is no keyboard - a Run button, a
# pipe, a task runner. It looks like work and is not.
if ([Console]::IsInputRedirected) {
  Write-Host '  No keyboard attached. Run this from a console window.' -ForegroundColor Red
  exit 1
}

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

}   # סוף הענף שמבקש מפתח

node tools/engine-probe.js
$code = $LASTEXITCODE

$env:TTS_KEY = ''
exit $code
