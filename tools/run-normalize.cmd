@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ==============================
REM תאוריה מדברת - Normalize + Optional Build + Log
REM ==============================

cd /d C:\Users\joshua\Desktop\theory

if not exist logs mkdir logs

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set TS=%%i
set LOGFILE=logs\fix_build_!TS!.log

echo ============================================== > "!LOGFILE!"
echo תאוריה מדברת Run - !TS! >> "!LOGFILE!"
echo ============================================== >> "!LOGFILE!"

echo.
echo [1/3] Dry-run on data...
call :run_and_log node tools\normalize-dicta.js --dir data --dry-run
if errorlevel 1 goto :error

echo.
echo [2/3] Fixing data in place...
call :run_and_log node tools\normalize-dicta.js --dir data
if errorlevel 1 goto :error

echo.
echo [3/3] Sample check (stdin)...
call :run_and_log cmd /c "echo צֹוֽמֶת מֻוֽתָּר לִנְסֹוֽעַ | node tools\normalize-dicta.js --stdin"
if errorlevel 1 goto :error

echo.
echo ==========================================================
echo   WARNING - read before answering.
echo.
echo   'refresh' does NOT rebuild anything. It DELETES every
echo   recording whose pronunciation differs from the raw text,
echo   and leaves nothing in their place. Recording them again
echo   is a separate hour-long run that needs the API key.
echo.
echo   Answer N unless you are about to run the full recording
echo   round straight afterwards.
echo ==========================================================
echo.
set /p RUNBUILD=Delete recordings so they can be re-recorded? (Y/N): 
echo RUNBUILD=%RUNBUILD%>> "!LOGFILE!"

if /I "%RUNBUILD%"=="Y" goto :build
if /I "%RUNBUILD%"=="N" goto :done

echo Invalid input. Continuing without deleting.
echo Invalid input for RUNBUILD. Continue without build.>> "!LOGFILE!"
goto :done

:build
echo.
echo [Build] node tools/tts-build.js refresh --yes
call :run_and_log node tools/tts-build.js refresh --yes
if errorlevel 1 goto :error

:done
echo.
echo Done.
echo SUCCESS>> "!LOGFILE!"
echo Log saved to: "!LOGFILE!"
pause
exit /b 0

:error
echo.
echo ERROR - see the message above.
echo ERROR>> "!LOGFILE!"
echo Log saved to: "!LOGFILE!"
pause
exit /b 1

:run_and_log
echo -------------------------------------------------->> "!LOGFILE!"
echo COMMAND: %*>> "!LOGFILE!"
echo -------------------------------------------------->> "!LOGFILE!"
%* >> "!LOGFILE!" 2>&1
set ERR=%errorlevel%
echo ExitCode=!ERR!>> "!LOGFILE!"
exit /b !ERR!
