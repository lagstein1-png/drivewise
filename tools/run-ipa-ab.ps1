# תאוריה מדברת · האם ה-IPA באמת נאמר?
# לוחצים פעמיים על run-ipa-ab.cmd שלידו.
#
# ארבע הקלטות של המילה "מותר" - שני מודלים, שני IPA הפוכים - ודף האזנה
# שמעמיד אותן זו מול זו. פחות מאגורה.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host '  תאוריה מדברת - is the IPA actually spoken?' -ForegroundColor Cyan
Write-Host '  ---------------------------------------'
Write-Host ''
Write-Host '  Four clips: one word, two models, deliberately opposite IPA.'
Write-Host '  A listening page opens at the end. Costs a fraction of a cent.'
Write-Host ''

if ($env:TTS_KEY) {
  Write-Host '  Using TTS_KEY from the environment.'
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

node tools/ipa-ab.js
$code = $LASTEXITCODE

$env:TTS_KEY = ''

if ($code -eq 0) {
  Write-Host '  Opening the listening page...'
  Start-Process (Join-Path $PSScriptRoot 'samples\ipa-ab\listen.html')
}

exit $code
