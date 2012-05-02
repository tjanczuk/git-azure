@echo off

setlocal

SET THIS=%~dp0
SET GIT=%THIS%\bin\git.exe

echo %DATE% %TIME% Resetting the repo...
pushd %THIS%\repo
%GIT% reset --hard
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %DATE% %TIME% ERROR Unable to reset the repository
   exit /b -13
)
echo %DATE% %TIME% Repo reset

echo %DATE% %TIME% Pulling the repo...
%GIT% pull origin %REMOTE_BRANCH%
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %DATE% %TIME% ERROR Unable to pull the repository
   exit /b -14
)
popd
echo %DATE% %TIME% Latest repository bits pulled

echo %DATE% %TIME% Updating submodules...
%GIT% submodule update --init --recursive
if %ERRORLEVEL% NEQ 0 (
   popd
   echo %DATE% %TIME% ERROR Updating submodules
   exit /b -15
)
popd
echo %DATE% %TIME% Submodules updated

endlocal