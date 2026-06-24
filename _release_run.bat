@echo off
cd /d "%~dp0"
node scripts\release.mjs minor < _answers.txt
set _EXIT=%errorlevel%
exit /b %_EXIT%
