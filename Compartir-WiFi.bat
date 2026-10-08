@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "PYTHONUTF8=1"
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "scripts\start-wifi.py" %*
    goto completed
)
where python >nul 2>nul
if not errorlevel 1 (
    python "scripts\start-wifi.py" %*
    goto completed
)
echo No se encontro Python 3. Instala Python y activa Agregar Python al PATH.
pause
exit /b 1
:completed
set "NETFLIX_RESULT=%ERRORLEVEL%"
if not "%NETFLIX_RESULT%"=="0" pause
exit /b %NETFLIX_RESULT%
