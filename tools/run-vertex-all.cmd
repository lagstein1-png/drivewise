@echo off
rem The script writes UTF-8; without this the console decodes it in the
rem old Windows codepage and every Hebrew line arrives as boxes.
chcp 65001 >nul
rem DriveWise dev tool - see run-vertex-all.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-vertex-all.ps1" %1 %2 %3
echo.
pause
