@echo off
cd /d "%~dp0"
if exist "Netflix.exe" (
  start "" "Netflix.exe"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\build-launcher.ps1"
  if exist "Netflix.exe" start "" "Netflix.exe"
)
