@echo off
cd /d "d:\Work_Area\AI\Claude Code  CN"
echo y | node scripts/release.mjs patch
echo RESULT=%errorlevel%
