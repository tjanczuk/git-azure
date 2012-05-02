@echo off

SET THIS=%~dp0
SET GIT_EXE=%THIS%\bin\git.exe

echo %DATE% %TIME% Entering start_worker.cmd

echo %DATE% %TIME% Starting arr.js runtime
"%programfiles(x86)%\nodejs\"node.exe %THIS%\repo\.git-azure\src\runtime\arr.js -r %THIS%\repo -s %THIS%\sync_repo.cmd
echo %DATE% %TIME% Arr.js runtime terminated with code %ERRORLEVEL%

echo %DATE% %TIME% Killing any remaining node.exe processes...
%THIS%\kill.exe node

echo %DATE% %TIME% Exiting start_worker.cmd