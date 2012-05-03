@echo off

echo %DATE% %TIME% Entering setup_worker.cmd

SET NODE_URL=http://nodejs.org/dist/v0.7.8/node-v0.7.8.msi
SET GIT_URL=https://github.com/downloads/tjanczuk/git-azure/minigit-04272012.zip

SET THIS=%~dp0
SET POST_SETUP=%THIS%\repo\.git-azure\src\bootstrap\post_setup.cmd
SET GIT=%THIS%\bin\git.exe

echo %DATE% %TIME% Granting permissions for all users to the deployment directory...
icacls %THIS% /grant "Users":(OI)(CI)F
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR Granting permission
   exit /b -9
)
echo %DATE% %TIME% Permissions granted

echo %DATE% %TIME% Downloading prerequisities...
%THIS%\download.exe 300 %NODE_URL% %THIS%\node.msi %GIT_URL% %THIS%\minigit.zip
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR downloading prerequisities
   exit /b -1
)
echo %DATE% %TIME% Prerequisities downloaded

echo %DATE% %TIME% Installing node.js...
msiexec /i %THIS%\node.msi /q
echo %ERRORLEVEL%
if %ERRORLEVEL% NEQ 0 if %ERRORLEVEL% NEQ 1603 (
   echo %DATE% %TIME% ERROR installing node.js %ERRORLEVEL%
   exit /b -2
)
echo %DATE% %TIME% Node.js installed

echo %DATE% %TIME% Installing GIT...
%THIS%\unzip.exe -o %THIS%\minigit.zip -d %THIS%
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR installing GIT
   exit /b -3
)

set PATH=%THIS%\bin;%PATH%

if NOT EXIST %GIT% (
   echo %DATE% %TIME% ERROR Unable to find GIT at %GIT%
   exit /b -4
)
echo %DATE% %TIME% GIT installed

if exist %THIS%\repo\.git goto pull_only

echo %DATE% %TIME% Cloning branch %REMOTE_BRANCH% from repo %REMOTE_URL%...
%GIT% clone -b %REMOTE_BRANCH% %REMOTE_URL% %THIS%\repo
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR Unable to clone branch %REMOTE_BRANCH% from repo %REMOTE_URL%
   exit /b -5
)
echo %DATE% %TIME% Repo cloned

echo %DATE% %TIME% Updating submodules...
pushd %THIS%\repo
%GIT% submodule update --init --recursive
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %DATE% %TIME% ERROR Updating submodules
   exit /b -6
)
popd
echo %DATE% %TIME% Submodules updated

goto post_setup

:pull_only

call %THIS%\sync_repo.cmd
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%

:post_setup

if NOT EXIST %POST_SETUP% goto end

echo %DATE% %TIME% Running post setup from %POST_SETUP%...
call %POST_SETUP%
if %ERRORLEVEL% NEQ 0 (
   echo %DATE% %TIME% ERROR The post setup failed with %ERRORLEVEL%
   exit /b -8
)
echo %DATE% %TIME% Post setup finished

:end

echo %DATE% %TIME% Exiting setup_worker.cmd (success)

exit /b 0