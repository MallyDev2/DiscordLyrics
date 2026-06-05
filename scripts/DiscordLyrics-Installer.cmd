@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "LOCAL_APP=%SCRIPT_DIR%DiscordLyrics-Installer.exe"
set "TEMP_DIR=%TEMP%\DiscordLyricsInstaller"
set "TEMP_APP=%TEMP_DIR%\DiscordLyrics-Installer.exe"
set "TEMP_ENGINE=%TEMP_DIR%\DiscordLyrics-Installer.ps1"
set "BASE_URL=https://github.com/MallyDev2/DiscordLyrics/releases/latest/download"

if exist "%LOCAL_APP%" (
    start "" "%LOCAL_APP%" %*
    exit /b 0
)

if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%" >nul 2>nul
mkdir "%TEMP_DIR%" >nul 2>nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%BASE_URL%/DiscordLyrics-Installer.exe' -OutFile '%TEMP_APP%'; Invoke-WebRequest -UseBasicParsing -Uri '%BASE_URL%/DiscordLyrics-Installer.ps1' -OutFile '%TEMP_ENGINE%' } catch { exit 1 }"
if errorlevel 1 exit /b 1

start "" "%TEMP_APP%" %*
exit /b 0
