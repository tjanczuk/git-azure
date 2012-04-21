@echo off

SET NODE_URL=http://nodejs.org/dist/v0.6.15/node-v0.6.15.msi
SET GIT_URL=http://msysgit.googlecode.com/files/Git-1.7.10-preview20120409.exe

SET THIS=%~dp0
SET POST_SETUP=%THIS%\repo\.git-azure\src\bootstrap\post_setup.cmd
SET GIT="%ProgramFiles%\Git\cmd\git.cmd"

echo %TIME% Downloading prerequisities...
%THIS%\download.exe 300 %NODE_URL% %THIS%\node.msi %GIT_URL% %THIS%\git-setup.exe
if %ERRORLEVEL% NEQ 0 (
   echo %TIME% ERROR downloading prerequisities
   exit /b -1
)
echo %TIME% Prerequisities downloaded

echo %TIME% Installing node.js...
msiexec /i %THIS%\node.msi /q
if %ERRORLEVEL% NEQ 0 (
   echo %TIME% ERROR installing node.js
   exit /b -1
)
echo %TIME% Node.js installed

echo %TIME% Installing GIT...
start /wait %THIS%\git-setup.exe /verysilent
if %ERRORLEVEL% NEQ 0 (
   echo %TIME% ERROR installing GIT
   exit /b -1
)
if NOT EXIST %GIT% (
   echo %TIME% ERROR Unable to find GIT at %GIT%
   exit /b -1
)
echo %TIME% GIT installed

echo %TIME% Cloning branch %REMOTE_BRANCH% from repo %REMOTE_URL%...
call %GIT% clone -b %REMOTE_BRANCH% %REMOTE_URL% %THIS%\repo
if %ERRORLEVEL% NEQ 0 (
   echo %TIME% ERROR Unable to clone branch %REMOTE_BRANCH% from repo %REMOTE_URL%
   exit /b -1
)
echo %TIME% Repo cloned

echo %TIME% Updating submodules...
pushd %THIS%\repo
call %GIT% submodule update --init --recursive
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %TIME% ERROR Updating submodules
   exit /b -1
)
popd
echo %TIME% Submodules updated

if NOT EXIST %POST_SETUP% goto end

echo %TIME% Running post setup from %POST_SETUP%...
call %POST_SETUP%
if %ERRORLEVEL% NEQ 0 (
   echo %TIME% ERROR The post setup failed with %ERRORLEVEL%
   exit /b -1
)
echo %TIME% Post setup finished

:end

exit /b 0