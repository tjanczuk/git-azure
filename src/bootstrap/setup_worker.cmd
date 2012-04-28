@echo off

SET NODE_URL=http://nodejs.org/dist/v0.7.0/node-v0.7.0.msi
SET GIT_URL=https://github.com/downloads/tjanczuk/git-azure/minigit-04272012.zip

SET THIS=%~dp0
SET POST_SETUP=%THIS%\repo\.git-azure\src\bootstrap\post_setup.cmd
SET GIT=%THIS%\bin\git.exe

echo %TIME% Downloading prerequisities...
%THIS%\download.exe 300 %NODE_URL% %THIS%\node.msi %GIT_URL% %THIS%\minigit.zip
if %ERRORLEVEL% NEQ 0 (
   echo %TIME% ERROR downloading prerequisities
   exit /b -1
)
echo %TIME% Prerequisities downloaded

echo %TIME% Installing node.js...
msiexec /i %THIS%\node.msi /q
echo %ERRORLEVEL%
if %ERRORLEVEL% NEQ 0 if %ERRORLEVEL% NEQ 1603 (
   echo %TIME% ERROR installing node.js %ERRORLEVEL%
   exit /b -2
)
echo %TIME% Node.js installed

echo %TIME% Installing GIT...
%THIS%\unzip.exe -o %THIS%\minigit.zip -d %THIS%
if %ERRORLEVEL% NEQ 0 (
   echo %TIME% ERROR installing GIT
   exit /b -3
)

set PATH=%THIS%\bin;%PATH%

if NOT EXIST %GIT% (
   echo %TIME% ERROR Unable to find GIT at %GIT%
   exit /b -4
)
echo %TIME% GIT installed

if exist %THIS%\repo\.git goto pull_only

echo %TIME% Cloning branch %REMOTE_BRANCH% from repo %REMOTE_URL%...
%GIT% clone -b %REMOTE_BRANCH% %REMOTE_URL% %THIS%\repo
if %ERRORLEVEL% NEQ 0 (
   echo %TIME% ERROR Unable to clone branch %REMOTE_BRANCH% from repo %REMOTE_URL%
   exit /b -5
)
echo %TIME% Repo cloned

goto update_submodules

:pull_only

echo %TIME% Pulling the repo...
pushd %THIS%\repo
%GIT% reset --hard
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %TIME% ERROR Unable to reset the repository
   exit /b -6
)
%GIT% pull origin %REMOTE_BRANCH%
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %TIME% ERROR Unable to pull the repository
   exit /b -7
)
popd
echo %TIME% Latest repository bits pulled

:update_submodules

echo %TIME% Updating submodules...
pushd %THIS%\repo
%GIT% submodule update --init --recursive
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %TIME% ERROR Updating submodules
   exit /b -8
)
popd
echo %TIME% Submodules updated

if NOT EXIST %POST_SETUP% goto end

echo %TIME% Running post setup from %POST_SETUP%...
call %POST_SETUP%
if %ERRORLEVEL% NEQ 0 (
   echo %TIME% ERROR The post setup failed with %ERRORLEVEL%
   exit /b -9
)
echo %TIME% Post setup finished

:end

exit /b 0