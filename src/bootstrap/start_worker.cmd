@echo off

SET THIS=%~dp0

echo %DATE% %TIME% Starting arr.js runtime
"%programfiles(x86)%\nodejs\"node.exe %THIS%\repo\.git-azure\src\runtime\arr.js -r %THIS%\repo
echo %DATE% %TIME% Arr.js runtime terminated with code %ERRORLEVEL%