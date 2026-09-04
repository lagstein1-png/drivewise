# תאוריה מדברת · האם ג'מיני מקריא עברית טוב יותר?
# לוחצים פעמיים על run-gemini-probe.cmd שלידו.
#
# ארבעה משפטים אמיתיים מהמאגר, כאלה שנבחרו על המילים שאין להן
# פתרון היום, ולצד כל אחד ההקלטה הקיימת. דף האזנה בסוף.
#
# שים לב: זהו Generative Language API, לא Cloud TTS. ייתכן שהמפתח
# הקיים לא יעבוד עליו, וגם זו תשובה.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  תאוריה מדברת - does Gemini read Hebrew better?' -ForegroundColor Cyan
Write-Host '  -------------------------------------------'
Write-Host ''
Write-Host '  Four real sentences, chosen on the words that have no fix today,'
Write-Host '  each next to the recording already on disk. A page opens at the end.'
Write-Host ''
Write-Host '  This is the Generative Language API, not Cloud TTS. The existing'
Write-Host '  key may not work on it - that is an answer too, not a failure.'
Write-Host ''

if ($env:GEMINI_KEY) {
  Write-Host '  Using GEMINI_KEY from the environment.'
  Write-Host ''
} else {

Write-Host '  Paste your API key and press Enter.'
Write-Host '  Right-click pastes in this window. Ctrl+V does not.'
Write-Host '  Nothing will appear on screen while you paste. That is normal.'
Write-Host ''

if ([Console]::IsInputRedirected) {
  Write-Host '  No keyboard attached. Run this from a console window.' -ForegroundColor Red
  exit 1
}

$secure = Read-Host '  API key' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:GEMINI_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if (-not $env:GEMINI_KEY) {
  Write-Host ''
  Write-Host '  No key entered. Nothing to do.' -ForegroundColor Yellow
  exit 1
}

}   # סוף הענף שמבקש מפתח

node tools/gemini-probe.js
$code = $LASTEXITCODE

$env:GEMINI_KEY = ''

if ($code -eq 0) {
  Write-Host '  Opening the listening page...'
  Start-Process (Join-Path $PSScriptRoot 'samples\gemini\listen.html')
}

exit $code
