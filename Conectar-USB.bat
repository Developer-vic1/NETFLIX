@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Netflix Local - Conexion y actualizacion USB
echo Netflix Local - Conexion y actualizacion USB
echo Desbloquea tu telefono, conectalo por USB y acepta Depuracion USB.
echo Se pedira confirmar el dispositivo antes de instalar o enviar videos.
echo.
where py >nul 2>nul
if errorlevel 1 goto use_python
py -3 "%~dp0scripts\connect-android.py" %*
set "NETFLIX_RESULT=%ERRORLEVEL%"
goto finished
:use_python
where python >nul 2>nul
if errorlevel 1 goto no_python
python "%~dp0scripts\connect-android.py" %*
set "NETFLIX_RESULT=%ERRORLEVEL%"
goto finished
:no_python
echo No se encuentra Python 3. Instala Python y activa Add Python to PATH.
set "NETFLIX_RESULT=1"
:finished
echo.
if not "%NETFLIX_RESULT%"=="0" echo No se completo la operacion. Revisa el mensaje anterior.
pause
exit /b %NETFLIX_RESULT%
