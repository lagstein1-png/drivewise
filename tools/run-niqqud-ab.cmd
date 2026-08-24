@echo off
rem The script writes UTF-8; without this the console decodes it in the
rem old Windows codepage and every Hebrew line arrives as boxes.
chcp 65001 >nul
rem DriveWise dev tool - see run-niqqud-ab.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-niqqud-ab.ps1"
echo.
pause
