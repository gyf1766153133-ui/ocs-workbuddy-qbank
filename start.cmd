@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title OCS WorkBuddy Question Bank
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
if errorlevel 1 pause
